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
 *      → ./kerning/<fontname>.csv   Format: "A;B;-22 (z0:val,z2:val,...)"
 *
 * Berechnung Kerning-Mittelwert für ein Paar (A, B):
 *   - Pro Zone z: Zonenwert = right_A[z] + left_B[z]
 *   - Eine Zone ist NUR gültig wenn right_A[z] ≠ -1 UND left_B[z] ≠ -1
 *   - Durchschnitt = Summe der gültigen Zonenwerte / Anzahl gültiger Zonen
 *   - Korrektur = round(paarDurchschnitt − basisDurchschnitt)
 *
 * Verwendung:
 *   node font-margins.js [zonen]
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
const BASELINE_GLYPH = "n";   // Referenzzeichen für den Basiswert

if (isNaN(ZONES) || ZONES < 1) {
  console.error("Fehler: Zonenanzahl muss eine positive Ganzzahl sein.");
  process.exit(1);
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function round1(v)   { return Math.round(v * 10) / 10; }
function roundInt(v) { return Math.round(v); }

function cubicBezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t, mt2 = mt * mt, t2 = t * t;
  return {
    x: mt2*mt*p0.x + 3*mt2*t*p1.x + 3*mt*t2*p2.x + t2*t*p3.x,
    y: mt2*mt*p0.y + 3*mt2*t*p1.y + 3*mt*t2*p2.y + t2*t*p3.y,
  };
}

function quadBezierPoint(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: mt*mt*p0.x + 2*mt*t*p1.x + t*t*p2.x,
    y: mt*mt*p0.y + 2*mt*t*p1.y + t*t*p2.y,
  };
}

