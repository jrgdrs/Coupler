# Skill: Reciprocal-Step-Limit Smoothing (smoothMargins)

## Zweck

Glättet ein Zonen-Margin-Array so, dass benachbarte Zonen nicht um mehr als einen
konfigurierbaren Betrag voneinander abweichen. Verhindert harte Margin-Sprünge an
Diagonalen und offenen Gegenformen, ohne die tatsächliche Tintengrenze zu unterschreiten.

## Algorithmus

```js
function smoothMargins(arr, zH, pct) {
  // pct: smooth parameter 0..99 (0 = off)
  // zH:  zone height in font units
  const maxDelta = pct * zH;           // max Änderung pro Zone
  const out = arr.slice();

  // Ankerzone = Zone mit kleinstem Margin (= engster Punkt)
  let anchorZ = index of min(arr);
  let anchorV = arr[anchorZ];

  // Glätte nach unten (Zone anchorZ → 0)
  for z = anchorZ - 1 down to 0:
    cap = out[prev] + maxDelta         // darf höchstens maxDelta über Vorgänger liegen
    if out[z] > cap:  out[z] = cap     // zu groß: kappen
    if out[z] < anchorV: out[z] = anchorV  // darf Anker nicht unterschreiten
    prev = z

  // Glätte nach oben (Zone anchorZ → n-1)
  for z = anchorZ + 1 to n-1:
    // gleiche Logik
}
```

## Intuition

Der Anker ist der engste Punkt des Glyphs. Von dort aus darf der Margin nach oben/unten
pro Zone um höchstens `pct × zoneHeight` Font-Units wachsen. Das entspricht dem
maximalen Winkel, den eine gerade Linie an der Zonen-Grenze hätte.

`pct = 0.5` bei `zH = 60fu` → max 30fu Sprung pro Zone.

Der Anker selbst bleibt fest. Kein Margin kann kleiner als der Ankerwert werden — das
würde bedeuten, der Glyph ist an dieser Zone schmaler als am engsten Punkt (was geometrisch
nicht möglich ist, wenn der Anker korrekt bestimmt wurde).

## Parameter

| Parameter | Wert | Effekt |
|---|---|---|
| `smooth = 0` | `maxDelta = 0` | Kein Smoothing, Rohdaten |
| `smooth = 50` | Moderate Glättung (Default) | Diagonalen harmonisiert |
| `smooth = 99` | Maximale Glättung | Nahezu konstante Margins |

## Wichtig: Smoothing gilt nicht für Min-Gap

Min-Gap verwendet `leftGeom`/`rightGeom` (pre-smooth). Smoothing kann Margins nach oben
verschieben, würde also fälschlicherweise Überlappungen verdecken. Daher ist das
geometrische (ungeglättete) Array autoritativ für den Mindestabstand.
