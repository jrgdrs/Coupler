# Coupler — Mathematische Dokumentation der Kerning-Berechnung

## Zusammenfassung

Coupler berechnet Kerning-Korrekturen vollautomatisch aus der Geometrie der Schriftumrisse — ohne manuelle Eingriffe. Dazu wird jeder Buchstabe in horizontale Zonen geschnitten und für jede Zone der Abstand zwischen Tintengrenze und Vorbreitenrand gemessen; dieser Wert heißt *Rand*. Aus dem Selbst-Paar des Referenzbuchstabens (Standard: »o«) ergibt sich ein *Basisabstand*, der beschreibt, wie weit zwei Zeichen im normalen Textsatz auseinanderstehen sollen. Für jedes Buchstabenpaar wird anschließend der mittlere Zonenabstand berechnet und mit dem Basisabstand verglichen: die Differenz — gerundet auf ein konfigurierbares Rastermaß — ist die Kerning-Korrektur. Damit kein Buchstabenpaar unter einen Mindestabstand rutscht, wird jede Korrektur gegen eine einstellbare Untergrenze gekappt.

---

> **Font:** 1000 UPM-Font als Referenz durchgehend in allen Beispielen.  
> **Standardparameter:** Zones = 16, Blur = 5, Smooth = 50, Min Gap = 9 %, Round = 20, Threshold = 0.

---

## 1. Eingangsdaten

### 1.1 Fontmetriken

Ein OpenType-Font liefert folgende Basismaße, alle in **Font Units (FU)**:

| Symbol | Bezeichnung | Typischer Wert (1000 UPM) |
|--------|-------------|--------------------------|
| `upm` | Units Per Em | 1000 |
| `yTop` | Typographischer Ascender | 750 |
| `yBot` | Typographischer Descender | −250 |
| `aw` | Advance Width eines Glyphs | z. B. 560 (»o«) |

`yTop` und `yBot` werden bevorzugt aus `sTypoAscender`/`sTypoDescender` (OS/2-Tabelle) bezogen, hilfsweise aus `hhea`. Fehlen beide, gilt `yTop = 0.8 · upm`, `yBot = −0.2 · upm`.

### 1.2 Glyph-Outline

Jeder Glyph besteht aus einer Folge von Pfadbefehlen:

```
M x y       — Moveto (Stift heben)
L x y       — Lineto
Q x1 y1 x y — Quadratische Bézierkurve (TrueType)
C x1 y1 x2 y2 x y — Kubische Bézierkurve (CFF/OTF)
Z           — Closepath
```

Alle Koordinaten liegen im Font-Koordinatensystem: **x wächst nach rechts, y nach oben.**

### 1.3 Parameter-Objekt `p`

Das zentrale Parameter-Objekt, das alle Einstellungen trägt:

```
p = {
  zones:     16,      # Anzahl horizontaler Zonen
  blur:       5,      # Sub-Zonen je Zone (vertikale Überabtastung)
  smooth:    0.5,     # Interne Glättungsstärke (UI-Wert 50 → 1 − 50/100 = 0.5)
  mingap:   0.09,     # Mindest-Zonen-Abstand als Anteil von UPM (UI: 9 %)
  round:     20,      # Rundungsmodul in FU
  threshold:  0,      # Minimaler Absolutbetrag für Korrekturen
  tracking:   0,      # Globaler Offset auf Basiswert
  baselc:   'o',      # Referenzglyph Kleinbuchstaben
  baseuc:   'O',      # Referenzglyph Großbuchstaben
  glow:    true,      # Modus: Glow (Pixel) oder Geometrie
  glowblur:  20,      # Blur-Radius im Glow-Modus (FU)
}
```

**Transformation des Smooth-Wertes:**  
Der UI-Eingabewert `s` (0–99) wird intern umgerechnet zu:

$$p_{\text{smooth}} = \begin{cases} 0 & \text{wenn } s = 0 \\ 1 - \dfrac{s}{100} & \text{sonst} \end{cases}$$

Beispiel: UI-Wert 50 → `p.smooth = 0.5`.

---

## 2. Koordinatensystem und Em-Raum

Der **Em-Raum** ist das Intervall `[yBot, yTop]` auf der vertikalen Achse.

