# Skill: Kerning-Berechnung — Pipeline von Margins zu Korrekturen

## Überblick der 3-Schritte-Pipeline

```
Step 1: Margins     — computeGlyphMargins() für alle Glyphen → glyphCache
Step 2: Baselines   — pairMean(o+o), pairMean(O+O) → baseValueLC, baseValueUC
Step 3: Pairs       — für jedes Paar: correction = rtm(base − pairMean, round)
                      + Lazy, Min-Gap, Threshold → kerningData
```

---

## Step 1: Margins

Für jeden Glyph mit Pfad-Daten:
```js
glyphCache[gk] = {
  left, right,           // geglättete Margins (für Kerning-Rechnung)
  leftGeom, rightGeom,   // geometrische Margins (für Min-Gap)
  charLabel,             // unicode-Zeichen oder Glyph-Name
  cls,                   // 'UC' oder 'LC'
  advanceWidth,
}
```

---

## Step 2: Baseline-Bestimmung

```js
baseValueLC = pairMean(o.right, o.left).mean + p.tracking
baseValueUC = pairMean(O.right, O.left).mean + p.tracking
```

`pairMean(rA, lB)` mittelt `rA[z] + lB[z]` über alle Zonen mit Ink in beiden Glyphen:
```js
mean = Σ(rA[z] + lB[z]) / validZones
```

Der Baseline-Wert ist der angestrebte "normale" Abstand — wie weit o+o voneinander
stehen soll. Alle anderen Paare werden relativ dazu korrigiert.

`tracking` verschiebt die Baseline global: positiv = mehr Abstand für alle Paare.

---

## Step 3: Korrekturformel

```js
correction = rtm(base − pairMean, p.round)
```

- Negativ: Paar enger als Referenz → kern (tighter)
- Positiv: Paar weiter als Referenz → expand

```js
function rtm(v, mod) {
  if (mod <= 1) return Math.round(v);
  return Math.round(v / mod) * mod;   // snap to nearest multiple of mod
}
```

---

## Lazy %

```js
if (p.lazy > 0)
  corr = rtm(corr * (1 - p.lazy / 100), p.round)
```

Reduziert alle Korrekturen um `lazy`% und schnappt neu auf das Round-Modul.
Wird **vor** dem Min-Gap-Check angewendet, damit Min-Gap die Lazy-Reduktion
ggf. übersteuern kann.

`lazy = 20` → Korrekturen um 20% weicher, sanfteres Kerning-Ergebnis.

---

## Min-Gap-Enforcement

```js
const minGapFU = upm * p.mingap   // z.B. 4% × 1000 UPM = 40 fu

// Für jede Zone: physikalischer Abstand = rightGeom[z] + leftGeom[z]
const minZG = Math.min(...rawSums)   // engste Zone

const room = minZG - minGapFU        // Spielraum (>0 = ok, <0 = zu eng)

if (room >= 0) {
  // Noch Spielraum: maximale Tightening-Korrektur (floor = konservativ)
  minCorr = -(Math.floor(room / round) * round)
} else {
  // Bereits zu eng/überlappend: Positive Korrektur erforderlich
  minCorr = Math.ceil(-room / round) * round
}

if (corr < minCorr) { corr = minCorr; capped = true; }
```

**Warum floor/ceil statt round:**
- `floor` beim Tightening-Limit: sicherstellt, dass Spielraum nicht überschritten wird
- `ceil` beim Looser-Requirement: sicherstellt, dass Mindestabstand wirklich eingehalten wird

**Kritisch:** Immer `rightGeom`/`leftGeom` — nie `right`/`left` (smooth/glow verfälscht den physikalischen Check).

---

## Threshold

```js
if (p.threshold > 0 && !capped && Math.abs(corr) < p.threshold)
  corr = 0
```

Kleine Korrekturen werden auf null gesetzt. `!capped` schützt Min-Gap-Korrekturen:
eine Min-Gap-erzwungene positive Korrektur darf nie durch Threshold genullt werden.

---

## Pair-Klassen und Paar-Erweiterung

| Klasse | Bedingung | Basis |
|---|---|---|
| `LC` | beide LC | baseValueLC |
| `UC` | beide UC | baseValueUC |
| `mixed` | ein UC, ein LC | baseValueLC |

**SC-Erweiterung** (nach dem Basis-Queue):
- UC + LC → UC + SC (wenn `.sc`-Glyph vorhanden)
- LC + LC → SC + SC

**Digit-Erweiterung:** alle 10×10 lining digit pairs + alle OSF digit pairs.

**Space-Paare** (`addSpacePairs`): für jeden Glyph werden glyph+space und space+glyph
berechnet — die rechte/linke Margin des Base-Glyphs (o bzw. O) dient als zweiter Partner.

---

## Pair-Queue und Output-Limit

`buildPairQueue(labelToKey, limit)` iteriert `KERNING_PAIRS` (fuchs.js) in
Frequenzreihenfolge. SC/Digit-Paare werden danach angehängt.

Das Limit gilt für die **Ausgabe** via `outputPairs()`:
```js
function outputPairs() {
  const nz = kerningData.filter(d => d.correction !== 0);
  return p.pairlimit > 0 ? nz.slice(0, p.pairlimit) : nz;
}
```
Immer in fuchs-Reihenfolge — die ersten N non-zero Paare werden ausgegeben.
