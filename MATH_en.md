# Coupler — Mathematical Documentation of the Kerning Computation

## Executive Summary

Coupler computes kerning corrections automatically from the geometry of font outlines — no manual pair-by-pair editing required. Each glyph is sliced into horizontal zones and, for every zone, the distance between the ink boundary and the advance-width edge is measured; this value is called a *margin*. The self-pair of a reference glyph (default: »o«) yields a *base distance* that defines how far apart two characters should stand in normal text. For every letter pair, the average zone gap is computed and compared to the base distance: the difference — rounded to a configurable grid step — becomes the kerning correction. To prevent any pair from coming too close together, every correction is capped against a configurable minimum-gap floor.

---

> **Font:** A 1000-UPM font is used as the reference throughout all examples.  
> **Default parameters:** Zones = 16, Blur = 5, Smooth = 50, Min Gap = 9 %, Round = 20, Threshold = 0.

---

## 1. Input Data

### 1.1 Font Metrics

An OpenType font provides the following base measurements, all in **Font Units (FU)**:

| Symbol | Description | Typical value (1000 UPM) |
|--------|-------------|--------------------------|
| `upm` | Units Per Em | 1000 |
| `yTop` | Typographic ascender | 750 |
| `yBot` | Typographic descender | −250 |
| `aw` | Advance width of a glyph | e.g. 560 (»o«) |

`yTop` and `yBot` are read preferentially from `sTypoAscender`/`sTypoDescender` (OS/2 table), falling back to `hhea`. If neither is present: `yTop = 0.8 · upm`, `yBot = −0.2 · upm`.

### 1.2 Glyph Outline

Each glyph consists of a sequence of path commands:

```
M x y            — Moveto (lift pen)
L x y            — Lineto
Q x1 y1 x y      — Quadratic Bézier curve (TrueType)
C x1 y1 x2 y2 x y — Cubic Bézier curve (CFF/OTF)
Z                — Closepath
```

All coordinates are in the font coordinate system: **x grows rightward, y grows upward.**

### 1.3 Parameter Object `p`

The central parameter object carrying all settings:

```
p = {
  zones:     16,      # number of horizontal zones
  blur:       5,      # sub-zones per zone (vertical oversampling)
  smooth:    0.5,     # internal smoothing strength (UI value 50 → 1 − 50/100 = 0.5)
  mingap:   0.09,     # minimum zone gap as a fraction of UPM (UI: 9 %)
  round:     20,      # rounding module in FU
  threshold:  0,      # minimum absolute value for a correction to be retained
  tracking:   0,      # global offset applied to the base value
  baselc:   'o',      # reference glyph for lowercase
  baseuc:   'O',      # reference glyph for uppercase
  glow:    true,      # mode: Glow (pixel-based) or geometric
  glowblur:  20,      # blur radius in Glow mode (FU)
}
```

**Transformation of the Smooth UI value:**  
The UI input value `s` (0–99) is converted internally to:

$$p_{\text{smooth}} = \begin{cases} 0 & \text{if } s = 0 \\ 1 - \dfrac{s}{100} & \text{otherwise} \end{cases}$$

Example: UI value 50 → `p.smooth = 0.5`.

---

## 2. Coordinate System and Em Space

The **em space** is the interval `[yBot, yTop]` on the vertical axis.

```
  y = yTop =  750  ──────────────────────────  Ascender
                   │         ▓▓▓▓▓             │
                   │       ▓▓    ▓▓             │ Em space
                   │       ▓▓    ▓▓             │ 1000 FU
                   │         ▓▓▓▓▓             │
  y =    0  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  Baseline
                                               │
  y = yBot = -250  ──────────────────────────  Descender
```

Total height: `H_em = yTop − yBot = 750 − (−250) = 1000 FU`.

---

## 3. Zone Structure

### 3.1 Zones and Sub-Zones

The em space is divided into `zones` equal-height **zones**. Each zone is internally subdivided into `blur` **sub-zones**. Total sub-zone count:

