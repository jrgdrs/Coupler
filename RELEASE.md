# Coupler — Release Notes

---

## v5.9.15 — 2026-05-09

**Fix — Apply to Glyphs crash.**
The Glyphs app no longer crashes after "Apply to Glyphs" in advanced mode.
Root cause: Python's cyclic garbage collector (`gc_collect_main`) was traversing Python dicts that held live Objective-C proxy objects during write-back, triggering `visit_decref` → SIGABRT.
Fix: GC is suspended for the duration of the kerning and spacing write-back operations (`_apply_kerning`, `_apply_spacing`), matching the same guard already used during glyph data import.

---

## v5.9.10–5.9.14 — AutoParam

New **⚙ AutoParam** button left of the Presets dropdown.

Scans all eight analysis parameters (Zones, Smooth, Blur, Glow Blur, Round, Threshold, Lazy, Min Gap) sequentially and pre-fills the fields with font-specific optimal values.

**Sensitivity metric:** *Laufweite* — total text width (sum of advance widths + kerning corrections) for a 26-word test string covering all uppercase initials and a broad range of letter shapes:
> Arrowroot Barley Chervil Dumpling Endive Flaxseed Garbanzo Hijiki Ishtu Jicama Kale Lychee Marjoram Nectarine Oxtail Pizza Quinoa Roquefort Squash Tofu Uppuma Vanilla Wheat Xergis Yogurt Zweiback

**Selection algorithm:** *lower average* — the candidate whose Laufweite is closest to the mean of all below-mean values, representing the converged stable state of accurate kerning.

**Performance:** lite analysis per scan step processes only the ~52 glyphs and ~130 pairs present in the test string — no full KERNING_PAIRS lookup, no UI updates — roughly 50–100× faster than a full analysis.

**Scan order:** Zones → Smooth → Blur → Glow Blur → Round → Threshold → Lazy → Min Gap. Each scan accumulates the optimal values already found for earlier parameters.

**UI:** during the scan the parameter panel is hidden and the log fills the full panel height; both are restored on completion.

Available in browser mode and Glyphs plugin mode (requires font data loaded via Load & Compute).

AutoParam test string added as first entry in the Preview text preset dropdown.

---

## v5.5 — Build system

Source code is now modular — no user-visible changes to the tool.

- `src/html/template.html` — HTML skeleton with `%%STYLE%%` and `%%SCRIPTS%%` placeholders
- `src/css/style.css` — stylesheet
- `src/js/01-globals.js` … `src/js/14-autoparam.js` — 14 JS modules
- `build.js` assembles all sources into `ui.html` (`npm run build`)
- Jest unit test suite covers core margin measurement and kerning math (`npm test`)
- `make.sh` updated to call `build.js` before copying artefacts

---

## v5.4.21 and earlier

See git log.
