// ══════════════════════════════════════════════════════
// GLYPHS INTEROP — setFontInfo + UI init
// ══════════════════════════════════════════════════════

// Called by Python immediately on page load (identify cmd) and after data arrives.
function setFontInfo(fontName, masterName, glyphCount){
  const info=document.getElementById('header-font-info');
  if(info) info.innerHTML='<strong>'+fontName+'</strong>&nbsp; Master:&nbsp;'+masterName+(glyphCount?' &nbsp;('+glyphCount+' glyphs)':'');
  const fn=document.getElementById('drop-fname');
  if(fn) fn.textContent=fontName+' · '+masterName+(glyphCount?' · '+glyphCount+' glyphs':'');
}

// ══════════════════════════════════════════════════════
// GLYPHS MODE — UI INIT
// ══════════════════════════════════════════════════════
if(IS_GLYPHS){
  // Replace drop zone with Glyphs connection panel + load button
  const dz=document.getElementById('drop-zone');
  if(dz){
    dz.style.cursor='default';
    dz.style.border='1px solid var(--border2)';
    dz.onclick=null;
    dz.innerHTML=
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
      +'<span style="font-size:16px;color:var(--green)">⊕</span>'
      +'<span style="color:var(--green);font-weight:700;font-size:12px">Connected to Glyphs</span>'
      +'</div>'
      +'<div id="drop-fname" style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-bottom:10px">No data loaded yet</div>'
      +'<button id="btn-glyphs-load" onclick="initLoadAndCompute()" style="'
      +'width:100%;padding:8px;background:var(--accent);color:#000;'
      +'font-family:var(--mono);font-size:12px;font-weight:700;letter-spacing:.07em;'
      +'text-transform:uppercase;border:none;border-radius:var(--r);'
      +'cursor:pointer;transition:background .15s;">'
      +'▶  Load &amp; Compute</button>';
  }
  // Rename Export button to Apply
  const expBtn=document.querySelector('.btn-exp');
  if(expBtn){expBtn.textContent='⊙ Apply to Font';expBtn.onclick=applyToGlyphs;}
  const lightActBtn=document.getElementById('btn-light-act');
  if(lightActBtn){lightActBtn.textContent='⊙ Apply to Font';lightActBtn.onclick=applyToGlyphs;}
  const clipBtn=document.getElementById('btn-light-clip');
  if(clipBtn)clipBtn.style.display='none';
  // Show Apply Spacing button (Glyphs mode only)
  const asBtn=document.getElementById('btn-apply-spacing');
  if(asBtn)asBtn.style.display='';
  // Hide testpage button (no font file available)
  const tpBtn=document.querySelector('.btn-hdr.testpage');
  if(tpBtn)tpBtn.style.display='none';
  // Hide file input
  const fi=document.getElementById('fi');
  if(fi)fi.style.display='none';
  // Taller logbox so debug stream is readable
  const lb=document.querySelector('.logbox');
  if(lb)lb.style.maxHeight='120px';
  dbg('Glyphs mode active — click Load & Compute to start');
  // Navigate to coupler://identify so Python sends font/master name immediately.
  window.location.href = 'coupler://identify';
}

if(typeof module!=='undefined')module.exports={setFontInfo};