$$N_{\text{sub}} = \text{zones} \times \text{blur} = 16 \times 5 = 80$$

Zone height:

$$z_H = \frac{y_{\text{Top}} - y_{\text{Bot}}}{\text{zones}} = \frac{1000}{16} = 62.5 \ \text{FU}$$

Sub-zone height:

$$z_{H,\text{sub}} = \frac{z_H}{\text{blur}} = \frac{62.5}{5} = 12.5 \ \text{FU}$$

### 3.2 Zone Boundaries

Sub-zone $k$ (0-based) spans:

$$y_{\text{lo}}(k) = y_{\text{Bot}} + k \cdot z_{H,\text{sub}}$$
$$y_{\text{hi}}(k) = y_{\text{lo}}(k) + z_{H,\text{sub}}$$

**Example** (k = 4):  
$y_{\text{lo}} = -250 + 4 \cdot 12.5 = -200 \ \text{FU}$,  
$y_{\text{hi}} = -200 + 12.5 = -187.5 \ \text{FU}$.

Zones are numbered from bottom (descender) to top (ascender); zone 0 starts at `yBot`.

---

## 4. Margin Measurement — Geometric Mode

In geometric mode, the Bézier curves of the glyph outline are evaluated directly.

### 4.1 Bézier Curve Evaluation

**Cubic Bézier** (CFF/OTF):

$$B(t) = (1-t)^3 P_0 + 3(1-t)^2 t\, P_1 + 3(1-t) t^2 P_2 + t^3 P_3, \quad t \in [0,1]$$

**Quadratic Bézier** (TrueType):

$$B(t) = (1-t)^2 P_0 + 2(1-t)\,t\, P_1 + t^2 P_2, \quad t \in [0,1]$$

### 4.2 x-Range per Segment and Sub-Zone (`segXRng`)

For each path segment and each sub-zone $[y_{\text{lo}}, y_{\text{hi}}]$:

1. **Sampling:** 513 uniformly spaced $t$-values $\{0, \tfrac{1}{512}, \ldots, 1\}$. For every sampled point with $y \in [y_{\text{lo}}, y_{\text{hi}}]$, $x_{\min}$ and $x_{\max}$ are accumulated.

2. **Bisection boundary correction:** At the zone boundaries $y = y_{\text{lo}}$ and $y = y_{\text{hi}}$, the crossing point is located precisely by recursive bisection (until $\Delta t < 0.05$) and contributed to $x_{\min}$/$x_{\max}$.

**Result** per segment: $\{x_{\min}, x_{\max}\}$ or `null` (no intersection with the sub-zone).

### 4.3 Aggregation Across All Segments (`pathXZones`)

All segments of a glyph are processed. Per sub-zone the absolute ink extent is:

$$x_{\min}^{(k)} = \min_{\text{segments}} x_{\min}, \quad x_{\max}^{(k)} = \max_{\text{segments}} x_{\max}$$

**Example** for »o« in sub-zone k = 20 ($y = 0 \ldots 12.5$ FU, baseline region):

```
Advance Width (aw) = 560 FU
Sub-zone k=20:  xMin = 48.3 FU,  xMax = 511.7 FU
Left margin:    L = xMin         = 48.3 FU
Right margin:   R = aw − xMax   = 560 − 511.7 = 48.3 FU
```

---

## 5. Margin Measurement — Glow Mode

Glow mode rasterises the glyph onto a pixel canvas and measures margins from opacity distributions, simulating the optical spread of ink into white space.

### 5.1 Rasterisation

Resolution: **1 pixel = 1 FU** (SC = 1).

Canvas dimensions:

$$W = \lceil aw \rceil \ \text{px}, \quad H = \lceil y_{\text{Top}} \rceil + \max(0, \lceil -y_{\text{Bot}} \rceil) \ \text{px}$$

The glyph is rendered as a filled path on a black background. The alpha channel yields an array `alpha[y][x] ∈ [0, 255]`.

