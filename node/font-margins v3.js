#!/usr/bin/env node
/**
 * font-margins.js
 *
 * Berechnet für jeden Font in ./fonts:
 *   1. Seitliche Abstände (Margins) jedes Zeichens in N Höhenzonen
 *      → ./margins/<fontname>.json
 *   2. Konturabstand jedes Zeichenpaares pro Höhenzone
 *      → ./pairs/<fontname>.json
 *   3. Kerning-Korrekturwerte relativ zum Basiswert "n"+"n"
 *      → ./kerning/<fontname>.csv   Format: "A;B;-22"
 *
 * Verwendung:
 *   node font-margins.js [zonen]
 *
 * Beispiel:
 *   node font-margins.js 9
 *
 * Abhängigkeit:
 *   npm install opentype.js
 */

const fs       = require("fs");
const path     = require("path");
const opentype = require("opentype.js");

// ─── Konfiguration ────────────────────────────────────────────────────────────

const FONTS_DIR   = path.resolve("./fonts");
const MARGINS_DIR = path.resolve("./margins");
const PAIRS_DIR   = path.resolve("./pairs");
const KERNING_DIR = path.resolve("./kerning");
const ZONES       = parseInt(process.argv[2] ?? "9", 10);

// Glyph-Name des Referenzbuchstabens für den Basiswert (n+n)
const BASELINE_GLYPH = "n";

