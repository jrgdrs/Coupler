#!/usr/bin/env node
/**
 * font-margins.js
 *
 * Berechnet für jeden Font in ./fonts die seitlichen Abstände (Margins)
 * jedes Zeichens in N gleichmäßigen Höhenzonen über die UPM-Höhe.
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

const fs   = require("fs");
const path = require("path");
const opentype = require("opentype.js");

// ─── Konfiguration ────────────────────────────────────────────────────────────

const FONTS_DIR   = path.resolve("./fonts");
const MARGINS_DIR = path.resolve("./margins");
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

/**
 * Berechnet kubische Bézier-Punkte entlang t ∈ [0,1].
 * Gibt {x, y} zurück.
 */
function cubicBezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt, t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

/**
 * Berechnet quadratische Bézier-Punkte entlang t ∈ [0,1].
 */
function quadBezierPoint(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/**
 * Zerlegt einen opentype-Pfad in einzelne Abtastpunkte (gesampelte Koordinaten).
 * Liefert Array von {x, y}.
 *
 * @param {object} opentypePath  - path aus glyph.getPath(0, 0, upm)
 * @param {number} samples       - Anzahl Samples pro Kurvenabschnitt
 */
function samplePath(opentypePath, samples = 64) {
  const points = [];
  let cx = 0, cy = 0;   // aktueller Zeichenstift
  let sx = 0, sy = 0;   // Startpunkt des aktuellen Kontur-Segments

  for (const cmd of opentypePath.commands) {
    switch (cmd.type) {
      case "M":
        cx = cmd.x; cy = cmd.y;
        sx = cx;    sy = cy;
        points.push({ x: cx, y: cy });
        break;

      case "L":
        // Linie: einfach Endpunkt hinzufügen
        points.push({ x: cmd.x, y: cmd.y });
        cx = cmd.x; cy = cmd.y;
        break;

      case "Q": {
        // Quadratische Bézier
        const p0 = { x: cx,    y: cy };
        const p1 = { x: cmd.x1, y: cmd.y1 };
        const p2 = { x: cmd.x,  y: cmd.y };
        for (let i = 1; i <= samples; i++) {
          points.push(quadBezierPoint(p0, p1, p2, i / samples));
        }
        cx = cmd.x; cy = cmd.y;
        break;
      }

      case "C": {
        // Kubische Bézier
        const p0 = { x: cx,    y: cy };
        const p1 = { x: cmd.x1, y: cmd.y1 };
        const p2 = { x: cmd.x2, y: cmd.y2 };
        const p3 = { x: cmd.x,  y: cmd.y };
        for (let i = 1; i <= samples; i++) {
          points.push(cubicBezierPoint(p0, p1, p2, p3, i / samples));
        }
        cx = cmd.x; cy = cmd.y;
        break;
      }

      case "Z":
        // Kontur schließen – Linie zurück zum Startpunkt
        points.push({ x: sx, y: sy });
        cx = sx; cy = sy;
        break;
    }
  }

  return points;
}

/**
 * Berechnet für ein einzelnes Glyph die Margin-Arrays (links & rechts)
 * über alle Zonen.
 *
 * Koordinatensystem von opentype.js bei getPath(0, 0, upm):
 *   - Grundlinie bei y = 0 (in Font-Units)
 *   - Y wächst nach UNTEN (Pixel-Konvention)
 *   - Deshalb: "Fuß" = y_max (unterste Linie), "Kopf" = y_min (oberste Linie)
 *
 * Wir normieren das auf Font-Einheiten direkt aus den Glyph-Metriken.
 *
 * @param {object} glyph       - opentype Glyph-Objekt
 * @param {number} upm         - Units per Em
 * @param {number} zones       - Anzahl der Höhenzonen
 * @returns {{ left: number[], right: number[], meta: object }}
 */
function computeMargins(glyph, upm, zones) {
  const advanceWidth = glyph.advanceWidth ?? 0;

  // Pfad in Font-Units sampeln (skaliert mit UPM damit Koordinaten in fu)
  const rawPath = glyph.getPath(0, 0, upm);
  const pts = samplePath(rawPath, 64);

  // opentype liefert bei getPath(0,0,upm) y-Werte invertiert:
  // Aufsteiger haben negative y. Wir rechnen intern mit font-units direkt.
  // Basis: Wir definieren Zonen von descender bis ascender.
  // Als Bereich nehmen wir: yBottom = -descender (z.B. -200 → 200 unter Grundlinie)
  //                          yTop    = ascender
  // Einfacher: wir verwenden den vollen UPM-Bereich symmetrisch um die Baseline,
  // typisch: descender..ascender. Wir lesen das aus den OS/2-Metriken.

  // Zonengrenzen in font-units (y-Achse in opentype.js-Koordinaten ist invertiert)
  // getPath(0,0,upm) skaliert so, dass 1 em = upm Pixel.
  // In dieser Skala: Grundlinie y=0, Aufsteiger y<0 (nach oben), Absteiger y>0.
  // Wir arbeiten mit "Font-Koordinaten" (Y oben = positiv):
  //   fontY = -opentypeY   (Umkehrung)

  // Zonendefinition in Font-Koordinaten (Y_up):
  //   Zone 0 (Fuß): fontYBottom  bis fontYBottom + zoneHeight
  //   Zone N-1 (Kopf): fontYTop - zoneHeight bis fontYTop

  // fontY für jeden Punkt:
  const fpts = pts.map(p => ({ x: p.x, y: -p.y }));

  // Gesamtbereich: nutze UPM als Höhe, Baseline bei y=0
  // Wir definieren den Bereich als [-descenderAbs .. ascender]
  // Fallback: 0..upm wenn keine Metriken vorhanden
  let yBottom = -(upm * 0.2);   // Näherung: 20% descender
  let yTop    =   upm * 0.8;    // Näherung: 80% ascender

  // Besser: aus OS/2 oder hhea lesen wenn vorhanden
  const os2 = glyph.path && glyph.font && glyph.font.tables?.os2;
  // opentype.js speichert Metriken auf Font-Ebene, nicht auf Glyph-Ebene
  // → wird im Caller übergeben (s. unten)

  const zoneHeight = (yTop - yBottom) / zones;

  const leftMargins  = [];
  const rightMargins = [];

  for (let z = 0; z < zones; z++) {
    const zMin = yBottom + z * zoneHeight;
    const zMax = zMin + zoneHeight;

    // Alle Punkte in dieser Zone
    const inZone = fpts.filter(p => p.y >= zMin && p.y < zMax);

    if (inZone.length === 0) {
      leftMargins.push(-1);
      rightMargins.push(-1);
    } else {
      const xMin = Math.min(...inZone.map(p => p.x));
      const xMax = Math.max(...inZone.map(p => p.x));

      // Linker Abstand:  Abstand vom linken Rand (x=0) zum linksten Punkt
      const leftMargin  = round1(xMin);
      // Rechter Abstand: Abstand vom rechtsten Punkt bis zur Advanced Width
      const rightMargin = round1(advanceWidth - xMax);

      leftMargins.push(leftMargin);
      rightMargins.push(rightMargin);
    }
  }

  return { left: leftMargins, right: rightMargins };
}

// ─── Hauptlogik ───────────────────────────────────────────────────────────────

async function processFont(fontPath) {
  console.log(`  Lade: ${path.basename(fontPath)}`);
  const font = opentype.loadSync(fontPath);

  const upm = font.unitsPerEm;

  // Metriken für Zonendefinition aus Font-Tabellen
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

  const result = {
    meta: {
      fontName:    font.names?.fullName?.en ?? path.basename(fontPath),
      file:        path.basename(fontPath),
      upm,
      zones:       ZONES,
      zoneHeight:  round1(zoneHeight),
      yBottom:     round1(yBottom),
      yTop:        round1(yTop),
    },
    glyphs: {},
  };

  const glyphNames = Object.keys(font.glyphs.glyphs);

  for (const key of glyphNames) {
    const glyph = font.glyphs.glyphs[key];

    // Zeichen ohne Konturpunkte überspringen (z.B. .notdef ohne Outline)
    if (!glyph.path || glyph.path.commands.length === 0) continue;

    const advanceWidth = glyph.advanceWidth ?? 0;

    // Pfad sampeln (in opentype-Koordinaten: Y nach unten)
    const rawPath = glyph.getPath(0, 0, upm);
    const pts = samplePath(rawPath, 64);

    // In Font-Koordinaten umrechnen (Y nach oben)
    const fpts = pts.map(p => ({ x: p.x, y: -p.y }));

    const leftMargins  = [];
    const rightMargins = [];

    for (let z = 0; z < ZONES; z++) {
      const zMin = yBottom + z * zoneHeight;
      const zMax = zMin + zoneHeight;

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

    // Unicode ermitteln
    let unicode = null;
    if (glyph.unicodes && glyph.unicodes.length > 0) {
      unicode = glyph.unicodes[0];
    }

    const glyphKey = glyph.name ?? `glyph_${key}`;

    result.glyphs[glyphKey] = {
      name:         glyph.name ?? glyphKey,
      unicode:      unicode,
      unicodeHex:   unicode !== null ? `U+${unicode.toString(16).toUpperCase().padStart(4, "0")}` : null,
      char:         unicode !== null ? String.fromCodePoint(unicode) : null,
      advanceWidth,
      left:         leftMargins,
      right:        rightMargins,
    };
  }

  return result;
}

async function main() {
  // Ausgabeverzeichnis anlegen
  if (!fs.existsSync(MARGINS_DIR)) {
    fs.mkdirSync(MARGINS_DIR, { recursive: true });
  }

  // Font-Dateien sammeln
  const fontFiles = fs.readdirSync(FONTS_DIR).filter(f =>
    /\.(ttf|otf)$/i.test(f)
  );

  if (fontFiles.length === 0) {
    console.error(`Keine TTF/OTF-Dateien in ${FONTS_DIR} gefunden.`);
    process.exit(1);
  }

  console.log(`\nFont-Margins-Berechnung`);
  console.log(`Zonen: ${ZONES}  |  Fonts gefunden: ${fontFiles.length}\n`);

  for (const fontFile of fontFiles) {
    const fontPath   = path.join(FONTS_DIR, fontFile);
    const outputName = path.basename(fontFile, path.extname(fontFile)) + ".json";
    const outputPath = path.join(MARGINS_DIR, outputName);

    try {
      const data = await processFont(fontPath);
      const glyphCount = Object.keys(data.glyphs).length;

      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf8");
      console.log(`  ✓ ${outputName}  (${glyphCount} Zeichen)\n`);
    } catch (err) {
      console.error(`  ✗ Fehler bei ${fontFile}: ${err.message}\n`);
    }
  }

  console.log("Fertig. Ergebnisse in ./margins/");
}

main();