### 5.2 Column Opacity per Sub-Zone

For each sub-zone $k$ and each x-column, the mean opacity over all rows of the sub-zone is computed:

$$\text{op}(k, x) = \frac{1}{n_{\text{rows}} \cdot 255} \sum_{r = r_{\text{lo}}}^{r_{\text{hi}}} \alpha[r][x]$$

where $n_{\text{rows}} = r_{\text{hi}} - r_{\text{lo}} + 1$ is the row count of the sub-zone (coordinate conversion: pixel row $r = \lfloor y_{\text{Top}} - y \rfloor$).

The result is an **opacity profile** $\text{op}(k, \cdot) \in [0, 1]^W$.

### 5.3 Horizontal Box Blur (`glowBlur`)

To spread the ink optically into white space, a horizontal box blur of width `2 · glowBlur + 1` is applied, implemented via **prefix sum** in O(W):

$$\text{op}_{\text{blur}}(k, x) = \frac{1}{x_{\text{hi}} - x_{\text{lo}} + 1} \sum_{j = x_{\text{lo}}}^{x_{\text{hi}}} \text{op}(k, j)$$

with $x_{\text{lo}} = \max(0,\, x - G)$, $x_{\text{hi}} = \min(W-1,\, x + G)$, and $G = \text{glowBlur}$ (pixels = FU).

**Effect:** A glyph with GlowBlur = 20 FU has an influence radius of ±20 FU beyond its hard contour.

### 5.4 Boundary Detection After Blur

The visible ink boundary is where the blurred opacity exceeds a threshold:

$$\varepsilon = 0.002 \quad (\approx 0.5/255)$$

$$x_{\min}^{(k)} = \min\{x \mid \text{op}_{\text{blur}}(k,x) \geq \varepsilon\}$$
$$x_{\max}^{(k)} = \max\{x \mid \text{op}_{\text{blur}}(k,x) \geq \varepsilon\}$$

**Example** for »o« in Glow mode with GlowBlur = 20 FU:

```
Geometric:   xMin = 48.3 FU,  xMax = 511.7 FU
Glow (blur): xMin = 28.5 FU,  xMax = 531.5 FU   ← extended 20 FU outward
Left margin: L = 28.5 FU (instead of 48.3)
Right margin: R = 560 − 531.5 = 28.5 FU (instead of 48.3)
```

The glyph appears optically wider — the inter-glyph gap is correspondingly narrower, making kerning corrections more aggressive.

---

## 6. Zone Aggregation and Glyph Cache

### 6.1 Averaging Over Sub-Zones

The `blur` sub-zones belonging to zone $z$ (0-based; zone $z$ contains sub-zones $z \cdot B \ldots z \cdot B + B - 1$) are averaged:

$$L_{\text{raw}}[z] = \frac{1}{c} \sum_{s=0}^{B-1} x_{\min}^{(z \cdot B + s)}, \quad c = \text{count of valid sub-zones}$$

$$R_{\text{raw}}[z] = \frac{1}{c} \sum_{s=0}^{B-1} \bigl(aw - x_{\max}^{(z \cdot B + s)}\bigr)$$

If all sub-zones are empty (no ink contact), $L[z] = R[z] = \texttt{null}$.

### 6.2 Glyph Cache Entry

After smoothing (see Section 7), a cache entry is created for each glyph:

```
glyphCache['o'] = {
  left:  [48.3, 47.1, 40.2, 28.0, …, null],   # smoothed left margins per zone
  right: [48.3, 47.1, 40.2, 28.0, …, null],   # smoothed right margins
  leftRaw:  […],    # unsmoothed left margins (for debugging)
  rightRaw: […],    # unsmoothed right margins
  advanceWidth: 560,
  charLabel: 'o',
  cls: 'LC',        # 'LC' or 'UC'
  unicode: 0x6F
}
```

**Semantics of margins:**

