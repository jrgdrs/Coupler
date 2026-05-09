# Skill: Spacing Corrections — Sidebearing-Imbalanz-Analyse

## Zweck

Analysiert jeden Glyph auf Sidebearing-Imbalanz relativ zum Referenzglyph (o/O).
Schlägt Advance-Width- und LSB-Korrekturen vor, die den Glyph auf die gleiche
optische Margin-Breite wie den Referenzglyph bringen.

## Algorithmus

```js
// Baseline: durchschnittliche Margin des Referenzglyphs in seiner eigenen Höhe
const baseLcL = avgMarginZones(o.left,  botZoneOf(o), topZoneOf(o)) + tracking/2
const baseLcR = avgMarginZones(o.right, botZoneOf(o), topZoneOf(o)) + tracking/2

// Pro Glyph: Durchschnitt im selben vertikalen Zonenbereich wie der Referenzglyph
const gL = avgMarginZones(glyph.left,  botZ, topZ)
const gR = avgMarginZones(glyph.right, botZ, topZ)

// Korrekturen
const dL   = rtm(baseLcL - gL, round)      // LSB-Änderung
const dR   = rtm(baseLcR - gR, round)      // RSB-Änderung (implizit via AW)
const newAW = rtm(oldAW + dL + dR, round)
const dWidth = newAW - oldAW - dL           // reine AW-Änderung (RSB-Effekt)
```

## Hilfsfunktionen

```js
// Durchschnitt aller non-null Margins im Bereich [minZ, maxZ]
avgMarginZones(arr, minZ, maxZ)

// Oberste Zone mit Ink
topZoneOf(gc) → iteriert von oben

// Unterste Zone mit Ink
botZoneOf(gc) → iteriert von unten
```

**Warum Zonen-Begrenzung?** Glyphen haben unterschiedliche Höhen. Die Spacing-Correction
muss nur im Bereich verglichen werden, in dem der Referenzglyph selbst Ink hat — sonst
würden leere Zonen oberhalb/unterhalb den Durchschnitt verzerren.

## Tracking-Split

```js
trk = p.tracking / 2
baseLcL += trk    // Tracking-Offset symmetrisch auf beide Seiten
baseLcR += trk
```

## Output-Format

```js
items.push({ name: glyph.name, dlsb: dL, dwidth: dWidth })
```

In Glyphs angewendet via:
```python
layer.LSB   += item['dlsb']
layer.width += item['dwidth']
```

## Unterschied zu Kerning

Spacing Corrections ändern die absolute Metrik eines Glyphs (sidebearings).
Kerning korrigiert nur spezifische Paar-Abstände. Idealerweise werden Spacing
Corrections **vor** dem Kerning angewendet — besser balancierte Sidebearings
reduzieren die Anzahl der nötigen Kerning-Korrekturen.
