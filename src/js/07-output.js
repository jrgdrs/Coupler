// Non-zero pairs to output, capped to pairlimit (0 = all), in fuchs order.
function outputPairs(){
  const p=P();
  const nz=kerningData.filter(d=>d.correction!==0);
  return p.pairlimit>0?nz.slice(0,p.pairlimit):nz;
}

// Send non-zero pairs to Python for application to the font.
function applyToGlyphs(){
  if(isComputing){pendingAction=()=>applyToGlyphs();log('⏳ Apply queued — waiting for computation to finish','info');return;}
  if(!kerningData.length){alert('No kerning data — run Compute first.');return;}
  const out=outputPairs();
  if(!out.length){alert('All corrections are zero — nothing to apply.');return;}
  const pairs=out.map(d=>({left:d.left,right:d.right,correction:d.correction}));
  window._couplerKerning=pairs;
  window.location.href='coupler://applykerning_start?n='+pairs.length;
}
function sendKerningChunk(idx){
  const CHUNK=200;
  const all=window._couplerKerning||[];
  const slice=all.slice(idx*CHUNK,(idx+1)*CHUNK);
  if(!slice.length){window.location.href='coupler://applykerning_done';return;}
  window.location.href='coupler://applykerning_chunk?'+encodeURIComponent(JSON.stringify({i:idx,d:slice}));
}

// Called by Python after applying kerning.
function showApplyResult(result){
  log(result.msg, result.ok>0?'ok':'err');
  setStatus(result.msg, result.ok>0?'active':'error');
}

function applySpacingToGlyphs(){
  if(!IS_GLYPHS){return;}
  const gks=Object.keys(glyphCache);
  if(!gks.length){alert('No spacing data — run Compute first.');return;}
  const p=P();
  const trk=p.tracking/2;
  const baseLcGC=glyphCache[p.baselc],baseUcGC=glyphCache[p.baseuc];
  // Zone range of each base glyph: botZ = lower ink boundary, topZ = upper ink boundary
  const lcBotZ=baseLcGC?botZoneOf(baseLcGC):null, lcTopZ=baseLcGC?topZoneOf(baseLcGC):null;
  const ucBotZ=baseUcGC?botZoneOf(baseUcGC):null, ucTopZ=baseUcGC?topZoneOf(baseUcGC):null;
  const baseLcL=baseLcGC&&lcBotZ!==null?avgMarginZones(baseLcGC.left,lcBotZ,lcTopZ)+trk:null;
  const baseLcR=baseLcGC&&lcBotZ!==null?avgMarginZones(baseLcGC.right,lcBotZ,lcTopZ)+trk:null;
  const baseUcL=baseUcGC&&ucBotZ!==null?avgMarginZones(baseUcGC.left,ucBotZ,ucTopZ)+trk:null;
  const baseUcR=baseUcGC&&ucBotZ!==null?avgMarginZones(baseUcGC.right,ucBotZ,ucTopZ)+trk:null;
  const items=[];
  for(const gk of gks){
    const gc=glyphCache[gk];
    if(!gc)continue;
    const isUC=gc.cls==='UC';
    const botZ=isUC?ucBotZ:lcBotZ, topZ=isUC?ucTopZ:lcTopZ;
    const bL=isUC?baseUcL:baseLcL,bR=isUC?baseUcR:baseLcR;
    if(bL===null||bR===null||botZ===null||topZ===null)continue;
    const gL=avgMarginZones(gc.left,botZ,topZ),gR=avgMarginZones(gc.right,botZ,topZ);
    if(gL===null||gR===null)continue;
    const dL=rtm(bL-gL,p.round);
    const dR=rtm(bR-gR,p.round);
    const newAW=rtm(gc.advanceWidth+dL+dR,p.round);
    const dWidth=newAW-gc.advanceWidth-dL;
    items.push({name:gc.glyphName,dlsb:dL,dwidth:dWidth});
  }
  if(!items.length){alert('No adjustments to apply.');return;}
  window.location.href='coupler://applyspacing?'+encodeURIComponent(JSON.stringify(items));
}

function showSpacingApplyResult(result){
  log(result.msg, result.ok>0?'ok':'err');
  setStatus(result.msg, result.ok>0?'active':'error');
}

// ── EXPORT ────────────────────────────────────────────
function exportCSV(){
  if(isComputing){pendingAction=()=>exportCSV();log('⏳ Export queued — waiting for computation to finish','info');return;}
  if(IS_GLYPHS){applyToGlyphs();return;}
  if(!kerningData.length){alert('No data to export.');return;}
  const p=P();
  const out=outputPairs();
  const lines=[
    `# Coupler — Font Kerning | ${fontName} | zones=${p.zones} smooth=${Math.round(p.smooth*100)}% blur=${p.blur} round=${p.round} mingap=${Math.round(p.mingap*100)}% threshold=${p.threshold}`,
    `# Format: Left;Right;Correction (Class zones)`,
    ...out.map(d=>`${d.left};${d.right};${d.correction} (${d.tag} ${d.zones})${d.capped?' [cap]':''}`)
  ];
  const blob=new Blob([lines.join('\n')],{type:'text/plain'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=fontName.replace(/\.[^.]+$/,'')+'.csv';a.click();
}
function copyKerningToClipboard(){
  if(isComputing){pendingAction=()=>copyKerningToClipboard();log('⏳ Copy queued — waiting for computation to finish','info');return;}
  if(!kerningData.length){return;}
  const p=P();
  const out=outputPairs();
  const lines=[
    `# Coupler — Font Kerning | ${fontName} | zones=${p.zones} smooth=${Math.round(p.smooth*100)}% blur=${p.blur} round=${p.round} mingap=${Math.round(p.mingap*100)}% threshold=${p.threshold}`,
    `# Format: Left;Right;Correction (Class zones)`,
    ...out.map(d=>`${d.left};${d.right};${d.correction} (${d.tag} ${d.zones})${d.capped?' [cap]':''}`)
  ];
  navigator.clipboard.writeText(lines.join('\n')).then(()=>{
    const b=document.getElementById('btn-light-clip');
    if(b){const orig=b.textContent;b.textContent='✓ Copied!';setTimeout(()=>{b.textContent=orig;},1400);}
    log(`Copied ${out.length.toLocaleString()} kerning pairs to clipboard`,'ok');
  }).catch(()=>log('Clipboard write failed','err'));
}

if(typeof module!=='undefined')module.exports={outputPairs,applyToGlyphs,sendKerningChunk,showApplyResult,applySpacingToGlyphs,showSpacingApplyResult,exportCSV,copyKerningToClipboard};