```
  ┌──────────────────────────────┐  Advance Width = 560 FU
  │  L[z]        │         R[z]  │
  │◄─────────────►              │◄──────────►│
  │  left margin │   ink body   │ right margin│
  0             L[z]           560-R[z]      560
```

$L[z]$ = distance from the left advance edge to the leftmost ink in zone $z$.  
$R[z]$ = distance from the rightmost ink to the right advance edge in zone $z$.

---

## 7. Margin Smoothing (`smoothMargins`)

Diagonal strokes (»V«, »A«, »W«) and open counters (»n«, »u«) produce staircase artefacts with coarse zoning, because curves cross zone boundaries obliquely. Smoothing limits how much adjacent zone values may differ.

### 7.1 Anchor Zone

The **anchor zone** $z^*$ is the zone with the smallest (tightest) margin value — the zone of maximum ink extent:

$$z^* = \arg\min_{z:\, L[z] \neq \text{null}} L[z]$$

**Example** for »V« (left margin):

```
Zone  0 (bottom):  L = 220.0 FU   ← wide at top
Zone  4:           L = 165.0 FU
Zone  8:           L =  72.0 FU   ← tip, tightest margin → anchor z* = 8
Zone 12:           L = 165.0 FU
Zone 15 (top):     L = 220.0 FU   ← wide at top
```

### 7.2 Maximum Step

$$\Delta_{\max} = p_{\text{smooth}} \cdot z_H = 0.5 \times 62.5 = 31.25 \ \text{FU}$$

### 7.3 Smoothing Rule

Starting from the anchor, propagation proceeds in both directions (upward and downward). For every zone $z$ away from the anchor:

$$L_{\text{smooth}}[z] \leq L_{\text{smooth}}[\text{prev}] + \Delta_{\max}$$
$$L_{\text{smooth}}[z] \geq L_{\text{smooth}}[z^*] \quad (\text{floor = anchor value})$$

If a raw value exceeds the limit it is capped downward. If it falls below the anchor value it is raised to the anchor value.

**Example** (»V« glyph, left margin, after smoothing with Smooth = 50):

```
Raw values:     [220, 190, 125, 102,  72, 102, 125, 190, 220]
Anchor value:    72 FU (zone 4),  ΔMax = 31.25 FU

Propagating left from anchor (zone 4 → 3 → 2 → 1 → 0):
  Zone 3: max allowed = 72 + 31.25 = 103.25  →  raw 102 ≤ 103.25 ✓  unchanged
  Zone 2: max allowed = 102 + 31.25 = 133.25 →  raw 125 ≤ 133.25 ✓  unchanged
  Zone 1: max allowed = 125 + 31.25 = 156.25 →  raw 190 > 156.25  →  smoothed = 156.25
  Zone 0: max allowed = 156.25 + 31.25 = 187.5 → raw 220 > 187.5  →  smoothed = 187.5

Result: [187.5, 156.25, 125, 102, 72, 102, 125, 156.25, 187.5]
```

The tip remains sharp; the flanks are limited to a uniform step rate.

---

## 8. Base Value Computation

### 8.1 Self-Pair of the Reference Glyph

The reference distance is derived from the **self-pair** of the configured reference glyph. For lowercase, the default is »o«.

The zone gap between two adjacent »o« glyphs in zone $z$:

$$G^{(oo)}[z] = R_{\text{o}}[z] + L_{\text{o}}[z]$$

The **pair mean** over all valid zones:

$$\bar{G}^{(oo)} = \frac{1}{|\mathcal{V}|} \sum_{z \in \mathcal{V}} G^{(oo)}[z]$$

where $\mathcal{V} = \{z \mid L_{\text{o}}[z] \neq \text{null} \wedge R_{\text{o}}[z] \neq \text{null}\}$.

### 8.2 Base Values with Tracking

$$B_{\text{LC}} = \bar{G}^{(oo)} + \text{tracking}$$
$$B_{\text{UC}} = \bar{G}^{(OO)} + \text{tracking}$$

