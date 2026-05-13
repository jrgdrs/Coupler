// ══════════════════════════════════════════════════════
// STATE & GLOBALS
// ══════════════════════════════════════════════════════
// ── Runtime detection ─────────────────────────────────────────────────────────
// IS_GLYPHS is true when running inside Glyphs.app via WKWebView.
// In that case the drop zone is replaced by a "Connected" indicator,
// and the "Export CSV" button becomes "Apply to Font".
// Injected by WKUserScript before page scripts run (see plugin.py _build_ui).
const IS_GLYPHS = !!(window.__IS_GLYPHS);

let fontObj=null,fontBuffer=null,fontName='',fontDataUrl='';
let glyphCache={},kerningData=[],filteredData=[];
let sortCol='correction',sortAsc=false;
let showKerning=true,showMetrics=false,showBaseline=false,showXheight=false;
let showSmallCaps=false,showOSF=false,showGlow=false;
let glowPreviewCache={}; // 'glyphKey|blur' → HTMLCanvasElement
let analysisWasGlow=false; // true when last completed analysis used Glow mode
let lightMode=IS_GLYPHS; // Glyphs: compact by default; browser: advanced by default
if(!lightMode)document.body.classList.remove('light-mode');
let isComputing=false; // true while runAnalysis / runAnalysisFromGlyphsData is active
let pendingAction=null; // queued action to run after current computation finishes
let cadenceAutoFilled=false; // true after first auto-fill of p-round from cadence scan
let lastFontKey=''; // tracks font+master to detect real font changes vs recompute
let useRegex=false;
let selectedPairIdx=-1;  // index into filteredData for pair-click preview
let pairPreviewMode=false;  // true when showing a clicked pair in preview
let baseValueLC=0,baseValueUC=0;
let currentUPM=1000,yBotGlobal=0,yTopGlobal=0,xHeightGlobal=0;

// Glyphs mode state
let glyphsByName={};         // name → {commands, advanceWidth, unicode} (Glyphs mode)
let unicodeToGlyphName={};   // codepoint → glyph name (Glyphs mode)

const DEFAULTS={zones:16,smooth:50,round:20,blur:1,mingap:4,threshold:0,lazy:50,baselc:'o',baseuc:'O',tracking:0,pairlimit:2000,glowblur:20,glow:true};

function P(){
  const mg=parseFloat(document.getElementById('p-mingap').value);
  return{
    zones:     parseInt(document.getElementById('p-zones').value)     ||DEFAULTS.zones,
    smooth:    (()=>{const s=parseFloat(document.getElementById('p-smooth').value)||0; return s===0?0:(1-s/100);})(),
    round:     parseInt(document.getElementById('p-round').value)     ||DEFAULTS.round,
    blur:      parseInt(document.getElementById('p-blur').value)      ||DEFAULTS.blur,
    mingap:    (isNaN(mg)?DEFAULTS.mingap:mg)/100,
    threshold: parseFloat(document.getElementById('p-threshold').value)||0,
    lazy:      Math.max(0,Math.min(99,parseFloat(document.getElementById('p-lazy').value)||0)),
    baselc:    (document.getElementById('p-baselc').value||DEFAULTS.baselc).trim(),
    baseuc:    (document.getElementById('p-baseuc').value||DEFAULTS.baseuc).trim(),
    tracking:  parseFloat(document.getElementById('p-tracking').value)||0,
    pairlimit: parseInt(document.getElementById('p-pairlimit').value)||0,
    glow: document.getElementById('p-glow').checked,
    glowblur:  Math.max(0,parseFloat(document.getElementById('p-glowblur').value)||DEFAULTS.glowblur),
  };
}
function resetParams(){
  ['zones','smooth','round','blur','mingap','threshold','lazy','tracking','pairlimit','glowblur'].forEach(k=>{
    document.getElementById('p-'+k).value=DEFAULTS[k];
  });
  document.getElementById('p-baselc').value=DEFAULTS.baselc;
  document.getElementById('p-baseuc').value=DEFAULTS.baseuc;
  document.getElementById('p-glow').checked=DEFAULTS.glow;
}

// Parameter presets for common font styles
const PARAM_PRESETS={
  'default':        {zones:16,  smooth:50,   mingap:4,  blur:1, round:20, threshold:0,  lazy:20, pairlimit:0 },
  // Serif weights
  'serif-reg':      {zones:81, smooth:14,  mingap:12, blur:3,  round:1, threshold:0},
  'serif-it':       {zones:81, smooth:14, mingap:4,  blur:3,  round:1, threshold:0},
  'serif-bold':     {zones:81, smooth:14,   mingap:4,  blur:3,  round:1, threshold:0},
  'serif-boldit':   {zones:81, smooth:14,  mingap:12, blur:3,  round:1, threshold:0},
  // Sans-serif weights
  'sans-light':     {zones:48,  smooth:66,   mingap:4,  blur:1,  round:20, threshold:0, lazy: 60 },
  'sans-regular':   {zones:48,  smooth:50,   mingap:3,  blur:2,  round:20, threshold:0, lazy: 55},
  'sans-bold':      {zones:48, smooth:33, mingap:2, blur:3, round:20, threshold:0, lazy:50 },
  // Slab-serif weights
  'slab-light':     {zones:40, smooth:30,   mingap:7,  blur:5,  round:1, threshold:0},
  'slab-regular':   {zones:40, smooth:35,  mingap:10, blur:5,  round:1, threshold:0},
  'slab-bold':      {zones:40, smooth:40,   mingap:12, blur:4,  round:1, threshold:0},
};
function applyParamPreset(key){
  if(!key)return;
  const pr=PARAM_PRESETS[key];
  if(!pr)return;
  document.getElementById('p-zones').value    =pr.zones;
  document.getElementById('p-smooth').value   =pr.smooth;
  document.getElementById('p-mingap').value   =pr.mingap;
  document.getElementById('p-blur').value     =pr.blur;
  document.getElementById('p-round').value    =pr.round;
  document.getElementById('p-threshold').value=pr.threshold;
  if(pr.lazy!==undefined)document.getElementById('p-lazy').value=pr.lazy;
}

// ── LOG / STATUS ──────────────────────────────────────
function log(msg,cls=''){
  const el=document.getElementById('logbox');
  const d=document.createElement('div');
  d.className='ll '+(cls?cls:'');
  d.textContent=msg;
  el.appendChild(d);
  el.scrollTop=el.scrollHeight;
}
function setStatus(msg,cls=''){const el=document.getElementById('global-status');el.textContent=msg;el.className=cls;}
function setProgress(p){document.getElementById('prog-fill').style.width=p+'%';}

// ── LOG RESIZE DRAG ────────────────────────────────────
{
  const handle=document.getElementById('log-resize');
  const logbox=document.getElementById('logbox');
  let startY,startH;
  handle.addEventListener('mousedown',e=>{
    startY=e.clientY;startH=logbox.offsetHeight;
    handle.classList.add('dragging');
    const onMove=mv=>{
      const newH=Math.max(24,Math.min(600,startH-(mv.clientY-startY)));
      logbox.style.height=newH+'px';
    };
    const onUp=()=>{handle.classList.remove('dragging');document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);};
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
    e.preventDefault();
  });
}

if(typeof module!=='undefined')module.exports={IS_GLYPHS,DEFAULTS,P,resetParams,PARAM_PRESETS,applyParamPreset,log,setStatus,setProgress};
