# Skill: Margin Measurement — pathXZones & glowZones

## Konzept

Jeder Glyph wird in `p.zones` horizontale Streifen (Zonen) zerlegt. Pro Zone wird der
linke und rechte Tintenrand gemessen. Das Ergebnis sind zwei Arrays `left[z]` und
`right[z]` — Abstände von der linken Kante (left) bzw. von der rechten Kante der
Advance Width (right). `null` bedeutet: kein Ink in dieser Zone.

---

## pathXZones — geometrische Vektorschnitte

```
pathXZones(path, zones, yBot, yTop) → [{xMin, xMax}|null] (length=zones)
```

Iteriert alle Pfad-Segmente (L / Q / C / Z). Für jedes Segment:
1. 33-Punkt-Sampling bestimmt den Y-Bereich des Segments
2. Nur die betroffenen Zonen werden berechnet (Z-Range-Clip, spart ~90% der Arbeit)
3. `segXRng(fn, lo, hi)` findet via Bisection xMin/xMax des Segments im Zonenband

Ausgabe: bounding x-Bereich pro Zone über alle Segmente, keine Pixelrasterung.

**Koordinatensystem:** font-y nach oben positiv; Pfade liegen im `(0, yBot..yTop)`-Raum.

---

## glowZones — rasterbasierte Inkausbreitung

```
glowZones(glyphOrCmds, aw, p, yBot, yTop, isGlyphs, upm) → [{xMin, xMax}|null]
```

1. Rendert den Glyph auf einen Off-Screen-Canvas (1px = 1 font unit)
2. Extrahiert den Alpha-Kanal als `Uint8Array` (cache-freundlich)
3. Pro Zone: summiert Alpha über alle Pixel-Rows im Band → normalisierte Opacity [0..1]
4. Horizontaler Box-Blur via Präfix-Summe (O(N)) mit Radius `p.glowblur`
5. Threshold 0.002: erste und letzte Spalte mit Opacity > 0.002 → xMin, xMax

Effekt: Ink expandiert optisch um `glowblur` Font-Units → weichere, typografisch
gewichtete Margenmessung für Hochkontrast- und Ink-Trap-Designs.

---

## Blur-Averaging (Sub-Zones)

`p.blur > 1` teilt jede Zone in `p.blur` Sub-Zonen. Die xMin/xMax-Werte aller
Sub-Zonen einer Zone werden gemittelt (arithmetisch), um Stufeneffekte an Diagonalen
zu unterdrücken.

```js
for (let s = 0; s < p.blur; s++) {
  const sub = subResult[z * p.blur + s];
  if (!sub) continue;
  sL += sub.xMin;          // links: Abstand von Kante 0
  sR += aw - sub.xMax;     // rechts: Abstand von aw-Kante
  cnt++;
}
left[z]  = sL / cnt;
right[z] = sR / cnt;
```

---

## Dual-Array-Pflicht: leftGeom / rightGeom vs. left / right

```
computeGlyphMargins() → { left, right, leftGeom, rightGeom, leftRaw, rightRaw }
```

| Feld | Inhalt | Wofür |
|---|---|---|
| `leftGeom` / `rightGeom` | pathXZones, kein Glow, kein Smooth | **Min-Gap-Check** |
| `leftRaw` / `rightRaw` | Glow wenn aktiv, sonst = Geom | Zwischen-Schritt vor Smooth |
| `left` / `right` | `leftRaw` + Smooth | **Kerning-Berechnung** |

**Kritisch:** Min-Gap **muss** `leftGeom`/`rightGeom` verwenden. Glow bläst Ränder auf
und würde den physikalischen Tintenstopp-Check verfälschen.

---

## Margin-Interpretation

```
left[z]  = Abstand: linke Tintenkante → linke Advance-Kante (0)
right[z] = Abstand: rechte Tintenkante → rechte Advance-Kante (aw)

Abstand im Paar A+B in Zone z: rightA[z] + leftB[z]
Wenn < 0: Tintenteile überlappen bereits (negative LSB / überstehende Teile)
```