```
  y = yTop =  750  ──────────────────────────  Ascender
                   │         ▓▓▓▓▓             │
                   │       ▓▓    ▓▓             │ Em-Raum
                   │       ▓▓    ▓▓             │ 1000 FU
                   │         ▓▓▓▓▓             │
  y =    0  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  Baseline
                                               │
  y = yBot = -250  ──────────────────────────  Descender
```

Gesamthöhe: `H_em = yTop − yBot = 750 − (−250) = 1000 FU`.

---

## 3. Zonen-Aufteilung

### 3.1 Zonen und Sub-Zonen

Der Em-Raum wird in `zones` gleich hohe **Zonen** unterteilt. Jede Zone wird intern in `blur` **Sub-Zonen** weiter unterteilt. Die Gesamtzahl der Sub-Zonen:

$$N_{\text{sub}} = \text{zones} \times \text{blur} = 16 \times 5 = 80$$

Zonenhöhe:

$$z_H = \frac{y_{\text{Top}} - y_{\text{Bot}}}{\text{zones}} = \frac{1000}{16} = 62{,}5 \ \text{FU}$$

Sub-Zonenhöhe:

$$z_{H,\text{sub}} = \frac{z_H}{\text{blur}} = \frac{62{,}5}{5} = 12{,}5 \ \text{FU}$$

### 3.2 Zonengrenzen

Sub-Zone $k$ (0-basiert) erstreckt sich von:

$$y_{\text{lo}}(k) = y_{\text{Bot}} + k \cdot z_{H,\text{sub}}$$
$$y_{\text{hi}}(k) = y_{\text{lo}}(k) + z_{H,\text{sub}}$$

**Beispiel** (k = 4):  
$y_{\text{lo}} = −250 + 4 \cdot 12{,}5 = −200 \ \text{FU}$,  
$y_{\text{hi}} = −200 + 12{,}5 = −187{,}5 \ \text{FU}$.

Die Zonen laufen von unten (Descender) nach oben (Ascender), Zone 0 beginnt bei `yBot`.

---

## 4. Randmessung — Geometrischer Modus

Im geometrischen Modus werden die Bézierkurven des Glyphs direkt ausgewertet.

### 4.1 Bézierkurven-Auswertung

**Kubische Bézierkurve** (CFF/OTF):

$$B(t) = (1-t)^3 P_0 + 3(1-t)^2 t\, P_1 + 3(1-t) t^2 P_2 + t^3 P_3, \quad t \in [0,1]$$

**Quadratische Bézierkurve** (TrueType):

$$B(t) = (1-t)^2 P_0 + 2(1-t)\,t\, P_1 + t^2 P_2, \quad t \in [0,1]$$

### 4.2 x-Bereich je Segment und Sub-Zone (`segXRng`)

Für jedes Pfadsegment und jede Sub-Zone $[y_{\text{lo}}, y_{\text{hi}}]$:

1. **Abtastung:** 513 gleichmäßige $t$-Werte $\{0, \tfrac{1}{512}, \ldots, 1\}$. Für jeden Punkt mit $y \in [y_{\text{lo}}, y_{\text{hi}}]$ werden $x_{\min}$ und $x_{\max}$ akkumuliert.

2. **Bisektions-Randkorrektur:** An den Zonengrenzen $y = y_{\text{lo}}$ und $y = y_{\text{hi}}$ wird der Schnittpunkt per rekursiver Bisektion (bis $\Delta t < 0{,}05$) präzise ermittelt und zu $x_{\min}$/$x_{\max}$ beigetragen.

**Ergebnis** je Segment: $\{x_{\min}, x_{\max}\}$ oder `null` (kein Schnitt mit der Sub-Zone).

### 4.3 Aggregation über alle Segmente (`pathXZones`)

Alle Segmente eines Glyphs werden verarbeitet. Pro Sub-Zone ergibt sich der absolute Tintenbegrenzungsbereich:

$$x_{\min}^{(k)} = \min_{\text{Segmente}} x_{\min}, \quad x_{\max}^{(k)} = \max_{\text{Segmente}} x_{\max}$$

**Beispiel** für »o« in Sub-Zone k = 20 ($y = 0 \ldots 12{,}5$ FU, Baseline-Bereich):