function samplePath(opentypePath, samples = 64) {
  const points = [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  for (const cmd of opentypePath.commands) {
    switch (cmd.type) {
      case "M":
        cx = cmd.x; cy = cmd.y; sx = cx; sy = cy;
        points.push({ x: cx, y: cy });
        break;
      case "L":
        points.push({ x: cmd.x, y: cmd.y });
        cx = cmd.x; cy = cmd.y;
        break;
      case "Q": {
        const p0={x:cx,y:cy}, p1={x:cmd.x1,y:cmd.y1}, p2={x:cmd.x,y:cmd.y};
        for (let i=1; i<=samples; i++) points.push(quadBezierPoint(p0,p1,p2,i/samples));
        cx=cmd.x; cy=cmd.y; break;
      }
      case "C": {
        const p0={x:cx,y:cy}, p1={x:cmd.x1,y:cmd.y1}, p2={x:cmd.x2,y:cmd.y2}, p3={x:cmd.x,y:cmd.y};
        for (let i=1; i<=samples; i++) points.push(cubicBezierPoint(p0,p1,p2,p3,i/samples));
        cx=cmd.x; cy=cmd.y; break;
      }
      case "Z":
        points.push({ x: sx, y: sy }); cx=sx; cy=sy; break;
    }
  }
  return points;
}

/**
 * Berechnet left[] und right[] Margin-Arrays für ein Glyph.
 * Y invertiert: Zone 0 = Schriftfuß, Zone N-1 = Kopf.
 */
function computeGlyphMargins(glyph, upm, zones, yBottom, yTop) {
  const advanceWidth = glyph.advanceWidth ?? 0;
  const zoneHeight   = (yTop - yBottom) / zones;
  const rawPath      = glyph.getPath(0, 0, upm);
  const fpts         = samplePath(rawPath, 16).map(p => ({ x: p.x, y: -p.y }));   ///

  const left = [], right = [];

  for (let z = 0; z < zones; z++) {
    const zMin   = yBottom + z * zoneHeight;
    const zMax   = zMin + zoneHeight;
    const inZone = fpts.filter(p => p.y >= zMin && p.y < zMax);

    if (inZone.length === 0) {
      left.push(-1);
      right.push(-1);
    } else {
      const xMin = Math.min(...inZone.map(p => p.x));
      const xMax = Math.max(...inZone.map(p => p.x));
      left.push(round1(xMin));
      right.push(round1(advanceWidth - xMax));
    }
  }

  let unicode = null;
  if (glyph.unicodes?.length > 0) unicode = glyph.unicodes[0];

  return { left, right, advanceWidth, unicode };
}

// ─── Paar-Gap pro Zone ────────────────────────────────────────────────────────

/**
 * Berechnet gap[z] = right_A[z] + left_B[z] für jede Zone.
 * Ist einer der beiden Werte -1, ist die Zone UNGÜLTIG → gap[z] = -1.
 * (Für pairs.json – streng: nur beide gültig ergibt einen Wert.)
 */
function computePairGaps(rightA, leftB) {
  return rightA.map((rA, z) => {
    const lB = leftB[z];
    if (rA === -1 || lB === -1) return -1;   // streng: BEIDE müssen gültig sein
    return round1(rA + lB);
  });
}

// ─── Mittelwert & Kontrollwerte ───────────────────────────────────────────────

/**
 * Berechnet den Durchschnitt eines Paares über alle Zonen,
 * in denen BEIDE Seiten gültig sind (≠ -1).
 *
 * Rückgabe:
 *   {
 *     mean:        Durchschnittswert (Summe / Anzahl gültiger Zonen),
 *     validCount:  Anzahl berücksichtigter Zonen,
 *     zoneValues:  Array der gültigen Einzelwerte mit Index,
 *                  z.B. [{z:1, rA:45.2, lB:38.1, sum:83.3}, ...]
 *   }
 *   oder null wenn keine gültige Zone vorhanden.
 *
 * @param {number[]} rightA  right-Margin-Array von Zeichen A
 * @param {number[]} leftB   left-Margin-Array von Zeichen B
 */
function pairMean(rightA, leftB) {
  const zoneValues = [];
  let sum = 0;

  for (let z = 0; z < rightA.length; z++) {
    const rA = rightA[z];
    const lB = leftB[z];

    // Zone nur gültig wenn BEIDE Seiten einen echten Wert haben
    if (rA === -1 || lB === -1) continue;

    const zoneSum = rA + lB;
    sum += zoneSum;
    zoneValues.push({ z, rA, lB, sum: round1(zoneSum) });
  }

  if (zoneValues.length === 0) return null;

  return {
    mean:       sum / zoneValues.length,
    validCount: zoneValues.length,
    zoneValues,
  };
}

// ─── Font verarbeiten ─────────────────────────────────────────────────────────

async function processFont(fontPath) {
  console.log(`  Lade: ${path.basename(fontPath)}`);
  const font = opentype.loadSync(fontPath);
  const upm  = font.unitsPerEm;

  let yBottom = -(upm * 0.2);
  let yTop    =   upm * 0.8;

  if (font.tables?.os2) {
    const { sTypoDescender, sTypoAscender } = font.tables.os2;
    if (sTypoDescender !== undefined) yBottom = sTypoDescender;
    if (sTypoAscender  !== undefined) yTop    = sTypoAscender;
  } else if (font.tables?.hhea) {
    const { descender, ascender } = font.tables.hhea;
    if (descender !== undefined) yBottom = descender;
    if (ascender  !== undefined) yTop    = ascender;
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
  const glyphCache       = {};   // glyphKey → { left, right, charLabel }

  for (const key of Object.keys(font.glyphs.glyphs)) {
    const glyph = font.glyphs.glyphs[key];
    if (!glyph.path || glyph.path.commands.length === 0) continue;

    const { left, right, advanceWidth, unicode } =
      computeGlyphMargins(glyph, upm, ZONES, yBottom, yTop);

    const glyphKey  = glyph.name ?? `glyph_${key}`;
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

    glyphCache[glyphKey] = { left, right, charLabel };
  }

  // ── 2. Basiswert n+n ────────────────────────────────────────────────────────

  const nData = glyphCache[BASELINE_GLYPH];
  if (!nData) {
    console.warn(`  ⚠ Glyph "${BASELINE_GLYPH}" nicht gefunden – Kerning übersprungen.`);
    return { marginsResult, pairsResult: null, kerningLines: null, baseValue: null };
  }

  // Basiswert: right["n"] + left["n"] pro Zone, nur gültige Zonen
  const baseCalc = pairMean(nData.right, nData.left);
  if (!baseCalc) {
    console.warn(`  ⚠ Keine gültigen Zonen für "${BASELINE_GLYPH}"+"${BASELINE_GLYPH}" – Kerning übersprungen.`);
    return { marginsResult, pairsResult: null, kerningLines: null, baseValue: null };
  }

  const baseValue = baseCalc.mean;
  const baseZoneStr = baseCalc.zoneValues
    .map(v => `z${v.z}:${v.sum}`)
    .join(",");

  console.log(
    `     Basiswert "${BASELINE_GLYPH}"+"${BASELINE_GLYPH}": ` +
    `Ø ${round1(baseValue)} ` +
    `(${baseCalc.validCount} Zonen: ${baseZoneStr})`
  );

  // ── 3. Paare + Kerning ──────────────────────────────────────────────────────

  const glyphKeys  = Object.keys(glyphCache);
  const glyphCount = glyphKeys.length;
  const pairCount  = glyphCount * glyphCount;

  console.log(`     ${glyphCount} Zeichen → ${pairCount.toLocaleString()} Paare …`);

  const pairsResult = {
    meta: {
      ...sharedMeta,
      glyphCount,
      pairCount,
      baseValue:  round1(baseValue),
      baseGlyph:  BASELINE_GLYPH,
      description:
        "gap[z] = right_A[z] + left_B[z], nur wenn BEIDE ≠ -1. " +
        "-1 bedeutet: Zone ungültig (kein Inhalt auf mindestens einer Seite).",
    },
    pairs: {},
  };

  const kerningLines = [];

  for (const keyA of glyphKeys) {
    const { right: rightA, charLabel: charA } = glyphCache[keyA];
    pairsResult.pairs[keyA] = {};

    for (const keyB of glyphKeys) {
      const { left: leftB, charLabel: charB } = glyphCache[keyB];

      // Für pairs.json: strenger Gap (beide müssen gültig sein)
      pairsResult.pairs[keyA][keyB] = computePairGaps(rightA, leftB);

      // Für Kerning: Mittelwert + Kontrollwerte
      const calc = pairMean(rightA, leftB);
      if (calc === null) continue;   // kein einziger gültiger Zonenwert → weglassen

      // Vorzeichenkonvention:
      //   pairMean > baseValue → Paar steht zu weit auseinander → negativ (enger rücken)
      //   pairMean < baseValue → Paar steht zu eng              → positiv (weiter rücken)
      let correction = roundInt(baseValue - calc.mean);

      // Mindestabstand-Capping:
      // Nach Anwendung des Korrekturwerts muss in jeder gültigen Zone gelten:
      //   gap[z] + correction >= minGap  (= baseValue / 4)
      // Die engste Zone bestimmt die Obergrenze des negativen Korrekturwerts.
      const minGap = baseValue / 2;
      const minZoneGap = Math.min(...calc.zoneValues.map(v => v.sum));
      const maxNegativeCorrection = roundInt(minZoneGap - minGap);  // darf nicht unterschritten werden (negativ)

      let capped = false;
      if (correction < 0 && correction < -maxNegativeCorrection) {
        // Korrektur würde die engste Zone unter minGap drücken → deckeln
        correction = roundInt(-(minZoneGap - minGap));
        capped = true;
      }

      // Kontrollausgabe: (z0:83.3,z2:91.0,...) – gültige Zonen mit ihrem Summenwert
      const zoneDebug = calc.zoneValues
        .map(v => `z${v.z}:${v.sum}`)
        .join(",");
      const capNote = capped ? ` [cap:min=${round1(minZoneGap)}→${round1(minGap)}]` : "";

      kerningLines.push(`${charA};${charB};${correction} (${zoneDebug})${capNote}`);
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

      fs.writeFileSync(marginOut, JSON.stringify(marginsResult, null, 2), "utf8");
      console.log(`  ✓ margins/${baseName}.json   (${glyphCount} Zeichen)`);

      if (pairsResult) {
        fs.writeFileSync(pairsOut, JSON.stringify(pairsResult, null, 2), "utf8");
        console.log(`  ✓ pairs/${baseName}.json     (${(glyphCount**2).toLocaleString()} Paare)`);
      }

      if (kerningLines) {
        const csvContent =
          `# Kerning | Font: ${baseName} | Basiswert n+n: Ø${round1(baseValue)} | Zonen: ${ZONES}\n` +
          `# Format: LinkerBuchstabe;RechterBuchstabe;Korrekturwert (z<i>:Zonenwert,...)\n` +
          `# Korrektur = round(PaarDurchschnitt - Basiswert) | Negativ=enger, Positiv=weiter\n` +
          kerningLines.join("\n") + "\n";

        fs.writeFileSync(kerningOut, csvContent, "utf8");
        console.log(`  ✓ kerning/${baseName}.csv    (${kerningLines.length.toLocaleString()} Einträge)\n`);
      }

    } catch (err) {
      console.error(`  ✗ Fehler bei ${fontFile}: ${err.message}`);
      console.error(err.stack);
    }
  }

  console.log("Fertig.");
  console.log(`  Margins → ./margins/`);
  console.log(`  Pairs   → ./pairs/`);
  console.log(`  Kerning → ./kerning/`);
}

main();