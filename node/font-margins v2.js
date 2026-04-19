#!/usr/bin/env node
/**
 * font-margins.js
 *
 * Berechnet für jeden Font in ./fonts:
 *   1. Die seitlichen Abstände (Margins) jedes Zeichens in N gleichmäßigen
 *      Höhenzonen über die UPM-Höhe  → ./margins/<fontname>.json
 *   2. Den Zwischenraum jedes Zeichenpaares (rechts von A + links von B)
 *      pro Höhenzone                  → ./pairs/<fontname>.json
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
const ZONES       = parseInt(process.argv[2] ?? "9", 10);

if (isNaN(ZONES) || ZONES < 1) {
  console.error("Fehler: Zonenanzahl muss eine positive Ganzzahl sein.");
  process.exit(1);
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/** Rundet auf eine Nachkommastelle */
function round1(v) {
  return Math.round(v * 10) / 10;
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
 *
 * Koordinaten: opentype.js liefert Y nach unten → wir invertieren zu Y nach oben
 * (fontY = -opentypeY), damit Zone 0 am Schriftfuß liegt.
 *
 * @param {object} glyph
 * @param {number} upm
 * @param {number} zones
 * @param {number} yBottom  untere Grenze in Font-Koordinaten (Y-oben)
 * @param {number} yTop     obere Grenze in Font-Koordinaten (Y-oben)
 * @returns {{ left: number[], right: number[], advanceWidth: number, unicode: number|null }}
 */
function computeGlyphMargins(glyph, upm, zones, yBottom, yTop) {
  const advanceWidth = glyph.advanceWidth ?? 0;
  const zoneHeight   = (yTop - yBottom) / zones;

  // Pfad sampeln und Y invertieren
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

// ─── Paar-Berechnung ──────────────────────────────────────────────────────────

/**
 * Berechnet für ein Zeichenpaar (A, B) den Konturabstand pro Höhenzone:
 *
 *   gap[z] = right_A[z] + left_B[z]
 *
 * Das entspricht dem Gesamtabstand zwischen der rechtesten Kontur von A und
 * der linkesten Kontur von B, wenn beide Zeichen direkt nebeneinander gesetzt
 * werden (ohne zusätzliches Kerning).
 *
 * Sonderfälle:
 *   right_A[z] == -1  &&  left_B[z] == -1  →  -1  (keine Kontur auf beiden Seiten)
 *   nur eine Seite == -1                    →  Wert der anderen Seite
 *                                              (leere Zone trägt 0 zum Abstand bei)
 *
 * @param {number[]} rightA
 * @param {number[]} leftB
 * @returns {number[]}
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

// ─── Font verarbeiten ─────────────────────────────────────────────────────────

async function processFont(fontPath) {
  console.log(`  Lade: ${path.basename(fontPath)}`);
  const font = opentype.loadSync(fontPath);
  const upm  = font.unitsPerEm;

  // Zonengrenzen aus Font-Metriken lesen
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

  // ── 1. Margins pro Glyph berechnen ──────────────────────────────────────────

  const marginsResult    = { meta: sharedMeta, glyphs: {} };
  const glyphMarginCache = {};   // glyphKey → { left, right }

  for (const key of Object.keys(font.glyphs.glyphs)) {
    const glyph = font.glyphs.glyphs[key];
    if (!glyph.path || glyph.path.commands.length === 0) continue;

    const { left, right, advanceWidth, unicode } =
      computeGlyphMargins(glyph, upm, ZONES, yBottom, yTop);

    const glyphKey = glyph.name ?? `glyph_${key}`;

    marginsResult.glyphs[glyphKey] = {
      name:        glyph.name ?? glyphKey,
      unicode,
      unicodeHex:  unicode !== null
                     ? `U+${unicode.toString(16).toUpperCase().padStart(4, "0")}`
                     : null,
      char:        unicode !== null ? String.fromCodePoint(unicode) : null,
      advanceWidth,
      left,
      right,
    };

    glyphMarginCache[glyphKey] = { left, right };
  }

  // ── 2. Paar-Abstände berechnen ───────────────────────────────────────────────

  const glyphKeys  = Object.keys(glyphMarginCache);
  const glyphCount = glyphKeys.length;
  const pairCount  = glyphCount * glyphCount;

  console.log(`     ${glyphCount} Zeichen → ${pairCount.toLocaleString()} Paare …`);

  const pairsResult = {
    meta: {
      ...sharedMeta,
      glyphCount,
      pairCount,
      description:
        "gap[z] = right_A[z] + left_B[z]. " +
        "Abstand zwischen den Konturen in Höhenzone z beim direkten Nebeneinandersetzen. " +
        "-1: in beiden Zeichen kein Konturinhalt in dieser Zone.",
    },
    pairs: {},
  };

  for (const keyA of glyphKeys) {
    const { right: rightA } = glyphMarginCache[keyA];
    pairsResult.pairs[keyA] = {};

    for (const keyB of glyphKeys) {
      const { left: leftB } = glyphMarginCache[keyB];
      pairsResult.pairs[keyA][keyB] = computePairGaps(rightA, leftB);
    }
  }

  return { marginsResult, pairsResult };
}

// ─── Einstiegspunkt ───────────────────────────────────────────────────────────

async function main() {
  for (const dir of [MARGINS_DIR, PAIRS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const fontFiles = fs.readdirSync(FONTS_DIR).filter(f =>
    /\.(ttf|otf)$/i.test(f)
  );

  if (fontFiles.length === 0) {
    console.error(`Keine TTF/OTF-Dateien in ${FONTS_DIR} gefunden.`);
    process.exit(1);
  }

  console.log(`\nFont-Margins & Pair-Gaps`);
  console.log(`Zonen: ${ZONES}  |  Fonts: ${fontFiles.length}\n`);

  for (const fontFile of fontFiles) {
    const fontPath  = path.join(FONTS_DIR, fontFile);
    const baseName  = path.basename(fontFile, path.extname(fontFile));
    const marginOut = path.join(MARGINS_DIR, baseName + ".json");
    const pairsOut  = path.join(PAIRS_DIR,   baseName + ".json");

    try {
      const { marginsResult, pairsResult } = await processFont(fontPath);
      const glyphCount = Object.keys(marginsResult.glyphs).length;

      fs.writeFileSync(marginOut, JSON.stringify(marginsResult, null, 2), "utf8");
      fs.writeFileSync(pairsOut,  JSON.stringify(pairsResult,  null, 2), "utf8");

      console.log(`  ✓ margins/${baseName}.json  (${glyphCount} Zeichen)`);
      console.log(`  ✓ pairs/${baseName}.json    (${(glyphCount * glyphCount).toLocaleString()} Paare)\n`);
    } catch (err) {
      console.error(`  ✗ Fehler bei ${fontFile}: ${err.message}\n`);
    }
  }

  console.log("Fertig.");
  console.log(`  Margins → ./margins/`);
  console.log(`  Pairs   → ./pairs/`);
}

main();