```
Advance Width (aw) = 560 FU
Sub-Zone k=20:  xMin = 48.3 FU,  xMax = 511.7 FU
Linker Rand:    L = xMin         = 48.3 FU
Rechter Rand:   R = aw − xMax   = 560 − 511.7 = 48.3 FU
```

---

## 5. Randmessung — Glow-Modus

Der Glow-Modus rasterisiert den Glyph auf einem Pixel-Canvas und misst Ränder anhand von Opazitätsverteilungen. Das ermöglicht eine optisch weichere Randwahrnehmung, die physikalische Lichtausbreitung simuliert.

### 5.1 Rasterisierung

Auflösung: **1 Pixel = 1 FU** (SC = 1).

Canvas-Abmessungen:

$$W = \lceil aw \rceil \ \text{px}, \quad H = \lceil y_{\text{Top}} \rceil + \max(0, \lceil -y_{\text{Bot}} \rceil) \ \text{px}$$

Der Glyph wird mit gefülltem Pfad auf schwarzem Hintergrund gerendert. Der Alpha-Kanal liefert ein Array `alpha[y][x] ∈ [0, 255]`.

### 5.2 Spalten-Opazität pro Sub-Zone

Für jede Sub-Zone $k$ und jede x-Spalte wird die mittlere Opazität über alle Zeilen der Sub-Zone berechnet:

$$\text{op}(k, x) = \frac{1}{n_{\text{rows}} \cdot 255} \sum_{r = r_{\text{lo}}}^{r_{\text{hi}}} \alpha[r][x]$$

Dabei ist $n_{\text{rows}} = r_{\text{hi}} - r_{\text{lo}} + 1$ die Zeilenanzahl der Sub-Zone (Koordinatenumrechnung: Pixel-Zeile $r = \lfloor y_{\text{Top}} - y \rfloor$).

Das Ergebnis ist eine **Opazitätsprofil-Funktion** $\text{op}(k, \cdot) \in [0, 1]^W$.

### 5.3 Horizontaler Box-Blur (`glowBlur`)

Um die Tinte optisch in den Weißraum zu spreizen, wird ein horizontaler Box-Blur der Breite `2 · glowBlur + 1` angewendet. Implementiert per **Präfix-Summe** in O(W):

$$\text{op}_{\text{blur}}(k, x) = \frac{1}{x_{\text{hi}} - x_{\text{lo}} + 1} \sum_{j = x_{\text{lo}}}^{x_{\text{hi}}} \text{op}(k, j)$$

mit $x_{\text{lo}} = \max(0,\, x - G)$, $x_{\text{hi}} = \min(W-1,\, x + G)$ und $G = \text{glowBlur}$ (in Pixeln = FU).

**Effekt:** Ein Glyph mit GlowBlur = 20 FU hat einen Einflussbereich von ±20 FU über seine harte Kontur hinaus.

### 5.4 Randbestimmung nach Blur

Die sichtbare Tintengrenze liegt dort, wo die geblurte Opazität einen Schwellwert überschreitet:

$$\varepsilon = 0{,}002 \quad (\approx 0{,}5/255)$$

$$x_{\min}^{(k)} = \min\{x \mid \text{op}_{\text{blur}}(k,x) \geq \varepsilon\}$$
$$x_{\max}^{(k)} = \max\{x \mid \text{op}_{\text{blur}}(k,x) \geq \varepsilon\}$$

**Beispiel** für »o« in Glow-Modus mit GlowBlur = 20 FU:

```
Geometrisch:  xMin = 48.3 FU,  xMax = 511.7 FU
Glow (Blur):  xMin = 28.5 FU,  xMax = 531.5 FU   ← 20 FU nach außen ausgedehnt
Linker Rand:  L = 28.5 FU (statt 48.3)
Rechter Rand: R = 560 − 531.5 = 28.5 FU (statt 48.3)
```

Der Glyph »erscheint« optisch breiter — der Zwischenraum ist entsprechend enger, die Kerning-Korrektur wird aggressiver.

---

## 6. Zonenaggregation und Glyphen-Cache

### 6.1 Mittelung über Sub-Zonen

