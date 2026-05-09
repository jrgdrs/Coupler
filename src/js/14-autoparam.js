// ══════════════════════════════════════════════════════
// AUTOPARAM — automatic parameter detection
// ══════════════════════════════════════════════════════
// Test text covers a broad mix of upper/lower, round/diagonal, straight shapes.
const _AP_TEXT = 'Arrowroot Barley Chervil Dumpling Endive Flaxseed Garbanzo Hijiki Ishtu Jicama Kale Lychee Marjoram Nectarine Oxtail Pizza Quinoa Roquefort Squash Tofu Uppuma Vanilla Wheat Xergis Yogurt Zweiback';

let _apRunning = false;

// ── Field helpers ─────────────────────────────────────
function _apSaveFields() {
  return {
    zones:     document.getElementById('p-zones').value,
    smooth:    document.getElementById('p-smooth').value,
    blur:      document.getElementById('p-blur').value,
    mingap:    document.getElementById('p-mingap').value,
    glowblur:  document.getElementById('p-glowblur').value,
    round:     document.getElementById('p-round').value,
    threshold: document.getElementById('p-threshold').value,
    lazy:      document.getElementById('p-lazy').value,
    pairlimit: document.getElementById('p-pairlimit').value,
    glow:      document.getElementById('p-glow').checked,
    baselc:    document.getElementById('p-baselc').value,
    baseuc:    document.getElementById('p-baseuc').value,
    tracking:  document.getElementById('p-tracking').value,
  };
}

function _apRestoreFields(saved) {
  document.getElementById('p-zones').value     = saved.zones;
  document.getElementById('p-smooth').value    = saved.smooth;
  document.getElementById('p-blur').value      = saved.blur;
  document.getElementById('p-mingap').value    = saved.mingap;
  document.getElementById('p-glowblur').value  = saved.glowblur;
  document.getElementById('p-round').value     = saved.round;
  document.getElementById('p-threshold').value = saved.threshold;
  document.getElementById('p-lazy').value      = saved.lazy;
  document.getElementById('p-pairlimit').value = saved.pairlimit;
  document.getElementById('p-glow').checked    = saved.glow;
  document.getElementById('p-baselc').value    = saved.baselc;
  document.getElementById('p-baseuc').value    = saved.baseuc;
  document.getElementById('p-tracking').value  = saved.tracking;
}

function _apSetField(key, value) {
  const el = document.getElementById('p-' + key);
  if (!el) return;
  if (el.type === 'checkbox') el.checked = !!value;
  else el.value = value;
}

// ── Char map: char → {aw, charLabel} ─────────────────
// Built once per font; stays valid across all scan iterations.
function _apBuildCharMap() {
  const map = {};
  for (const ch of _AP_TEXT) {
    if (ch === ' ' || map[ch]) continue;
    if (IS_GLYPHS) {
      const cp = ch.codePointAt(0);
      const gname = unicodeToGlyphName[cp];
      const g = gname ? glyphsByName[gname] : null;
      if (g && g.commands && g.commands.length > 0) {
        map[ch] = { charLabel: ch, aw: g.advanceWidth || 0 };
      }
    } else {
      const g = fontObj ? fontObj.charToGlyph(ch) : null;
      if (g && g.name && g.name !== '.notdef') {
        map[ch] = { charLabel: ch, aw: g.advanceWidth || 0 };
      }
    }
  }
  // Space advance width
  if (IS_GLYPHS) {
    const gname = unicodeToGlyphName[32];
    const sp = gname ? glyphsByName[gname] : null;
    map[' '] = { charLabel: ' ', aw: sp && sp.advanceWidth ? sp.advanceWidth : Math.round(currentUPM * 0.25) };
  } else {
    const sp = fontObj ? fontObj.charToGlyph(' ') : null;
    map[' '] = { charLabel: ' ', aw: sp && sp.advanceWidth ? sp.advanceWidth : Math.round(currentUPM * 0.25) };
  }
  return map;
}

// ── Laufweite: sum of AW + kerning for test string ────
function _apWidth(charMap, corrMap) {
  let width = 0, prev = null;
  for (const ch of _AP_TEXT) {
    const entry = charMap[ch];
    if (!entry) { prev = null; continue; }
    if (ch === ' ') { width += entry.aw; prev = null; continue; }
    width += entry.aw;
    if (prev) width += corrMap[prev.charLabel + '|' + entry.charLabel] || 0;
    prev = entry;
  }
  return width;
}

