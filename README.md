# Coupler

**Coupler** computes optical kerning corrections from the actual glyph contour geometry of TrueType and OpenType fonts. All values are derived mathematically from outline shapes — no manual pair editing required.

Available as a **Glyphs plugin** and as a **browser-based standalone tool**.

| | |
|---|---|
| **Live demo** | [jrgdrs.github.io/Coupler](https://jrgdrs.github.io/Coupler) — run directly in the browser, no installation required |
| **Glyphs plugin** | [Download Coupler.zip](https://jrgdrs.github.io/Coupler/Coupler.zip) — unzip and double-click to install in Glyphs 3 |

---

## Using Coupler

### In the Browser

Open [jrgdrs.github.io/Coupler](https://jrgdrs.github.io/Coupler) in any modern browser — no installation, no account, no server. The tool runs entirely client-side.

1. Drop a `.ttf` or `.otf` file onto the drop zone, or click to browse.
2. Coupler parses the font, runs a cadence scan, and computes kerning automatically.
3. Inspect the results in the preview canvas and the Coupling Table.
4. Export the kerning pairs as a CSV file or copy them to the clipboard for use in font editors or scripting environments.

The browser version is suitable for quick evaluations, sharing a single font file without installing any software, and for users who work outside of Glyphs.

---

### In Glyphs 3

Download [Coupler.zip](https://jrgdrs.github.io/Coupler/Coupler.zip), unzip it, and double-click `Coupler.glyphsPlugin` to install. Restart Glyphs, then open the plugin from the Script or Window menu.

Coupler connects directly to the active font and master in Glyphs — no file export required:

1. Open the Coupler panel. It opens in compact mode by default.
2. Click **Load & Compute** to fetch the current font data from Glyphs and run the full analysis.
3. Adjust parameters and click **Recompute** as needed.
4. Click **Apply to Font** to write the kerning pairs directly into the Glyphs kerning table of the active master.

Switching masters or fonts and clicking **Load & Compute** again fetches the updated data. The cadence scan re-runs and pre-fills the Round module for the new font.

---

## Lightweight vs. Advanced Mode

Coupler offers two modes suited to different workflows and user groups. **In the browser, the full panel opens by default.** In Glyphs, the compact panel opens by default. Toggle between them by double-clicking the **Coupler** logo.

### Lightweight — Compact Panel

**For:** type designers in production, users who want fast automated kerning with minimal configuration. Default starting view in Glyphs.

The window shrinks to a narrow column showing only the essential controls:

- **Load & Compute** — fetches font data from Glyphs and runs the initial analysis. The Round module is pre-filled from the cadence scan of the lowercase `n`, adjusted to a practical rounding range (20–40 fu).
- **Cadence canvas** — visual confirmation of the stem rhythm used to derive the module.
- **Round module / Threshold / Lazy % / Pair limit** — the key parameters for per-font tuning.
- **Recompute** — re-runs the analysis with the current field values. Does not overwrite the Round module, so manual adjustments are preserved across recomputations.
- **Kerning to Clipboard** *(browser)* / **Apply to Font** *(Glyphs)* — delivers the result in one click.

For most production fonts, the workflow is: Load & Compute → verify the cadence value → Apply to Font. The entire process takes under a minute.

### Advanced — Full Panel

**For:** researchers, type engineers, and designers who want to understand or fine-tune the kerning model. Default starting view in the browser.

The full panel exposes the complete parameter set, a live preview canvas with margin overlays, the full Coupling Table with sortable columns and a regex filter, the Spacing Corrections tab, and the Cadence tab.

Key additional controls in the full panel:

- **Zones, Blur, Smooth, Glow, Lazy %** — tune the precision, style, and aggressiveness of the margin measurement and output model.
- **Preview canvas** — render any text string with kerning, margin zone overlays, baseline, x-height, and pair-by-pair inspection.
- **Cadence tab** — inspect and adjust the stem rhythm scan interactively with a visualization of the `n` glyph and its grid.
- **Spacing Corrections tab** — per-glyph sidebearing imbalance analysis with an advance-width histogram and direct apply to Glyphs.
- **Testpage** — A4 landscape print layout with multilingual sample texts at 9–16 pt.

Parameter presets (Serif Regular, Serif Italic, Sans Light, Slab Bold, …) provide a starting point for common font categories and can be used as a basis for further fine-tuning.

---

## How It Works

Coupler measures the left and right ink margins of every glyph at N horizontal zones, derives a target spacing baseline from the reference pair (o+o for lowercase, O+O for uppercase), and computes a correction for every pair as:

```
correction = base − pairMean
```

Negative correction = tighten spacing. Positive = loosen.

A full description of the mathematical pipeline — from input data through margin measurement, smoothing, baseline derivation, and pair correction — is documented in [MATH_en.md](MATH_en.md).

---

## Features

### Margin Measurement
- Each glyph is sliced into configurable horizontal **Zones** across the full em height.
- Per zone, Bézier intersection geometry (cubic and quadratic) determines the leftmost and rightmost ink extent.
- **Blur** sub-zones are averaged per zone to suppress staircase artifacts at oblique curve crossings.
- **Glow mode** switches to a rasterized pixel-scan method with configurable ink spread radius, producing optically weighted margins for high-contrast and ink-trap designs.

### Smoothing
- A reciprocal step-limit pass (**Smooth**) constrains margin jumps between adjacent zones, anchoring from the zone of maximum glyph extent outward.
- Handles diagonal strokes and open counters without manual zone overrides.

### Baseline & Pair Corrections
- Baseline spacing is derived from the self-pair of the reference glyph (`o+o` for LC, `O+O` for UC), adjusted by a global **Tracking** offset.
- **Min gap** is measured on the raw geometric outline regardless of Smooth or Glow, and covers parts of a glyph that extend beyond its advance width (negative sidebearings, descending strokes). Corrections that would bring real ink closer than this floor are raised and flagged (⚑).
- **Lazy %** reduces all computed corrections by the given percentage and re-snaps to the Round module, producing softer kerning tables.
- Corrections below **Threshold** are zeroed out (never overrides a Min gap enforcement).
- Final values are snapped to the nearest multiple of the **Round module**.

### Cadence Scan
- Automatically measures the stem rhythm of the lowercase `n` at the equator (half x-height).
- Derives a natural Round module from the stem interval and configurable divider.
- The raw cadence value is adjusted to a practical rounding range (20–40): halved if > 40, doubled if < 20.
- Pre-fills the Round module field on first font load.

### Spacing Corrections
- Analyzes self-pairs (A+A, n+n …) to detect sidebearing imbalances.
- Suggests advance-width and sidebearing adjustments per glyph.
- In Glyphs mode: applies corrections directly to the font.

---

## Parameters

| Parameter | Default | Description |
|---|---|---|
| Zones | 16 | Horizontal slices across the em. More = finer detail, slower. |
| Smooth | 50 | Reciprocal smoothing strength (0 = off, 99 = maximum). |
| Min gap % | 4 | Minimum ink distance as % of UPM. Measured on raw geometric outline, including protruding glyph parts. |
| Blur | 1 | Sub-zones per zone for margin averaging. Higher = smoother but slower. |
| Glow | on | Pixel-based margin measurement with ink spread. |
| Glow Blur | 20 | Ink spread radius in font units. |
| Round module | 20 | Snap corrections to multiples of N. Pre-filled from cadence (adjusted to 20–40 range). |
| Threshold | 0 | Discard corrections below this absolute value. Not applied to Min gap enforcements. |
| Lazy % | 20 | Reduce all corrections by this percentage and re-snap to Round module. 0 = full correction. |
| Base Glyph LC | o | Reference glyph for lowercase baseline. |
| Base Glyph UC | O | Reference glyph for uppercase baseline. |
| Tracking | 0 | Global offset on the effective base spacing. |
| Pair limit | 0 | Max pairs by text frequency. 0 = all pairs (default). |

Preset configurations are provided for Serif, Sans, and Slab fonts across Regular, Italic, Bold, and Bold Italic styles.

---

## Output

- **Coupling Table** — all kerning pairs with correction, pair mean, base value, class (LC/UC/mixed), and per-zone breakdown.
- **CSV export** — semicolon-delimited, one pair per line:
  ```
  Left;Right;Correction (Class zones) [cap]
  ```
- **Clipboard copy** — same format, for direct paste into scripting environments.
- **Apply to Font** — writes kerning pairs directly into the active Glyphs document (Glyphs mode).
- **Spacing corrections** — advance-width and sidebearing suggestions per glyph, with optional apply to Glyphs.

---

## Compact Panel

Double-clicking the **Coupler** logo switches to a compact single-column panel designed for production use alongside Glyphs. It exposes:

- Load & Compute (Glyphs mode)
- Cadence canvas — stem rhythm visualization
- Round module, Threshold, Pair limit fields
- Recompute (uses current field values, does not overwrite Round module)
- Kerning to Clipboard / Export CSV / Apply to Font

---

## Presets — Text Samples

The Testpage button opens an A4 landscape print window with six text blocks at 9–16 pt using multilingual sample texts. Coupler kerning is embedded. Export as PDF via Cmd+P.

---

## Mathematical Documentation

The full derivation of the kerning pipeline — input data, data objects, margin geometry, smoothing mathematics, baseline computation, pair correction formula, and worked examples — is documented in:

- [MATH_en.md](MATH_en.md) — English
- [MATH.md](MATH.md) — German (original)

---

## Links

| | |
|---|---|
| **Live demo** | [jrgdrs.github.io/Coupler](https://jrgdrs.github.io/Coupler) |
| **Glyphs plugin download** | [jrgdrs.github.io/Coupler/Coupler.zip](https://jrgdrs.github.io/Coupler/Coupler.zip) |
| **Source code** | [github.com/jrgdrs/Coupler](https://github.com/jrgdrs/Coupler) |