Die `blur` Sub-Zonen jeder Zone $z$ (0-basiert, Zone $z$ enthält Sub-Zonen $z \cdot B \ldots z \cdot B + B - 1$) werden gemittelt:

$$L_{\text{roh}}[z] = \frac{1}{c} \sum_{s=0}^{B-1} x_{\min}^{(z \cdot B + s)}, \quad c = \text{Anzahl gültiger Sub-Zonen}$$

$$R_{\text{roh}}[z] = \frac{1}{c} \sum_{s=0}^{B-1} \bigl(aw - x_{\max}^{(z \cdot B + s)}\bigr)$$

Sind alle Sub-Zonen leer (kein Tintenkontakt), gilt $L[z] = R[z] = \texttt{null}$.

### 6.2 Glyphen-Cache-Objekt

Nach Glättung (s. Abschnitt 7) wird für jeden Glyph ein Cache-Eintrag angelegt:

```
glyphCache['o'] = {
  left:  [48.3, 47.1, 40.2, 28.0, …, null],   # geglättete linke Ränder je Zone
  right: [48.3, 47.1, 40.2, 28.0, …, null],   # geglättete rechte Ränder
  leftRaw:  […],    # ungeglättete linke Ränder (für Debugging)
  rightRaw: […],    # ungeglättete rechte Ränder
  advanceWidth: 560,
  charLabel: 'o',
  cls: 'LC',        # 'LC' oder 'UC'
  unicode: 0x6F
}
```

**Semantik der Ränder:**

```
  ┌──────────────────────────────┐  Advance Width = 560 FU
  │  L[z]        │         R[z]  │
  │◄─────────────►              │◄──────────►│
  │  linker Rand │    Tintenk.  │ rechter Rand│
  0             L[z]           560-R[z]      560
```

$L[z]$ = Abstand vom linken Advance-Rand zum linken Tintenrand in Zone $z$.  
$R[z]$ = Abstand vom rechten Tintenrand zum rechten Advance-Rand in Zone $z$.

---

## 7. Glättung der Ränder (`smoothMargins`)

Diagonale Striche (»V«, »A«, »W«) und offene Gegenformen (»n«, »u«) erzeugen bei groben Zonen Treppenartifakte, weil Kurven Zonengrenzen schräg schneiden. Die Glättung begrenzt, wie stark sich benachbarte Zonenwerte unterscheiden dürfen.

### 7.1 Anker-Zone

Die **Anker-Zone** $z^*$ ist die Zone mit dem kleinsten (engsten) Randwert — also die Zone maximaler Tintenausdehnung:

$$z^* = \arg\min_{z:\, L[z] \neq \text{null}} L[z]$$

**Beispiel** für »V« (linker Rand):

```
Zone  0 (unten):  L = 220.0 FU   ← oben breit
Zone  4:          L = 165.0 FU
Zone  8:          L =  72.0 FU   ← Spitze, engster Rand = Anker z* = 8
Zone 12:          L = 165.0 FU
Zone 15 (oben):   L = 220.0 FU   ← oben breit
```

### 7.2 Maximaler Schritt

$$\Delta_{\max} = p_{\text{smooth}} \cdot z_H = 0{,}5 \times 62{,}5 = 31{,}25 \ \text{FU}$$

### 7.3 Glättungsregel

Ausgehend vom Anker wird in beide Richtungen (aufwärts und abwärts) propagiert. Für jede Zone $z$ außerhalb des Ankers:

$$L_{\text{gegl}}[z] \leq L_{\text{gegl}}[\text{prev}] + \Delta_{\max}$$
$$L_{\text{gegl}}[z] \geq L_{\text{gegl}}[z^*] \quad (\text{Floor = Ankerwert})$$

Überschreitet ein Rohwert die Grenze, wird er auf die Grenze gesetzt (nach unten gekappt). Unterschreitet er den Ankerwert, wird er auf den Ankerwert angehoben.

**Beispiel** (V-Glyph, linker Rand, nach Glättung mit Smooth = 50):