**Example** (»o« at 1000 UPM, Zones = 16, Blur = 5, no tracking):

```
Zone gaps G[z]:   [87.5, 84.2, 80.1, 76.0, ..., 76.0, 80.1, 84.2, 87.5]  (16 values)
Mean pair gap:    ≈ 80.0 FU

B_LC = 80.0 FU   (Tracking = 0 → no shift)
```

The base value of 80 FU is the **target gap** for all glyph pairs: every pair should be optically as far apart as »o + o«.

---

## 9. Pair Mean (`pairMean`)

For a letter pair (A, B), the **pair mean** is the average geometric gap between their outlines in typeset text:

$$\bar{G}^{(AB)} = \frac{1}{|\mathcal{V}_{AB}|} \sum_{z \in \mathcal{V}_{AB}} \bigl(R_A[z] + L_B[z]\bigr)$$

with $\mathcal{V}_{AB} = \{z \mid R_A[z] \neq \text{null} \wedge L_B[z] \neq \text{null}\}$.

### Zone Detail Object

Each valid zone $z$ produces a detail entry:

```
{ z: 7,  rA: 12.0,  lB: 68.0,  sum: 80.0 }
```

**Example for »T« + »o«** (16 zones):

```
Zone   rT[z]   lO[z]   Sum      Note
───────────────────────────────────────────
  0    12.0    48.3    60.3     (»o« narrower at bottom)
  4     8.5    40.2    48.7     (»T« overhang minimal)
  8     8.0    36.8    44.8     ← tightest gap
 12   120.0    40.5   160.5     (T crossbar overhangs right)
 15   220.0    48.3   268.3     (T head far right)
───────────────────────────────────────────
Mean of all 16 valid zones:  ≈ 58.3 FU
```

---

## 10. Kerning Correction

### 10.1 Raw Correction

The kerning correction is the **difference between the base value and the pair mean**, rounded to the nearest multiple of the rounding module $M$:

$$K_{\text{raw}} = \text{round}\!\left(\frac{B - \bar{G}^{(AB)}}{M}\right) \cdot M$$

**Function `rtm`** (round-to-module):

$$\text{rtm}(v, M) = \text{round}\!\left(\frac{v}{M}\right) \cdot M$$

**Sign convention:**
- $\bar{G}^{(AB)} < B$ → gap is smaller than target → $K > 0$ → glyphs are pushed apart
- $\bar{G}^{(AB)} > B$ → gap is larger than target → $K < 0$ → glyphs are pulled together

**Example »A« + »V«** (B_LC = 80 FU, pair mean ≈ 206 FU, M = 20):

$$K_{\text{raw}} = \text{rtm}(80 - 206,\ 20) = \text{rtm}(-126,\ 20) = -120 \ \text{FU}$$

The wide diagonal gap between »A« and »V« means the pair sits far apart — the large negative correction pulls them together.

### 10.2 Min-Gap Cap

If $K < 0$ (glyphs would move closer), it is verified that the **tightest zone** still respects the minimum gap:

$$G_{\min}^{(AB)} = \min_{z \in \mathcal{V}_{AB}} \bigl(R_A[z] + L_B[z]\bigr)$$

Minimum gap in FU:

$$F_{\min} = \text{upm} \times p_{\text{mingap}} = 1000 \times 0.09 = 90 \ \text{FU}$$

Available room:

$$\text{room} = G_{\min}^{(AB)} - F_{\min}$$

Maximum negative correction:

$$K_{\max,\text{neg}} = \begin{cases} -\text{rtm}(\text{room},\, M) & \text{if room} > 0 \\ 0 & \text{otherwise} \end{cases}$$

If $K < K_{\max,\text{neg}}$, then $K$ is set to $K_{\max,\text{neg}}$ and the pair is flagged as **capped** (`capped = true`).

**Example »L« + »T«** (extreme tight approach):

```
Base value B_LC    =  80.0 FU
Pair mean          =  22.0 FU   (»L« serif right, »T« stem left very close)
Raw correction     = rtm(80 − 22, 20) = rtm(58, 20) → nearest multiple = −60 FU

Tightest zone G_min = 35.0 FU
F_min = 90 FU  →  room = 35 − 90 = −55 FU  (negative!)
→ room ≤ 0, so K_max,neg = 0

K_final = 0 (capped) ← the min-gap floor is already violated without any correction
```

A second example with room > 0:

```
G_min = 140 FU,  F_min = 90 FU,  room = 50 FU
K_max,neg = −rtm(50, 20) = −60 FU

Raw correction K = −80 FU → capped to −60 FU
```

### 10.3 Threshold Filter

Corrections with a small absolute value are discarded as noise:

$$K_{\text{final}} = \begin{cases} 0 & \text{if } |K| < \text{threshold} \\ K & \text{otherwise} \end{cases}$$

With Threshold = 0, all corrections are retained.

---

## 11. Output Data Structure

Each pair produces one entry in `kerningData`:

```javascript
{
  left:       'T',        // left glyph (char label or glyph name)
  right:      'o',        // right glyph
  correction: -60,        // kerning correction in FU (negative = tighter)
  mean:       20.0,       // pair mean (rounded to 1 decimal)
  base:       80.0,       // base value used
  tag:        'mixed',    // 'LC', 'UC', or 'mixed'
  capped:     false,      // true if the min-gap cap was applied
  zones:      'z0:60.3,z1:62.1,…',    // zone values as string
  zonesArr:   [{z:0, rA:12.0, lB:48.3, sum:60.3}, …]
}
```

---

## 12. Complete Worked Example: »A« + »V«

**Font:** 1000 UPM, `yBot = −250`, `yTop = 750`.  
**Parameters:** Zones = 16, Blur = 5, Smooth = 50, Min Gap = 9 %, Round = 20, Threshold = 0.

### Step 1: Zone height and base value

$$z_H = \frac{750 - (-250)}{16} = 62.5 \ \text{FU}, \quad z_{H,\text{sub}} = 12.5 \ \text{FU}$$

Self-pair »o+o«: pair mean = 80.0 FU → $B_{\text{LC}} = 80.0 \ \text{FU}$.

### Step 2: Margins of »A«

The »A« has a V-shaped structure. The right margin $R_A[z]$ is very small in the lower zones (tight diagonal right of the right leg) and grows toward the top:

```
Zone  0  (−250 … −187.5):  R_A =   8.0   (bottom point of A, very tight on right)
Zone  4  (   0 …   62.5):  R_A =  28.0
Zone  8  ( 250 …  312.5):  R_A =  82.0
Zone 12  ( 500 …  562.5):  R_A = 155.0   (crossbar clears, wide on right)
Zone 15  ( 687.5 …  750):  R_A = 198.0
```

### Step 3: Margins of »V«

»V« mirrors »A« approximately. The left margin $L_B[z]$ is wide at the top, very narrow at the bottom tip:

```
Zone  0:  L_V =   6.0   (bottom tip)
Zone  4:  L_V =  32.0
Zone  8:  L_V =  88.0
Zone 12:  L_V = 155.0
Zone 15:  L_V = 200.0
```

### Step 4: Zone gap calculation

$$G^{(AV)}[z] = R_A[z] + L_V[z]$$

```
Zone  0:   8.0 +   6.0 =  14.0 FU  ← very tight (tips meet)
Zone  4:  28.0 +  32.0 =  60.0 FU
Zone  8:  82.0 +  88.0 = 170.0 FU
Zone 12: 155.0 + 155.0 = 310.0 FU
Zone 15: 198.0 + 200.0 = 398.0 FU
```

Assuming all 16 zone values increase roughly linearly from 14 to 398:  
$\bar{G}^{(AV)} \approx 206.0 \ \text{FU}$

### Step 5: Raw correction

$$K_{\text{raw}} = \text{rtm}(80.0 - 206.0,\ 20) = \text{rtm}(-126,\ 20) = -120 \ \text{FU}$$

