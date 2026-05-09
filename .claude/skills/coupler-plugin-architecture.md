# Skill: Coupler Plugin Architecture

## Overview

```
┌─────────────────────────────────────────────────────┐
│  Glyphs 3 (host app)                                │
│  ┌────────────────────────────────────────────────┐ │
│  │  CouplerDialog (Python / PyObjC)               │ │
│  │  - _send_glyph_data()  → evaluateJavaScript    │ │
│  │  - _apply_kerning()    ← chunked IPC           │ │
│  │  - _apply_spacing()    ← URL IPC               │ │
│  │  ┌──────────────────────────────────────────┐  │ │
│  │  │  WKWebView  (ui.html)                    │  │ │
│  │  │  - computation: JS only                  │  │ │
│  │  │  - output: applyToGlyphs / exportCSV     │  │ │
│  │  │            copyKerningToClipboard         │  │ │
│  │  └──────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Data flow — Load & Compute

1. JS navigates `coupler://requestdata`
2. `_NavDelegate` cancels navigation, defers `couplerDispatch_` via `performSelector:afterDelay:0`
3. Python calls `_send_glyph_data()`:
   - Reads all glyphs from Glyphs API → JSON (can be several MB)
   - Calls `evaluateJavaScript('receiveGlyphData(<json>)', None)`
4. JS `receiveGlyphData()` runs full computation:
   - Builds `glyphCache` (margins, geometry)
   - Builds `kerningData` (all pair corrections)
   - Updates UI (coupling table, preview)

## Data flow — Apply to Font

Uses chunked IPC (see `wkwebview-ipc.md`):
1. JS: `window._couplerKerning = outputPairs()` → `coupler://applykerning_start?n=N`
2. Python: init buffer, call `_js('sendKerningChunk(0)')`
3. JS: send 200 pairs as `coupler://applykerning_chunk?<json>`
4. Python: accumulate, call `_js('sendKerningChunk(next)')`
5. JS: when exhausted → `coupler://applykerning_done`
6. Python: `_apply_kerning(all_pairs)` → Glyphs API

## Key JS globals

| Name | Purpose |
|---|---|
| `kerningData` | All computed pairs, in fuchs frequency order |
| `filteredData` | Coupling table view (filtered/sorted subset) |
| `glyphCache` | Per-glyph margin data keyed by glyph key |
| `IS_GLYPHS` | `true` when running inside Glyphs WKWebView |
| `window._couplerKerning` | Staging area for chunked IPC to Python |

## outputPairs() — the single source of truth for output

```js
function outputPairs() {
  const p = P();
  const nz = kerningData.filter(d => d.correction !== 0);
  return p.pairlimit > 0 ? nz.slice(0, p.pairlimit) : nz;
}
```

**Always use `outputPairs()` for Apply / Copy / CSV.** Never use `kerningData` directly
for output — it bypasses the pair limit.

## Margin geometry — two separate arrays per glyph

Each glyph cache entry has **two** sets of margins:

| Field | What it is | Used for |
|---|---|---|
| `left` / `right` | Smooth + optional glow | Kerning correction computation |
| `leftGeom` / `rightGeom` | Raw pathXZones only (no glow, no smooth) | Min-gap enforcement |

Min-gap **must** use `leftGeom`/`rightGeom` — glow inflates margins and would make the
physical ink boundary check inconsistent between glow=on and glow=off.

## Panel modes

| Mode | Default for | Body class |
|---|---|---|
| Compact (light) | Glyphs plugin | `light-mode` |
| Advanced (full) | Browser | *(no class)* |

Toggle: double-click the Coupler logo. Controlled by `let lightMode = IS_GLYPHS`.

## fuchs.js / KERNING_PAIRS

- `KERNING_PAIRS` is a flat array of 2-char strings, ordered by real-world frequency
- `buildPairQueue(labelToKey, limit)` walks it and returns `[{kA, kB}]` up to `limit` (0=all)
- `cLbl(unicode, gn, gk)` returns the unicode character as primary label so pairs match
  entries in KERNING_PAIRS — glyph names (e.g. "adieresis") do NOT match

## Files

| File | Role |
|---|---|
| `glyphs/.../ui.html` | All JS computation, UI, IPC (single file) |
| `glyphs/.../plugin.py` | PyObjC host, WKWebView setup, Glyphs API calls |
| `glyphs/.../fuchs.js` | KERNING_PAIRS frequency corpus |
| `browser/index.html` | Standalone browser version (no Python) |