if (isNaN(ZONES) || ZONES < 1) {
  console.error("Fehler: Zonenanzahl muss eine positive Ganzzahl sein.");
  process.exit(1);
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/** Rundet auf eine Nachkommastelle */
function round1(v) {
  return Math.round(v * 10) / 10;
}

/** Rundet auf ganze Zahl (für Kerning-Korrekturwert) */
function roundInt(v) {
  return Math.round(v);
}

/** Kubische Bézier bei t */
function cubicBezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt, t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

/** Quadratische Bézier bei t */
function quadBezierPoint(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/**
 * Zerlegt einen opentype-Pfad in gesampelte Koordinaten.
 * Gibt Array von {x, y} in opentype-Koordinaten zurück (Y nach unten).
 */
function samplePath(opentypePath, samples = 64) {
  const points = [];
  let cx = 0, cy = 0;
  let sx = 0, sy = 0;

  for (const cmd of opentypePath.commands) {
    switch (cmd.type) {
      case "M":
        cx = cmd.x; cy = cmd.y;
        sx = cx;    sy = cy;
        points.push({ x: cx, y: cy });
        break;
      case "L":
        points.push({ x: cmd.x, y: cmd.y });
        cx = cmd.x; cy = cmd.y;
        break;
      case "Q": {
        const p0 = { x: cx,     y: cy };
        const p1 = { x: cmd.x1, y: cmd.y1 };
        const p2 = { x: cmd.x,  y: cmd.y };
        for (let i = 1; i <= samples; i++)
          points.push(quadBezierPoint(p0, p1, p2, i / samples));
        cx = cmd.x; cy = cmd.y;
        break;
      }
      case "C": {
        const p0 = { x: cx,     y: cy };
        const p1 = { x: cmd.x1, y: cmd.y1 };
        const p2 = { x: cmd.x2, y: cmd.y2 };
        const p3 = { x: cmd.x,  y: cmd.y };
        for (let i = 1; i <= samples; i++)
          points.push(cubicBezierPoint(p0, p1, p2, p3, i / samples));
        cx = cmd.x; cy = cmd.y;
        break;
      }
      case "Z":
        points.push({ x: sx, y: sy });
        cx = sx; cy = sy;
        break;
    }
  }
  return points;
}

/**
 * Berechnet Margin-Arrays (links & rechts) für ein Glyph über alle Zonen.
 * Y wird invertiert (fontY = -opentypeY), damit Zone 0 am Schriftfuß liegt.
 */
function computeGlyphMargins(glyph, upm, zones, yBottom, yTop) {
  const advanceWidth = glyph.advanceWidth ?? 0;
  const zoneHeight   = (yTop - yBottom) / zones;

  const rawPath = glyph.getPath(0, 0, upm);
  const fpts    = samplePath(rawPath, 64).map(p => ({ x: p.x, y: -p.y }));

  const leftMargins  = [];
  const rightMargins = [];

  for (let z = 0; z < zones; z++) {
    const zMin   = yBottom + z * zoneHeight;
    const zMax   = zMin + zoneHeight;
    const inZone = fpts.filter(p => p.y >= zMin && p.y < zMax);

    if (inZone.length === 0) {
      leftMargins.push(-1);
      rightMargins.push(-1);
    } else {
      const xMin = Math.min(...inZone.map(p => p.x));
      const xMax = Math.max(...inZone.map(p => p.x));
      leftMargins.push(round1(xMin));
      rightMargins.push(round1(advanceWidth - xMax));
    }
  }

  let unicode = null;
  if (glyph.unicodes && glyph.unicodes.length > 0) unicode = glyph.unicodes[0];

  return { left: leftMargins, right: rightMargins, advanceWidth, unicode };
}

// ─── Paar-Abstand ─────────────────────────────────────────────────────────────

/**
 * gap[z] = right_A[z] + left_B[z]
 * Beide -1 → -1. Nur eine Seite -1 → Wert der anderen Seite (0-Beitrag).
 */
function computePairGaps(rightA, leftB) {
  return rightA.map((rA, z) => {
    const lB = leftB[z];
    if (rA === -1 && lB === -1) return -1;
    const a = rA === -1 ? 0 : rA;
    const b = lB === -1 ? 0 : lB;
    return round1(a + b);
  });
}

// ─── Mittelwert gültiger Zonen ────────────────────────────────────────────────

/**
 * Berechnet den Mittelwert aller Zonen eines gap-Arrays, die in BEIDEN
 * Quell-Arrays (rightA und leftB) gültig sind, d.h. keiner der beiden
 * Ausgangswerte darf -1 sein.
 *
 * Gibt { mean, validZones } zurück oder null wenn keine gültige Zone existiert.
 *
 * @param {number[]} rightA   right-Margin-Array von Zeichen A
 * @param {number[]} leftB    left-Margin-Array von Zeichen B
 * @returns {{ mean: number, validZones: number } | null}
 */
function validZoneMean(rightA, leftB) {
  let sum        = 0;
  let validZones = 0;

  for (let z = 0; z < rightA.length; z++) {
    // Beide Seiten müssen gültig sein (≠ -1)
    if (rightA[z] !== -1 && leftB[z] !== -1) {
      sum += rightA[z] + leftB[z];
      validZones++;
    }
  }

  if (validZones === 0) return null;
  return { mean: sum / validZones, validZones };
}

// ─── Font verarbeiten ─────────────────────────────────────────────────────────

async function processFont(fontPath) {
  console.log(`  Lade: ${path.basename(fontPath)}`);
  const font = opentype.loadSync(fontPath);
  const upm  = font.unitsPerEm;

  // Zonengrenzen aus Font-Metriken
  let yBottom = -(upm * 0.2);
  let yTop    =   upm * 0.8;

  if (font.tables?.os2) {
    const os2 = font.tables.os2;
    if (os2.sTypoDescender !== undefined) yBottom = os2.sTypoDescender;
    if (os2.sTypoAscender  !== undefined) yTop    = os2.sTypoAscender;
  } else if (font.tables?.hhea) {
    const hhea = font.tables.hhea;
    if (hhea.descender !== undefined) yBottom = hhea.descender;
    if (hhea.ascender  !== undefined) yTop    = hhea.ascender;
  }

  const zoneHeight = (yTop - yBottom) / ZONES;

  const sharedMeta = {
    fontName:   font.names?.fullName?.en ?? path.basename(fontPath),
    file:       path.basename(fontPath),
    upm,
    zones:      ZONES,
    zoneHeight: round1(zoneHeight),
    yBottom:    round1(yBottom),
    yTop:       round1(yTop),
  };

  // ── 1. Margins pro Glyph ────────────────────────────────────────────────────

  const marginsResult    = { meta: sharedMeta, glyphs: {} };
  const glyphMarginCache = {};   // glyphKey → { left, right, char }

  for (const key of Object.keys(font.glyphs.glyphs)) {
    const glyph = font.glyphs.glyphs[key];
    if (!glyph.path || glyph.path.commands.length === 0) continue;

    const { left, right, advanceWidth, unicode } =
      computeGlyphMargins(glyph, upm, ZONES, yBottom, yTop);

    const glyphKey = glyph.name ?? `glyph_${key}`;

    // Zeichen-Darstellung für CSV-Ausgabe ermitteln:
    // bevorzugt Unicode-Zeichen, sonst Glyph-Name
    const charLabel = unicode !== null
      ? String.fromCodePoint(unicode)
      : (glyph.name ?? glyphKey);

    marginsResult.glyphs[glyphKey] = {
      name:        glyph.name ?? glyphKey,
      unicode,
      unicodeHex:  unicode !== null
                     ? `U+${unicode.toString(16).toUpperCase().padStart(4, "0")}`
                     : null,
      char:        unicode !== null ? charLabel : null,
      advanceWidth,
      left,
      right,
    };

    glyphMarginCache[glyphKey] = { left, right, charLabel };
  }

  // ── 2. Basiswert: Paar n+n ──────────────────────────────────────────────────

  const nGlyph = glyphMarginCache[BASELINE_GLYPH];

  if (!nGlyph) {
    console.warn(`  ⚠ Glyph "${BASELINE_GLYPH}" nicht gefunden – Kerning wird übersprungen.`);
    return { marginsResult, pairsResult: null, kerningLines: null, baseValue: null };
  }

  const baseResult = validZoneMean(nGlyph.right, nGlyph.left);

  if (!baseResult) {
    console.warn(`  ⚠ Keine gültigen Zonen für "${BASELINE_GLYPH}"+"${BASELINE_GLYPH}" – Kerning wird übersprungen.`);
    return { marginsResult, pairsResult: null, kerningLines: null, baseValue: null };
  }

  const baseValue = baseResult.mean;

  console.log(
    `     Basiswert "${BASELINE_GLYPH}"+"${BASELINE_GLYPH}": ` +
    `${round1(baseValue)} ` +
    `(${baseResult.validZones} gültige Zone${baseResult.validZones !== 1 ? "n" : ""})`
  );

  // ── 3. Paar-Abstände + Kerning-Korrekturwerte ───────────────────────────────

  const glyphKeys  = Object.keys(glyphMarginCache);
  const glyphCount = glyphKeys.length;
  const pairCount  = glyphCount * glyphCount;

  console.log(`     ${glyphCount} Zeichen → ${pairCount.toLocaleString()} Paare …`);

  const pairsResult = {
    meta: {
      ...sharedMeta,
      glyphCount,
      pairCount,
      baseValue:   round1(baseValue),
      baseGlyph:   BASELINE_GLYPH,
      description:
        "gap[z] = right_A[z] + left_B[z]. " +
        "Abstand zwischen den Konturen in Höhenzone z. " +
        "-1: kein Konturinhalt in dieser Zone auf beiden Seiten.",
    },
    pairs: {},
  };

  // CSV-Zeilen für Kerning-Datei
  const kerningLines = [];

  for (const keyA of glyphKeys) {
    const { right: rightA, charLabel: charA } = glyphMarginCache[keyA];
    pairsResult.pairs[keyA] = {};

    for (const keyB of glyphKeys) {
      const { left: leftB, charLabel: charB } = glyphMarginCache[keyB];

      // Gap-Array für pairs.json
      pairsResult.pairs[keyA][keyB] = computePairGaps(rightA, leftB);

      // Mittelwert nur über Zonen, in denen BEIDE Seiten gültig sind
      const pairResult = validZoneMean(rightA, leftB);

      if (pairResult !== null) {
        // Korrekturwert: wie weit weicht dieses Paar vom Sollabstand ab?
        // Negativ = Zeichen stehen zu weit auseinander → enger rücken
        // Positiv = Zeichen stehen zu eng              → weiter rücken
        const correction = roundInt(pairResult.mean - baseValue);
        kerningLines.push(`${charA};${charB};${correction}`);
      }
      // Paare ohne einzige gültige Zone werden weggelassen
    }
  }

  return { marginsResult, pairsResult, kerningLines, baseValue };
}

// ─── Einstiegspunkt ───────────────────────────────────────────────────────────

async function main() {
  for (const dir of [MARGINS_DIR, PAIRS_DIR, KERNING_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const fontFiles = fs.readdirSync(FONTS_DIR).filter(f =>
    /\.(ttf|otf)$/i.test(f)
  );

  if (fontFiles.length === 0) {
    console.error(`Keine TTF/OTF-Dateien in ${FONTS_DIR} gefunden.`);
    process.exit(1);
  }

  console.log(`\nFont-Margins, Pair-Gaps & Kerning`);
  console.log(`Zonen: ${ZONES}  |  Fonts: ${fontFiles.length}\n`);

  for (const fontFile of fontFiles) {
    const fontPath   = path.join(FONTS_DIR, fontFile);
    const baseName   = path.basename(fontFile, path.extname(fontFile));
    const marginOut  = path.join(MARGINS_DIR, baseName + ".json");
    const pairsOut   = path.join(PAIRS_DIR,   baseName + ".json");
    const kerningOut = path.join(KERNING_DIR, baseName + ".csv");

    try {
      const { marginsResult, pairsResult, kerningLines, baseValue } =
        await processFont(fontPath);

      const glyphCount = Object.keys(marginsResult.glyphs).length;

      // Margins immer schreiben
      fs.writeFileSync(marginOut, JSON.stringify(marginsResult, null, 2), "utf8");
      console.log(`  ✓ margins/${baseName}.json   (${glyphCount} Zeichen)`);

      // Pairs & Kerning nur wenn Basiswert ermittelt werden konnte
      if (pairsResult) {
        ////fs.writeFileSync(pairsOut, JSON.stringify(pairsResult, null, 2), "utf8");
        console.log(`  ✓ pairs/${baseName}.json     (${(glyphCount * glyphCount).toLocaleString()} Paare)`);
      }

      if (kerningLines) {
        // Header-Zeile voranstellen
        const csvContent =
          `# Kerning-Korrekturwerte | Font: ${baseName} | Basiswert (n+n): ${round1(baseValue)} | Zonen: ${ZONES}\n` +
          `# Format: LinkerBuchstabe;RechterBuchstabe;Korrekturwert\n` +
          `# Negativ = enger setzen, Positiv = weiter setzen\n` +
          kerningLines.join("\n") + "\n";

        fs.writeFileSync(kerningOut, csvContent, "utf8");
        console.log(`  ✓ kerning/${baseName}.csv    (${kerningLines.length.toLocaleString()} Einträge)\n`);
      }

    } catch (err) {
      console.error(`  ✗ Fehler bei ${fontFile}: ${err.message}\n`);
      console.error(err.stack);
    }
  }

  console.log("Fertig.");
  console.log(`  Margins → ./margins/`);
  console.log(`  Pairs   → ./pairs/`);
  console.log(`  Kerning → ./kerning/`);
}

main();