```
Rohwerte:      [220, 190, 125, 102,  72, 102, 125, 190, 220]
Ankerwert:      72 FU (Zone 4), ΔMax = 31.25 FU

Schritt nach links vom Anker (Zone 4 → 3 → 2 → 1 → 0):
  Zone 3: max erlaubt = 72 + 31.25 = 103.25  →  Rohwert 102 ≤ 103.25 ✓  bleibt 102
  Zone 2: max erlaubt = 102 + 31.25 = 133.25 →  Rohwert 125 ≤ 133.25 ✓  bleibt 125
  Zone 1: max erlaubt = 125 + 31.25 = 156.25 →  Rohwert 190 > 156.25  →  geglättet = 156.25
  Zone 0: max erlaubt = 156.25 + 31.25 = 187.5 → Rohwert 220 > 187.5  →  geglättet = 187.5

Ergebnis:  [187.5, 156.25, 125, 102, 72, 102, 125, 156.25, 187.5]
```

Die Spitze bleibt scharf, die Flanken werden gleichmäßig begrenzt.

---

## 8. Basiswert-Ermittlung

### 8.1 Selbst-Paar des Referenzglyphs

Als Referenz-Abstand dient das **Selbst-Paar** des konfigurierten Referenzglyphs. Für Kleinbuchstaben ist das standardmäßig »o«:

Die Zonen-Lücke zwischen zwei nebeneinander stehenden »o« ist in Zone $z$:

$$G^{(oo)}[z] = R_{\text{o}}[z] + L_{\text{o}}[z]$$

Der **Paarmittelwert** über alle gültigen Zonen:

$$\bar{G}^{(oo)} = \frac{1}{|\mathcal{V}|} \sum_{z \in \mathcal{V}} G^{(oo)}[z]$$

wobei $\mathcal{V} = \{z \mid L_{\text{o}}[z] \neq \text{null} \wedge R_{\text{o}}[z] \neq \text{null}\}$.

### 8.2 Basiswerte mit Tracking

$$B_{\text{LC}} = \bar{G}^{(oo)} + \text{tracking}$$
$$B_{\text{UC}} = \bar{G}^{(OO)} + \text{tracking}$$

**Beispiel** (»o« bei 1000 UPM, Zones = 16, Blur = 5, kein Tracking):

```
Zonenlücken G[z]:  [87.5, 84.2, 80.1, 76.0, ..., 76.0, 80.1, 84.2, 87.5]  (16 Werte)
ø Paarmittelwert:  ≈ 80.0 FU

B_LC = 80.0 FU   (Tracking = 0 → keine Verschiebung)
```

Der Basiswert von 80 FU ist der **Ziel-Abstand** für alle Buchstabenpaare: jedes Paar soll optisch so weit auseinander stehen wie »o + o«.

---

## 9. Paar-Mittelwert (`pairMean`)

Für ein Buchstabenpaar (A, B) ist der **Paar-Mittelwert** der mittlere geometrische Abstand, den die Outlines im Satz erreichen:

$$\bar{G}^{(AB)} = \frac{1}{|\mathcal{V}_{AB}|} \sum_{z \in \mathcal{V}_{AB}} \bigl(R_A[z] + L_B[z]\bigr)$$

mit $\mathcal{V}_{AB} = \{z \mid R_A[z] \neq \text{null} \wedge L_B[z] \neq \text{null}\}$.

### Zonen-Detail-Objekt

Jede gültige Zone $z$ erzeugt ein Detail-Eintrag:

```
{ z: 7,  rA: 12.0,  lB: 68.0,  sum: 80.0 }
```

**Beispiel für »T« + »o«** (16 Zonen):

```
Zone   rT[z]   lO[z]   Summe    Bemerkung
───────────────────────────────────────────
  0    12.0    48.3    60.3     (»o« schmaler unten)
  4     8.5    40.2    48.7     (»T«-Balken rechts minimal)
  8     8.0    36.8    44.8     ← engster Spalt
 12   120.0    40.5   160.5     (T-Balken überragt nach rechts)
 15   220.0    48.3   268.3     (T-Kopf weit rechts)
───────────────────────────────────────────
Mittel aller 16 gültigen Zonen: ≈ 58.3 FU
```

---

## 10. Kerning-Korrektur

### 10.1 Rohkorrektur

Die Kerning-Korrektur ist die **Differenz zwischen Basiswert und Paar-Mittelwert**, gerundet auf das nächste Vielfache des Rundungsmoduls $M$:

