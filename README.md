# Coupler – Functionality Overview

**Coupler** is a font analysis tool designed to support and experiment with automated kerning processes. It analyzes font files and derives spacing metrics that can be used to generate kerning values systematically.

The tool processes font files (`.ttf` and `.otf`) from a local directory and performs a detailed geometric analysis of each glyph based on its Bézier outlines.

---

## Core Features

### 1. Glyph Margin Analysis
- Each glyph is divided vertically into a configurable number of height zones based on the font’s UPM (units per em).
- For every zone, the tool calculates:
  - **Left margin**: distance from the glyph’s leftmost contour to the left boundary.
  - **Right margin**: distance from the glyph’s rightmost contour to the advance width boundary.
- If no glyph content exists in a zone, the value is set to `-1`.
- Values are rounded to one decimal place and stored as arrays.
- Results are exported as JSON files per font in a `/margins` directory.
- Both raw (**unweighted**) and smoothed (**weighted**) margin values are stored.

---

### 2. Pair Spacing Calculation
- All glyphs are combined into pairs.
- For each pair and each height zone:
  - The gap is calculated as:  
    `right margin of first glyph + left margin of second glyph`
- Only zones where both glyphs have valid values are considered.
- Results are stored in `/pairs` as JSON files.

---

### 3. Kerning Value Generation
- A baseline spacing value is calculated:
  - For lowercase: based on the pair **“o + o”**
  - For uppercase and lining figures: based on **“O + O”**
- For each pair:
  - The average gap across valid zones is computed.
  - A kerning correction is derived by comparing this average to the baseline.
- Interpretation:
  - **Negative values** → tighten spacing  
  - **Positive values** → loosen spacing  
- Optional rounding to a configurable module (e.g. multiples of 46).

---

## Constraints and Refinements

### Minimum Gap Constraint
- Ensures spacing never falls below a defined percentage of the em size.
- Applied per zone, based on the tightest zone of the pair.

### Threshold Filtering
- Small kerning values below a defined threshold are ignored.

### Smoothing
- Margin values are smoothed across zones to avoid abrupt jumps.
- Uses the smallest margin (maximum glyph extent) as an anchor.

### Blur (Supersampling)
- Each zone is subdivided into finer slices.
- Margins are averaged across these slices for higher precision.

---

## Output

- Kerning values are exported as semicolon-separated CSV:
