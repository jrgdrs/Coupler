# Skill: Cadence Scan — Stem-Rhythmus-Messung

## Zweck

Leitet aus dem Buchstaben `n` ein natürliches Round-Modul ab, das dem Stemabstand
der Schrift entspricht. Wird automatisch beim Font-Laden aufgerufen und befüllt das
Round-Modul-Feld beim ersten Load.

## Algorithmus

```
1. x-Height aus OS/2 sxHeight lesen (Fallback: BoundingBox des 'x'-Glyphs)
2. 'n' auf Off-Screen-Canvas rendern (4px pro font unit)
3. Pixel-Scan in der Equator-Zeile (y = ½ × x-height)
4. Ink-Runs erkennen (alpha > 127 = Ink)
5. stemWidth  = Breite von Run[0] / scale
6. interval   = (Run[1].start − Run[0].start) / scale   (Stamm-zu-Stamm)
7. n          = round(interval × 4 / stemWidth)          (Anzahl Unterteiler)
8. cadence    = interval / n                             (Modul-Kandidat)
```

## cadToRound — Anpassung auf praktischen Bereich 20–40

```js
function cadToRound(raw) {
  const n = Math.round(raw);
  if (n > 40) return Math.round(n / 2);   // zu grob → halbieren
  if (n < 20) return Math.round(n * 2);   // zu fein → verdoppeln
  return n;
}
```

Unter 20: Round-Modul so klein, dass Snap kaum wirkt.
Über 40: Round-Modul so groß, dass Korrekturen unnatürlich springen.

## Fallbacks & Fehlerbehandlung

| Bedingung | Verhalten |
|---|---|
| Kein `n`-Glyph | Log, kein Modul gesetzt |
| Weniger als 2 Ink-Runs | Log "stems not distinct", kein Modul |
| Kein x-Height | Skip |

## Canvas-Visualisierung (Cadence Tab)

- `n`-Glyph in 28% Opacity
- Amber: Baseline und x-Height-Linien
- Weiß: Equator-Scan-Zeile, Stem-Edge-Vertikalen
- Grau gestrichelt: Divider-Raster

Nutzer kann Stem, Interval und Divider manuell überschreiben; `cadToRound` rechnet sofort neu.