$$K_{\text{roh}} = \text{round}\!\left(\frac{B - \bar{G}^{(AB)}}{M}\right) \cdot M$$

**Funktion `rtm`** (round-to-module):

$$\text{rtm}(v, M) = \text{round}\!\left(\frac{v}{M}\right) \cdot M$$

**Vorzeichen-Konvention:**
- $\bar{G}^{(AB)} < B$ → zu enger Abstand → $K > 0$ → Glyphen auseinanderrücken
- $\bar{G}^{(AB)} > B$ → zu weiter Abstand → $K < 0$ → Glyphen zusammenrücken

**Beispiel »T« + »o«** (B_LC = 80 FU, M = 20):

$$K_{\text{roh}} = \text{rtm}(80{,}0 - 58{,}3,\ 20) = \text{rtm}(21{,}7,\ 20) = \text{round}(1{,}085) \cdot 20 = 1 \cdot 20 = 20 \ \text{FU (zu weit → positiv???)}$$

Warte — nochmal: $B - \bar{G} = 80 - 58{,}3 = 21{,}7 > 0$. Der mittlere Abstand von »T«+»o« (58,3 FU) ist *kleiner* als der Basisabstand (80 FU). Das bedeutet: die Buchstaben stehen bereits enger zusammen als »o«+»o«. Korrektur > 0 → Paare auseinanderschieben?

**Achtung, Semantik:** In typografischen Konventionen bedeutet eine negative Kerning-Korrektur »näher zusammen«. Coupler berechnet den Wert so, dass er direkt als Advance-Width-Offset verwendet wird:

$$K < 0 \Rightarrow \text{Glyphen rücken näher}$$
$$K > 0 \Rightarrow \text{Glyphen rücken weiter auseinander}$$

Typisches Beispiel: »A« + »V« hat einen sehr großen mittleren Spalt (die Diagonalen lassen weiten Weißraum entstehen), also $\bar{G}^{(AV)} > B$, also $K = B - \bar{G}^{(AV)} < 0$: negative Kerning-Korrektur — »A« und »V« rücken näher.

### 10.2 Min-Gap-Begrenzung (Capping)

Falls $K < 0$ (Glyphen würden näher rücken), wird geprüft, ob die **engste Zone** einen Mindestabstand einhält:

$$G_{\min}^{(AB)} = \min_{z \in \mathcal{V}_{AB}} \bigl(R_A[z] + L_B[z]\bigr)$$

Mindestabstand in FU:

$$F_{\min} = \text{upm} \times p_{\text{mingap}} = 1000 \times 0{,}09 = 90 \ \text{FU}$$

Verfügbarer Spielraum:

$$\text{room} = G_{\min}^{(AB)} - F_{\min}$$

Maximale negative Korrektur:

$$K_{\max,\text{neg}} = \begin{cases} -\text{rtm}(\text{room},\, M) & \text{wenn room} > 0 \\ 0 & \text{sonst} \end{cases}$$

Falls $K < K_{\max,\text{neg}}$, wird $K$ auf $K_{\max,\text{neg}}$ gesetzt und das Paar als **gecappt** (`capped = true`) markiert.

**Beispiel »L« + »T«** (extrem enger Anschluss):

```
Basiswert B_LC   =  80.0 FU
Paar-Mittelwert  =  22.0 FU   (»L«-Serif rechts und »T«-Schaft links sehr nah)
Rohkorrektur     = rtm(80 − 22, 20) = rtm(58, 20) = −60 FU

Engste Zone G_min = 35.0 FU
F_min = 90 FU   → room = 35 − 90 = −55 FU   (negativ!)
→ room ≤ 0, also K_max,neg = 0

K_final = 0 (gecappt) ← Kein negativer Wert möglich, Min-Gap schon unterschritten
```

Ein anderes Beispiel mit room > 0:

```
G_min = 140 FU,  F_min = 90 FU,  room = 50 FU
K_max,neg = −rtm(50, 20) = −rtm(50, 20) = −60 FU

Rohkorrektur K = −80 FU → gecappt auf −60 FU
```

### 10.3 Threshold-Filter

Korrekturen mit kleinem Absolutbetrag werden als Rauschen verworfen:

$$K_{\text{final}} = \begin{cases} 0 & \text{wenn } |K| < \text{threshold} \\ K & \text{sonst} \end{cases}$$