// ── Lite analysis: only the glyphs and pairs the test string needs ────────────
// No KERNING_PAIRS filter, no SC/OSF expansion, no UI updates.
// Works in both browser mode (fontObj) and Glyphs mode (glyphsByName).
async function _apLiteAnalysis(charMap) {
  await new Promise(r => setTimeout(r, 0)); // yield so log messages paint

  const p   = P();
  const upm = currentUPM;
  const yBot = yBotGlobal, yTop = yTopGlobal;

  // Margins for unique chars in test string + base glyphs
  const localGC = {};
  const needed  = new Set([...Object.keys(charMap).filter(c => c !== ' '), p.baselc, p.baseuc]);

  for (const ch of needed) {
    if (IS_GLYPHS) {
      const cp    = ch.codePointAt(0);
      const gname = unicodeToGlyphName[cp];
      const g     = gname ? glyphsByName[gname] : null;
      if (!g || !g.commands || g.commands.length === 0) continue;
      const margins = computeMarginsFromCommands(g.commands, g.advanceWidth, p, yBot, yTop);
      localGC[ch]   = { ...margins, charLabel: ch, glyphName: g.name, cls: classifyGlyph(g.unicode, g.name) };
    } else {
      const g = fontObj.charToGlyph(ch);
      if (!g || !g.path || g.path.commands.length === 0) continue;
      const unicode = g.unicodes?.[0] ?? null;
      const gk      = g.name ?? ch;
      const margins = computeGlyphMargins(g, upm, p, yBot, yTop);
      localGC[ch]   = { ...margins, charLabel: ch, glyphName: gk, cls: classifyGlyph(unicode, gk) };
    }
  }

  // Baselines from base-glyph self-pairs
  const lcGC  = localGC[p.baselc], ucGC = localGC[p.baseuc];
  const lcC   = lcGC ? pairMean(lcGC.right, lcGC.left) : null;
  const lcBase = (lcC ? lcC.mean : 0) + p.tracking;
  const ucC   = ucGC ? pairMean(ucGC.right, ucGC.left) : null;
  const ucBase = (ucC ? ucC.mean : (lcBase - p.tracking)) + p.tracking;
  const minGapFU = upm * p.mingap;

  // Corrections for every unique consecutive pair in the test string —
  // no KERNING_PAIRS filter, the test string defines the pairs directly.
  const corrMap = {};
  let prev = null;
  for (const ch of _AP_TEXT) {
    if (ch === ' ') { prev = null; continue; }
    if (prev !== null) {
      const key = prev + '|' + ch;
      if (!(key in corrMap)) {
        const gcA = localGC[prev], gcB = localGC[ch];
        if (gcA && gcB) {
          const calc = pairMean(gcA.right, gcB.left);
          if (calc) {
            const bothUC = gcA.cls === 'UC' && gcB.cls === 'UC';
            const base   = bothUC ? ucBase : lcBase;
            let corr = rtm(base - calc.mean, p.round);
            if (p.lazy > 0) corr = rtm(corr * (1 - p.lazy / 100), p.round);
            if (minGapFU > 0) {
              const rawSums = [];
              for (let z = 0; z < gcA.rightGeom.length; z++) {
                const a = gcA.rightGeom[z], b = gcB.leftGeom[z];
                if (a !== null && b !== null) rawSums.push(a + b);
              }
              if (rawSums.length > 0) {
                const minZG  = Math.min(...rawSums);
                const room   = minZG - minGapFU;
                const minCorr = room >= 0
                  ? -(p.round > 1 ? Math.floor(room / p.round) * p.round : Math.floor(room))
                  :  (p.round > 1 ? Math.ceil(-room / p.round) * p.round : Math.ceil(-room));
                if (corr < minCorr) corr = minCorr;
              }
            }
            if (p.threshold > 0 && Math.abs(corr) < p.threshold) corr = 0;
            corrMap[key] = corr;
          }
        }
      }
    }
    prev = ch;
  }
  return corrMap;
}

// ── Single scan iteration: set fields → lite analysis → Laufweite ────────────
async function _apRun(base, optimal, paramKey, testValue, charMap) {
  _apRestoreFields(base);
  for (const [k, v] of Object.entries(optimal)) _apSetField(k, v);
  _apSetField(paramKey, testValue);
  const corrMap = await _apLiteAnalysis(charMap);
  return _apWidth(charMap, corrMap);
}

