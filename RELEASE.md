# Coupler — Release Notes

---

## v5.9.17b — 2026-05-09

**Fix — Apply to Glyphs crash (definitive).**

Diagnostic logging added in v5.9.17 revealed the exact crash point: `json.loads(urllib.parse.unquote(query))` inside `couplerDispatch_` for a 4.7 MB payload. Parsing this many bytes creates tens of thousands of Python objects, pushing the GC generation-2 counter from (0, 3, 7) to threshold (700, 10, 10). GC fires mid-parse, traverses `CouplerDialog.__dict__` — which holds live ObjC proxy objects (`_font`, `_webview`, `_window`) — and crashes in `visit_decref`.

Fix: `gc.disable()` at the start of `couplerDispatch_` (before any object allocation), `gc.enable()` in `finally`. The v5.9.17 IPC revert (single URL, one dispatch call) makes this safe: `gc.enable()` fires exactly once, after all ObjC work is complete. There is no window between chunk calls as in the earlier chunked protocol, which was why the identical guard in v5.9.16 failed.

- **Python** — `gc.disable()` / `gc.enable()` bracket all of `couplerDispatch_`. `_send_glyph_data` retains its own guard.
- **Diagnostic logging** — `_dbg()` calls remain in place; crash log at `/tmp/coupler_debug.txt`.

---

## v5.9.17 — 2026-05-09

**Fix — Apply to Glyphs crash (stable, reverts to v5.3.21 IPC pattern).**

The chunked `applykerning_start / chunk / done` protocol introduced after v5.3.21 was the root cause of the instability. Each chunk dispatch invoked `json.loads` inside an ObjC callback (`couplerDispatch_`), incrementally pushing the Python GC allocation counter upward across multiple runloop cycles. No single `gc.disable()` placement could reliably contain this because the threshold could be crossed on any of the N chunk calls — before or between any guard.

Fix: revert to the architecture proven stable in v5.3.21.

- **JS** — `applyToGlyphs()` sends a single `coupler://applykerning?<urlencoded_json>` URL. `sendKerningChunk` removed.
- **Python** — `couplerDispatch_` handles `applykerning` with a single `json.loads` call and immediately calls `_apply_kerning`. No chunk accumulation, no `_kerning_buf`, no gc guards in the dispatch loop.
- **GC** — `gc.disable()/gc.enable()` retained only in `_send_glyph_data`, exactly as in v5.3.21.

---

## v5.9.16 — 2026-05-09 *(superseded)*

**Fix — Apply to Glyphs crash (correct fix).**

v5.9.15 placed the `gc.disable()` guard on `_apply_kerning` / `_apply_spacing`, but the crash happened earlier: during `applykerning_chunk` processing inside `couplerDispatch_`, where `json.loads(urllib.parse.unquote(query))` creates thousands of Python objects and pushes the GC allocation threshold while the ObjC runtime is still on the call stack. The individual guards also called `gc.enable()` while `couplerDispatch_` had not yet returned, re-exposing the risk for any code that ran afterwards.

Fix: `gc.disable()` / `gc.enable()` now bracket the entire `couplerDispatch_` method (the outermost try/finally). This covers chunk accumulation, JSON parsing, and all downstream calls including `_apply_kerning`, `_apply_spacing`, and `_send_glyph_data`. The redundant individual wrappers on `_apply_kerning` and `_apply_spacing` are removed; `_send_glyph_data` retains its own guard as belt-and-suspenders.

---

## v5.9.15 — 2026-05-09

**Fix — Apply to Glyphs crash (superseded by v5.9.16).**
Added `gc.disable()` / `gc.enable()` wrappers to `_apply_kerning` and `_apply_spacing`. Did not cover the IPC chunk-accumulation phase; crash persisted.

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