Mit Threshold = 0 werden alle Korrekturen beibehalten.

---

## 11. Ausgabe-Datenstruktur

Jedes Paar erzeugt einen Eintrag in `kerningData`:

```javascript
{
  left:       'T',        // linker Glyph (char label oder glyph name)
  right:      'o',        // rechter Glyph
  correction: -60,        // Kerning-Korrektur in FU (negativ = enger)
  mean:       20.0,       // Paar-Mittelwert (gerundet auf 1 Dezimale)
  base:       80.0,       // verwendeter Basiswert
  tag:        'mixed',    // 'LC', 'UC', oder 'mixed'
  capped:     false,      // true wenn Min-Gap-Begrenzung aktiv war
  zones:      'z0:60.3,z1:62.1,…',   // Zonenwerte als String
  zonesArr:   [{z:0, rA:12.0, lB:48.3, sum:60.3}, …]
}
```

---

## 12. Vollständiges Rechenbeispiel: »A« + »V«

**Font:** 1000 UPM, `yBot = −250`, `yTop = 750`.  
**Parameter:** Zones = 16, Blur = 5, Smooth = 50, Min Gap = 9 %, Round = 20, Threshold = 0.

### Schritt 1: Zonenhöhe und Basiswert

$$z_H = \frac{750 - (-250)}{16} = 62{,}5 \ \text{FU}, \quad z_{H,\text{sub}} = 12{,}5 \ \text{FU}$$

Selbst-Paar »o+o«: Paar-Mittelwert = 80,0 FU → $B_{\text{LC}} = 80{,}0 \ \text{FU}$.

### Schritt 2: Ränder »A«

Das »A« hat eine V-förmige Unterstruktur. Der rechte Rand $R_A[z]$ ist in den unteren Zonen sehr klein (enger Winkel rechts des rechten Schenkels) und nimmt nach oben zu:

```
Zone  0  (−250 … −187.5):  R_A =  8.0   (untere Spitze des A, rechts sehr eng)
Zone  4  (  0 …  62.5):   R_A = 28.0
Zone  8  ( 250 … 312.5):  R_A = 82.0
Zone 12  ( 500 … 562.5):  R_A = 155.0   (A-Querstrebe ist durch, rechts weit)
Zone 15  ( 687.5 … 750): R_A = 198.0
```

### Schritt 3: Ränder »V«

Das »V« spiegelt »A« annähernd. Der linke Rand $L_B[z]$ ist oben breit, unten an der Spitze sehr schmal:

```
Zone  0:  L_V =   6.0   (Spitze unten)
Zone  4:  L_V =  32.0
Zone  8:  L_V =  88.0
Zone 12:  L_V = 155.0
Zone 15:  L_V = 200.0
```

### Schritt 4: Zonenspalt-Berechnung

$$G^{(AV)}[z] = R_A[z] + L_V[z]$$

```
Zone  0:   8.0 +   6.0 =  14.0 FU  ← sehr enger Spalt (Spitzen treffen sich)
Zone  4:  28.0 +  32.0 =  60.0 FU
Zone  8:  82.0 +  88.0 = 170.0 FU
Zone 12: 155.0 + 155.0 = 310.0 FU
Zone 15: 198.0 + 200.0 = 398.0 FU
```

Alle 16 Zonenwerte (vereinfacht angenommen sie steigen von 14 auf 398 linear):  
$\bar{G}^{(AV)} \approx 206{,}0 \ \text{FU}$

### Schritt 5: Rohkorrektur

$$K_{\text{roh}} = \text{rtm}(80{,}0 - 206{,}0,\ 20) = \text{rtm}(-126,\ 20) = -120 \ \text{FU}$$

### Schritt 6: Min-Gap-Prüfung

$$G_{\min}^{(AV)} = 14{,}0 \ \text{FU}, \quad F_{\min} = 90 \ \text{FU}$$

$$\text{room} = 14{,}0 - 90 = -76 \ \text{FU} \leq 0 \implies K_{\max,\text{neg}} = 0$$

Die engste Zone unterschreitet bereits den Min-Gap-Floor. Jede negative Korrektur würde die Situation verschlechtern.