### Step 6: Min-gap check

$$G_{\min}^{(AV)} = 14.0 \ \text{FU}, \quad F_{\min} = 90 \ \text{FU}$$

$$\text{room} = 14.0 - 90 = -76 \ \text{FU} \leq 0 \implies K_{\max,\text{neg}} = 0$$

The tightest zone already falls below the min-gap floor. Any negative correction would make it worse.

$$K_{\text{final}} = 0 \quad (\text{capped, capped = true})$$

**Interpretation:** »A« and »V« cannot be moved closer without violating the minimum gap in the tip zone — which is already at 14 FU against a floor of 90 FU. A meaningful result requires adjusting the Min Gap parameter or the zone count.

---

## 13. LC / UC Classification

Each glyph is classified based on its Unicode value:

| Range | Class |
|-------|-------|
| U+0030–U+0039 (digits) | UC |
| U+0041–U+005A (A–Z) | UC |
| U+00C0–U+00D6, U+00D8–U+00DE (Latin uppercase extensions) | UC |
| U+0100–U+017E even codepoints (Latin Extended-A, uppercase) | UC |
| U+0391–U+03A9 (Greek uppercase) | UC |
| U+0410–U+042F (Cyrillic uppercase) | UC |
| Everything else | LC |

For mixed pairs (one LC, one UC), the **LC base value** is used and the pair is tagged `mixed`.

---

## 14. Glyph Class and Base Value Selection per Pair

$$B^{(AB)} = \begin{cases} B_{\text{UC}} & \text{if both A and B are UC} \\ B_{\text{LC}} & \text{otherwise (LC–LC, LC–UC, UC–LC)} \end{cases}$$

---

## 15. Space Pairs

For the pair **glyph + space**, the right margin of the glyph is combined with the left margin of the reference glyph:

$$G^{(A,\text{space})}[z] = R_A[z] + L_{\text{ref}}[z]$$

And for **space + glyph**:

$$G^{(\text{space},B)}[z] = R_{\text{ref}}[z] + L_B[z]$$

The space simulates an »average« neighbour — its margin profile matches that of the reference glyph (LC or UC base). Only corrections exceeding the threshold are added to `kerningData`.

---

## 16. Full Computation Pipeline

```
FONT (outline paths, advance widths, metrics)
         │
         ▼
┌─────────────────────────────────────────────┐
│  Step 1: MARGIN MEASUREMENT (per glyph)     │
│  For each of (zones × blur) sub-zones:      │
│  Geometric: Bézier sampling + bisection     │
│  Glow:      rasterisation + box blur        │
│  → xMin[k], xMax[k] (or null)              │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Step 2: ZONE AGGREGATION                   │
│  Average over blur sub-zones                │
│  L_raw[z] = mean(xMin[sub])                │
│  R_raw[z] = mean(aw − xMax[sub])           │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Step 3: SMOOTHING                          │
│  Anchor = zone with minimum margin value    │
│  Step limit ΔMax = smooth × zH             │
│  Propagate outward from anchor, both sides  │
└──────────────────┬──────────────────────────┘
                   │
                   ▼  glyphCache[name] = {left[], right[]}
┌─────────────────────────────────────────────┐
│  Step 4: BASE VALUE                         │
│  B_LC = pairMean(R_o, L_o) + tracking      │
│  B_UC = pairMean(R_O, L_O) + tracking      │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Step 5: PAIR MEAN (per pair A+B)           │
│  G[z] = R_A[z] + L_B[z]                   │
│  mean_G = average over valid zones          │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Step 6: CORRECTION                         │
│  K = rtm(B − mean_G, round)                │
│  Cap: K ≥ −rtm(G_min − F_min, round)       │
│  Threshold: |K| < threshold → K = 0         │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
         kerningData[]
  {left, right, correction, mean, base, tag, capped}
```

---

*Documentation generated from the source of `ui.html` · Coupler v5.01.12*