// ── Scan one parameter across its candidate values ────────────────────────────
// Returns the candidate whose Laufweite is closest to the lower average:
// mean of all widths at or below the overall mean — the converged stable state.
async function _apScan(label, paramKey, candidates, base, optimal, charMap, stepN, totalSteps) {
  const btn = document.getElementById('btn-autoparam');
  if (btn) btn.textContent = `⚙ ${label} (${stepN}/${totalSteps})`;
  log(`AutoParam ${stepN}/${totalSteps}: scanning ${label} [${candidates.join(', ')}]`, 'info');

  const widths = [];
  for (const v of candidates) {
    const w = await _apRun(base, optimal, paramKey, v, charMap);
    widths.push(w);
    log(`  ${label}=${v} → Laufweite ${Math.round(w)} fu`, 'info');
  }

  const globalMean = widths.reduce((s, w) => s + w, 0) / widths.length;
  const below      = widths.filter(w => w <= globalMean);
  const lowerAvg   = below.length ? below.reduce((s, w) => s + w, 0) / below.length : globalMean;
  let bestIdx = 0, bestDiff = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const d = Math.abs(widths[i] - lowerAvg);
    if (d < bestDiff) { bestDiff = d; bestIdx = i; }
  }

  const best = candidates[bestIdx];
  log(`AutoParam ${stepN}/${totalSteps}: ${label} → ${best} (Laufweite ${Math.round(widths[bestIdx])} fu, lower avg ${Math.round(lowerAvg)} fu)`, 'ok');
  return best;
}

// ── Main entry point ──────────────────────────────────────────────────────────
async function autoParam() {
  if (_apRunning) { log('AutoParam already running — please wait', 'info'); return; }
  if (isComputing){ log('AutoParam: waiting for current computation to finish', 'info'); return; }

  // Guard: need font data loaded in either mode
  if (IS_GLYPHS && Object.keys(glyphsByName).length === 0) {
    alert('No font loaded — click Load & Compute first.');
    return;
  }
  if (!IS_GLYPHS && !fontObj) {
    alert('No font loaded — drop a TTF/OTF first.');
    return;
  }

  _apRunning = true;
  document.body.classList.add('ap-running');
  const btn = document.getElementById('btn-autoparam');
  if (btn) { btn.disabled = true; btn.textContent = '⚙ Starting…'; }
  log('AutoParam: starting — building char map…', 'ok');

  try {
    const base    = _apSaveFields();
    const charMap = _apBuildCharMap();
    const mapped  = Object.keys(charMap).length - 1; // exclude space
    if (mapped === 0) { log('AutoParam: no test-string glyphs found in font', 'err'); return; }
    log(`AutoParam: ${mapped} unique chars, lite analysis (no KERNING_PAIRS lookup)`, 'info');

    const optimal = {};
    const TOTAL   = 8;

    optimal.zones     = await _apScan('Zones',     'zones',     [3,9,18,36,48,96],  base, optimal, charMap, 1, TOTAL);
    optimal.smooth    = await _apScan('Smooth',    'smooth',    [11,33,50,66,88],   base, optimal, charMap, 2, TOTAL);
    optimal.blur      = await _apScan('Blur',      'blur',      [1,2,4,8,16],       base, optimal, charMap, 3, TOTAL);
    optimal.glowblur  = await _apScan('GlowBlur',  'glowblur',  [0,1,2,3,4,5],     base, optimal, charMap, 4, TOTAL);
    optimal.round     = await _apScan('Round',     'round',     [1,5,10,20,40],     base, optimal, charMap, 5, TOTAL);
    optimal.threshold = await _apScan('Threshold', 'threshold', [0,5,10,20,40],     base, optimal, charMap, 6, TOTAL);
    optimal.lazy      = await _apScan('Lazy',      'lazy',      [0,20,40,60,80],    base, optimal, charMap, 7, TOTAL);
    optimal.mingap    = await _apScan('MinGap',    'mingap',    [0,1,2,4,6,8],      base, optimal, charMap, 8, TOTAL);

    // Apply all optimal values, then trigger the full analysis to refresh the UI
    if (btn) btn.textContent = '⚙ Applying…';
    _apRestoreFields(base);
    for (const [k, v] of Object.entries(optimal)) _apSetField(k, v);
    log('AutoParam: optimal parameters applied — running full analysis…', 'ok');
    // In Glyphs mode runAnalysis() navigates to Python and returns immediately;
    // the panel is restored in finally so the user sees params while Python responds.
    runAnalysis();
    log('AutoParam complete.', 'ok');
  } catch (e) {
    log('AutoParam error: ' + e.message, 'err');
    console.error(e);
  } finally {
    _apRunning = false;
    document.body.classList.remove('ap-running');
    if (btn) { btn.disabled = false; btn.textContent = '⚙ AutoParam'; }
  }
}

if (typeof module !== 'undefined') module.exports = { autoParam };