$$K_{\text{final}} = 0 \quad (\text{gecappt, capped = true})$$

**Interpretation:** Die Buchstaben »A« und »V« können rein rechnerisch nicht enger zusammenrücken, ohne dass die untere Spitzenzone unter 90 FU fällt — aber selbst ohne Korrektur ist sie schon bei 14 FU. Die tatsächlich sinnvolle Kerning-Behandlung erfordert hier eine Anpassung des Min-Gap-Parameters oder der Zonen-Aufteilung.

---

## 13. Klassifizierung LC / UC

Jeder Glyph wird anhand seines Unicode-Werts klassifiziert:

| Bereich | Klasse |
|---------|--------|
| U+0030–U+0039 (Ziffern) | UC |
| U+0041–U+005A (A–Z) | UC |
| U+00C0–U+00D6, U+00D8–U+00DE (lat. Großbuchstaben) | UC |
| U+0100–U+017E gerade Codepunkte (lat. Erw. A, Großbuchstaben) | UC |
| U+0391–U+03A9 (Griechisch, Großbuchstaben) | UC |
| U+0410–U+042F (Kyrillisch, Großbuchstaben) | UC |
| Alles übrige | LC |

Für gemischte Paare (ein LC, ein UC) wird der **LC-Basiswert** verwendet und das Paar als `mixed` markiert.

---

## 14. Glyph-Klasse und Basiswert-Auswahl je Paar

$$B^{(AB)} = \begin{cases} B_{\text{UC}} & \text{wenn A und B beide UC} \\ B_{\text{LC}} & \text{sonst (LC–LC, LC–UC, UC–LC)} \end{cases}$$

---

## 15. Space-Paare

Für das Paar **Glyph + Leerzeichen** wird der rechte Rand des Glyphs mit dem linken Rand des Referenzglyphs kombiniert:

$$G^{(A,\text{space})}[z] = R_A[z] + L_{\text{ref}}[z]$$

und für **Leerzeichen + Glyph**:

$$G^{(\text{space},B)}[z] = R_{\text{ref}}[z] + L_B[z]$$

Das Leerzeichen simuliert einen »durchschnittlichen« Nachbarn — sein Randprofil entspricht dem des Referenzglyphs (LC-Base oder UC-Base). Nur Korrekturen über dem Threshold werden in `kerningData` aufgenommen.

---

## 16. Zusammenfassung der Berechnungspipeline

```
FONT (Outline-Pfade, Advance Widths, Metriken)
         │
         ▼
┌─────────────────────────────────────────────┐
│  Schritt 1: RANDMESSUNG (je Glyph)          │
│  Für jede der (zones × blur) Sub-Zonen:     │
│  Geometrisch: Bézier-Abtastung + Bisektion  │
│  Glow:        Rasterisierung + Box-Blur      │
│  → xMin[k], xMax[k] (oder null)             │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Schritt 2: ZONENAGGREGATION                │
│  Mittelung über blur Sub-Zonen              │
│  L_roh[z] = Ø(xMin[sub]),  R_roh[z] = Ø(aw − xMax[sub]) │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Schritt 3: GLÄTTUNG                        │
│  Anker = Zone mit minimalem Randwert        │
│  Schritlimit ΔMax = smooth × zH             │
│  Spreizung weg vom Anker, beidseitig        │
└──────────────────┬──────────────────────────┘
                   │
                   ▼  glyphCache[name] = {left[], right[]}
┌─────────────────────────────────────────────┐
│  Schritt 4: BASISWERT                       │
│  B_LC = pairMean(R_o, L_o) + tracking       │
│  B_UC = pairMean(R_O, L_O) + tracking       │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Schritt 5: PAARMITTELWERT (je Paar A+B)    │
│  G[z] = R_A[z] + L_B[z]                    │
│  Ø_G = Mittelwert über gültige Zonen        │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Schritt 6: KORREKTUR                       │
│  K = rtm(B − Ø_G, round)                   │
│  Capping: K ≥ −rtm(G_min − F_min, round)   │
│  Threshold: |K| < threshold → K = 0         │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
         kerningData[]
  {left, right, correction, mean, base, tag, capped}
```

---

*Dokumentation generiert aus dem Quellcode von `ui.html` · Coupler v5.01.12*
