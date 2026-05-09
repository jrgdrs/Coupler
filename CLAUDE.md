# Coupler — Projekt-Übersicht für Claude Code

## Was ist das Projekt

Coupler berechnet optisches Kerning aus Glyphen-Konturen. Zwei Distributions-Formen:
- **Glyphs-Plugin** (`glyphs/Coupler.glyphsPlugin/`) — läuft in Glyphs 3
- **Browser-Tool** (`docs/index.html`) — läuft clientseitig ohne Server

Beide Versionen sind **dieselbe Datei**: `ui.html`.

---

## Source of Truth

```
src/html/template.html        ← HTML-Skelett mit %%STYLE%% und %%SCRIPTS%% Platzhaltern
src/css/style.css             ← CSS (wird in %%STYLE%% injiziert)
src/js/01-globals.js          ← JS-Module 01–13 (werden in %%SCRIPTS%% injiziert)
  …
src/js/13-glyphs-init.js
src/py/path_utils.py          ← Pfad-Konvertierung (testbar ohne Glyphs)
src/py/nav_delegate.py        ← WKNavigationDelegate IPC Bridge
src/py/dialog.py              ← CouplerDialog
src/py/plugin_entry.py        ← GeneralPlugin Entry Point
src/vendor/opentype.min.js    ← Lokale Fallback-Kopie (CDN wird im Build verwendet)
```

**Build-Artefakte** (nicht direkt editieren):
```
glyphs/Coupler.glyphsPlugin/Contents/Resources/ui.html   ← generiert von build.js
glyphs/Coupler.glyphsPlugin/Contents/Resources/plugin.py ← Python/PyObjC Host (noch manuell)
glyphs/Coupler.glyphsPlugin/Contents/Resources/fuchs.js  ← Kerning-Corpus (nicht editieren)
docs/index.html                                           ← kopiert von make.sh
```

**Niemals** `docs/index.html` oder `ui.html` direkt editieren — werden von `build.js` / `make.sh` überschrieben.

---

## Build & Deploy

```bash
bash make.sh          # ruft zuerst node build.js auf, dann kopiert
npm run build         # nur build.js (kein make.sh)
npm run build:obf     # obfuskiert JS (jeder Build anders)
npm test              # JS-Unit-Tests (Jest)
```

Was make.sh tut:
1. Ruft `node build.js` auf → assembliert `src/` → `ui.html`
2. Kopiert `ui.html` → `docs/index.html` (GitHub Pages / Live Demo)
3. Kopiert `ui.html` → `glyphs/index.html`
4. Kopiert `fuchs.js` → `docs/fuchs.js`
5. Baut `docs/Coupler.zip` aus dem `glyphs/`-Verzeichnis

Nach `make.sh` git-commit und push → Live Demo und Download aktualisiert.

---

## Browser vs. Glyphs — gleiche Datei, unterschiedliches Verhalten

```js
const IS_GLYPHS = !!window.__IS_GLYPHS;   // injiziert von plugin.py via WKUserScript
```

| Verhalten | Browser | Glyphs |
|---|---|---|
| Startmodus | Advanced (full panel) | Compact (light mode) |
| Font-Quelle | Drag & Drop TTF/OTF | Python → evaluateJavaScript |
| Ausgabe | Export CSV / Copy | Apply to Font |
| IPC | — | coupler:// URL-Navigation |

---

## Wichtigste Konventionen

- **Quellcode liegt in `src/`** — JS-Module in `src/js/`, CSS in `src/css/`, HTML-Skelett in `src/html/template.html`.
  `build.js` assembliert sie zu `ui.html`. Änderungen immer in `src/`, nie direkt in `ui.html`.
- **fuchs.js nicht anfassen** — enthält den Kerning-Corpus (KERNING_PAIRS Array).
- **Alle Ausgaben über `outputPairs()`** — nie `kerningData` direkt für Apply/CSV/Copy verwenden.
- **Min-Gap immer mit `leftGeom`/`rightGeom`** — nie `left`/`right` (glow/smooth verfälscht Check).
- **Kein PyObjC-Block als Completion-Handler** — führt zu SIGSEGV. Nur `None` übergeben.
- **IPC für große Daten: chunked** — URL-Länge ist begrenzt; `applykerning_start/chunk/done` Pattern verwenden.

---

## Skills-Verzeichnis

Detaillierte Algorithmus- und Pattern-Dokumentation liegt in `.claude/skills/`:

| Skill | Thema |
|---|---|
| `margin-measurement.md` | pathXZones, glowZones, Blur-Averaging, dual-array |
| `smoothing.md` | Reciprocal-Step-Limit-Algorithmus |
| `kerning-computation.md` | 3-Schritte-Pipeline, Baseline, Lazy, Min-Gap |
| `cadence-scan.md` | Stem-Rhythmus-Messung, cadToRound |
| `spacing-corrections.md` | Sidebearing-Imbalanz, avgMarginZones |
| `coupler-plugin-architecture.md` | Gesamtarchitektur, Datenfluss |
| `wkwebview-ipc.md` | Chunked IPC, PyObjC-Block-Gefahr |
| `pyobjc-safety.md` | GC-Crash, SIGSEGV, Protocol-Conformance |

---

## Testen

**Browser:** `docs/index.html` im Browser öffnen (nach `make.sh`), Font droppen.

**Glyphs:** Plugin in Glyphs 3 neu laden (Script-Menü → Coupler). Glyphs-Konsole
zeigt `[Coupler]`-Logs. Fehler erscheinen im Macro-Panel unter „Output".

---

## Versionierung

Version steht in `src/html/template.html` (Suche nach `v5.`). Der `/version X.Y.Z`-Befehl
aktualisiert die Version in `template.html` und ruft dann `bash make.sh` auf.
Alternativ: `node build.js 5.5.0` aktualisiert Version in template.html und baut ui.html.

## Unit Tests

```bash
npm test               # JS-Tests (tests/js/*.test.js) via Jest
pytest tests/py/       # Python-Tests (tests/py/test_*.py)
```

JS-Tests benötigen kein DOM — die reinen Mathe-Funktionen werden inline dupliziert.
