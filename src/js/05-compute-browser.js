// ── STEM CADENCE (browser-mode scan) ──────────────────
function measureStemCadence(){
  if(!fontObj)return;
  const upm=fontObj.unitsPerEm;
  // x-height from OS/2; fall back to bounding-box top of glyph 'x'
  let xh=fontObj.tables?.os2?.sxHeight||0;
  if(!xh){
    const xg=fontObj.charToGlyph('x');
    if(xg&&xg.path&&xg.path.commands.length>0){const bb=xg.getBoundingBox();xh=Math.round(bb.y2);}
  }
  if(!xh){log('n cadence: no x-height available — skipped','info');return;}
  const nGlyph=fontObj.charToGlyph('n');
  if(!nGlyph||!nGlyph.path||nGlyph.path.commands.length===0){
    log('n cadence: glyph "n" not found','info');return;
  }
  try{
    // Derive vertical bounds directly from font (runAnalysis not yet called)
    let yTop=upm*0.8,yBot=-(upm*0.2);
    if(fontObj.tables?.os2){const o=fontObj.tables.os2;if(o.sTypoAscender)yTop=o.sTypoAscender;if(o.sTypoDescender!==undefined)yBot=o.sTypoDescender;}
    else if(fontObj.tables?.hhea){if(fontObj.tables.hhea.ascender)yTop=fontObj.tables.hhea.ascender;if(fontObj.tables.hhea.descender!==undefined)yBot=fontObj.tables.hhea.descender;}
    const aw=nGlyph.advanceWidth||upm;
    const scanYfu=xh/2;
    const scale=4; // 4 px per font unit
    const fontSize=scale*upm;
    const topPad=4;
    const baseline=topPad+Math.ceil(yTop*scale);
    const W=Math.ceil(aw*scale);
    const H=baseline+Math.ceil(Math.abs(yBot)*scale)+4;
    const off=document.createElement('canvas');
    off.width=W;off.height=H;
    const ctx=off.getContext('2d');
    ctx.fillStyle='#000';
    ctx.fill(new Path2D(nGlyph.getPath(0,baseline,fontSize).toPathData(2)));
    const scanRow=Math.round(baseline-scanYfu*scale);
    if(scanRow<0||scanRow>=H){log(`n cadence: scan row ${scanRow} out of bounds (H=${H})`,'info');return;}
    const px=ctx.getImageData(0,scanRow,W,1).data;
    const runs=[];let inRun=false,rs=0;
    for(let x=0;x<W;x++){
      const ink=px[x*4+3]>127;
      if(ink&&!inRun){inRun=true;rs=x;}
      else if(!ink&&inRun){inRun=false;runs.push([rs,x-1]);}
    }
    if(inRun)runs.push([rs,W-1]);
    if(runs.length<2){log(`n cadence: ${runs.length} ink run(s) at y=${Math.round(scanYfu)} fu — stems not distinct`,'info');return;}
    const stemW=(runs[0][1]-runs[0][0]+1)/scale;
    const interval=(runs[1][0]-runs[0][0])/scale;
    const n=Math.max(1,Math.round(interval*4/stemW));
    const cadence=interval/n;
    log(`n cadence: y=${Math.round(scanYfu)} fu (½·x-height ${xh}) · stem ${Math.round(stemW)} fu · L→R ${Math.round(interval)} fu ÷ ${n} → cadence ${Math.round(cadence)} fu`,'info');
  }catch(e){log('n cadence error: '+e.message,'err');}
}

// ── FONT LOAD ─────────────────────────────────────────
const dz=document.getElementById('drop-zone');
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('over');});
dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over');const f=e.dataTransfer.files[0];if(f)loadFont(f);});
document.getElementById('fi').addEventListener('change',e=>{if(e.target.files[0])loadFont(e.target.files[0]);});

function loadFont(file){
  const reader=new FileReader();
  reader.onload=async ev=>{
    try{
      fontBuffer=ev.target.result;
      // store as data URL for testpage embedding
      const b64=btoa(String.fromCharCode(...new Uint8Array(fontBuffer)));
      const ext=file.name.split('.').pop().toLowerCase();
      fontDataUrl=`data:font/${ext};base64,${b64}`;
      fontObj=opentype.parse(fontBuffer);
      fontName=file.name;
      currentUPM=fontObj.unitsPerEm;
      dz.classList.add('loaded');
      document.getElementById('drop-fname').textContent=file.name;
      const fn=fontObj.names.fullName?.en||file.name;
      document.getElementById('header-font-info').innerHTML=`<strong>${fn}</strong>&nbsp; UPM:${currentUPM}`;
      document.getElementById('btn-run').disabled=false;
      setStatus('Loaded','active');
      log(`Loaded: ${fn} — ${Object.keys(fontObj.glyphs.glyphs).length} glyphs`,'ok');
      measureStemCadence();
      cadReset();
      cadenceAutoFilled=false;
      cadEnsureInit();
      const _lcv=document.getElementById('cad-cadence').value;
      const _lcn=cadToRound(parseFloat(_lcv));
      if(!isNaN(_lcn)&&_lcn>0){document.getElementById('p-round').value=_lcn;document.getElementById('light-cad-val').value=_lcn;cadenceAutoFilled=true;}
      renderLightCadCanvas();
      runAnalysis();
    }catch(err){setStatus('Load error','error');log('Error: '+err.message,'err');}
  };
  reader.readAsArrayBuffer(file);
}

// ══════════════════════════════════════════════════════
// MAIN ANALYSIS (browser mode)
// ══════════════════════════════════════════════════════
function initLoadAndCompute(){lastFontKey='';runAnalysis();}
async function runAnalysis(){
  log('▶ runAnalysis called (IS_GLYPHS='+IS_GLYPHS+')','info');
  // ── Glyphs mode: request glyph data from Python ──────────────────────────
  if(IS_GLYPHS){
    if(isComputing){pendingAction=()=>runAnalysis();log('⏳ Compute queued — waiting for current run to finish','info');return;}
    isComputing=true;
    const btn=document.getElementById('btn-run');
    const loadBtn=document.getElementById('btn-glyphs-load');
    if(btn){btn.disabled=true;btn.innerHTML='<span class="spin"></span>Requesting…';}
    if(loadBtn){loadBtn.disabled=true;loadBtn.textContent='Requesting…';}
    setStatus('Requesting data…','busy');
    dbg('Navigating coupler://requestdata → Python…');
    window.location.href = 'coupler://requestdata';
    return;  // Python intercepts nav, cancels it, calls receiveGlyphData() when ready
  }
  // ── Browser mode ─────────────────────────────────────────────────────────
  if(!fontObj){setStatus('No font','error');return;}
  if(isComputing){pendingAction=()=>runAnalysis();log('⏳ Compute queued — waiting for current run to finish','info');return;}
  isComputing=true;
  const p=P();
  analysisWasGlow=p.glow;
  const btn=document.getElementById('btn-run');
  btn.disabled=true;btn.innerHTML='<span class="spin"></span>Computing…';
  setStatus('Computing…','busy');setProgress(0);
  kerningData=[];glyphCache=[];
  await new Promise(r=>setTimeout(r,10));

  try{
    const upm=fontObj.unitsPerEm; currentUPM=upm;
    let yBot=-(upm*.2),yTop=upm*.8;
    if(fontObj.tables?.os2){const o=fontObj.tables.os2;if(o.sTypoDescender!==undefined)yBot=o.sTypoDescender;if(o.sTypoAscender!==undefined)yTop=o.sTypoAscender;}
    else if(fontObj.tables?.hhea){if(fontObj.tables.hhea.descender!==undefined)yBot=fontObj.tables.hhea.descender;if(fontObj.tables.hhea.ascender!==undefined)yTop=fontObj.tables.hhea.ascender;}
    yBotGlobal=yBot; yTopGlobal=yTop;

    log(`Params: zones=${p.zones} smooth=${document.getElementById('p-smooth').value} blur=${p.blur} round=${p.round} mingap=${Math.round(p.mingap*100)}% thresh=${p.threshold} tracking=${p.tracking} baseLc=${p.baselc} baseUc=${p.baseuc} pairlimit=${p.pairlimit||'all'}`,'info');

    // Step 1: margins — all glyphs in font (allowedChars filter only used for pair building)
    const allKeys=Object.keys(fontObj.glyphs.glyphs);
    let done=0;
    glyphCache={};glowPreviewCache={};
    for(const key of allKeys){
      const g=fontObj.glyphs.glyphs[key];
      done++;
      if(!g.path||g.path.commands.length===0)continue;
      const gk=g.name??`glyph_${key}`;
      const unicode=g.unicodes?.[0]??null;
      const cl=cLbl(unicode,g.name,gk);
      const{left,right,leftRaw,rightRaw,leftGeom,rightGeom,advanceWidth}=computeGlyphMargins(g,upm,p,yBot,yTop);
      const cls=classifyGlyph(unicode,gk);
      glyphCache[gk]={left,right,leftRaw,rightRaw,leftGeom,rightGeom,charLabel:cl,unicode,glyphName:gk,cls,advanceWidth};
      if(done%50===0){setProgress(done/allKeys.length*40);await new Promise(r=>setTimeout(r,0));}
    }
    setProgress(40);
    log(`Margins: ${Object.keys(glyphCache).length} glyphs`,'ok');

    // Step 2: baselines — use user-configured reference glyphs + tracking offset
    const baseLCglyph=p.baselc; const baseUCglyph=p.baseuc;
    const nD=glyphCache[baseLCglyph],oD=glyphCache[baseUCglyph];
    const lcC=nD?pairMean(nD.right,nD.left):null;
    baseValueLC=(lcC?lcC.mean:0)+p.tracking;  // tracking shifts the effective base
    const ucC=oD?pairMean(oD.right,oD.left):null;
    baseValueUC=(ucC?ucC.mean:(baseValueLC-p.tracking))+p.tracking;
    log(`Base LC (${baseLCglyph}+${baseLCglyph}): Ø${r1(baseValueLC-p.tracking)} + tracking ${p.tracking} = ${r1(baseValueLC)}   Base UC (${baseUCglyph}+${baseUCglyph}): Ø${r1(baseValueUC)}`,'info');
    document.getElementById('s-baseLc').textContent=r1(baseValueLC);
    document.getElementById('s-baseUc').textContent=r1(baseValueUC);
    document.getElementById('sk-baseLc').textContent=`Base LC (${baseLCglyph}+${baseLCglyph})`;
    document.getElementById('sk-baseUc').textContent=`Base UC (${baseUCglyph}+${baseUCglyph})`;
    // Counter & Print measurement for reference glyphs o and O
    const ctrLC=measureCounterPrint(glyphCache['o'],upm,p,yBot,yTop);
    const ctrUC=measureCounterPrint(glyphCache['O'],upm,p,yBot,yTop);
    // Compute total zone area for LC and UC reference glyphs
    const lcGC=glyphCache[p.baselc], ucGC=glyphCache[p.baseuc];
    if(lcGC&&ctrLC){
      const totArea=lcGC.advanceWidth*(yTop-yBot);  // advanceWidth × em height in FU²
      const marginArea=baseValueLC*(lcC?lcC.validCount:0);  // base × valid zones (approx)
      const totalLCZones=(yTop-yBot);  // font units of total em height
      document.getElementById('s-totlc').textContent=r1(totalLCZones);
      const tot=marginArea+ctrLC.counter+ctrLC.print||1;
      // Percentages relative to measured total (margin+counter+print)
      document.getElementById('s-pct-marg-lc').textContent=r1(marginArea/tot*100)+'%';
      document.getElementById('s-pct-cnt-lc').textContent=r1(ctrLC.counter/tot*100)+'%';
      document.getElementById('s-pct-prt-lc').textContent=r1(ctrLC.print/tot*100)+'%';
    }
    if(ucGC&&ctrUC){
      const totalUCZones=(yTop-yBot);
      const marginAreaUC=baseValueUC*(ucC?ucC.validCount:0);
      document.getElementById('s-totuc').textContent=r1(totalUCZones);
      const tot=marginAreaUC+ctrUC.counter+ctrUC.print||1;
      document.getElementById('s-pct-marg-uc').textContent=r1(marginAreaUC/tot*100)+'%';
      document.getElementById('s-pct-cnt-uc').textContent=r1(ctrUC.counter/tot*100)+'%';
      document.getElementById('s-pct-prt-uc').textContent=r1(ctrUC.print/tot*100)+'%';
    }
    setProgress(45);

    // Step 3: pairs with capping and threshold
    const gks=Object.keys(glyphCache);
    const gc=gks.length;
    const minGapFU=upm*p.mingap;
    log(`Min gap floor: ${r1(minGapFU)} fu (${Math.round(p.mingap*100)}% × UPM ${upm})`);

    // Build pair queue from KERNING_PAIRS in frequency order (pairlimit=0 means all)
    const labelToKey={};
    for(const k of gks)labelToKey[glyphCache[k].charLabel]=k;
    const pairQueue=buildPairQueue(labelToKey,p.pairlimit);
    // SC and OSF expansion: UC+LC→UC+SC, LC+LC→SC+SC, all digit pairs
    {
      const scFor={};
      for(const k of Object.keys(glyphCache)){const gn=glyphCache[k].glyphName||k;if(!gn.endsWith('.sc'))continue;const base=gn.slice(0,-3);if(glyphCache[base])scFor[glyphCache[base].charLabel]=glyphCache[k].charLabel;}
      const qSeen=new Set(pairQueue.map(({kA,kB})=>kA+'|'+kB));
      const addP=(kA,kB)=>{const id=kA+'|'+kB;if(!qSeen.has(id)&&glyphCache[kA]&&glyphCache[kB]){qSeen.add(id);pairQueue.push({kA,kB});}};
      for(const{kA,kB}of pairQueue.slice()){const a=glyphCache[kA],b=glyphCache[kB];if(!a||!b)continue;if(a.cls==='UC'&&b.cls==='LC'){const sl=scFor[b.charLabel];if(sl&&labelToKey[sl])addP(kA,labelToKey[sl]);}if(a.cls==='LC'&&b.cls==='LC'){const sa=scFor[a.charLabel],sb=scFor[b.charLabel];if(sa&&sb&&labelToKey[sa]&&labelToKey[sb])addP(labelToKey[sa],labelToKey[sb]);}}
      const dN=['zero','one','two','three','four','five','six','seven','eight','nine'];
      const dK=dN.map(d=>labelToKey[d]).filter(Boolean);
      const oK=dN.map(d=>{for(const s of['oldstyle','.oldstyle','.onum','.osf']){const k=labelToKey[d+s];if(k)return k;}return null;}).filter(Boolean);
      for(const kA of dK)for(const kB of dK)addP(kA,kB);
      for(const kA of oK)for(const kB of oK)addP(kA,kB);
      if(scFor&&Object.keys(scFor).length)log(`SC pairs added (${Object.keys(scFor).length} SC glyphs found)`,'info');
      if(oK.length)log(`OSF digit pairs added (${oK.length} OSF glyphs found)`,'info');
    }
    log(`Pair queue: ${pairQueue.length.toLocaleString()} pairs${p.pairlimit>0?' (limit '+p.pairlimit+')':''}`,"info");

    const totalPairs=pairQueue.length;
    done=0;
    for(let pi=0;pi<pairQueue.length;pi++){
      const {kA,kB}=pairQueue[pi];
      try{
        const gcA=glyphCache[kA],gcB=glyphCache[kB];
        if(!gcA||!gcB)continue;
        const calc=pairMean(gcA.right,gcB.left);
        if(!calc)continue;
        const bothUC=gcA.cls==='UC'&&gcB.cls==='UC';
        const base=bothUC?baseValueUC:baseValueLC;
        const tag=bothUC?'UC':(gcA.cls==='UC'||gcB.cls==='UC')?'mixed':'LC';
        let corr=rtm(base-calc.mean,p.round);
        if(p.lazy>0)corr=rtm(corr*(1-p.lazy/100),p.round);
        let capped=false;
        if(minGapFU>0){
          // Use raw ink margins (pre-smooth/glow) so real ink boundaries determine the gap.
          // Covers protruding parts (negative LSB/RSB) and zones that already overlap.
          // Constraint: geomGap[z] + corr >= minGapFU  for every zone with ink in both glyphs.
          // Uses geometric (outline-only) margins so glow/smooth cannot distort the check.
          // => corr >= minGapFU - min(geomGap)  = -(room)
          const rawSums=[];
          for(let z=0;z<gcA.rightGeom.length;z++){const a=gcA.rightGeom[z],b=gcB.leftGeom[z];if(a!==null&&b!==null)rawSums.push(a+b);}
          if(rawSums.length>0){
            const minZG=Math.min(...rawSums);
            const room=minZG-minGapFU;          // >0 = headroom, <0 = already too close/overlapping
            let minCorr;
            if(room>=0){
              // Can tighten by at most floor(room) to guarantee minGap at tightest zone
              minCorr=-(p.round>1?Math.floor(room/p.round)*p.round:Math.floor(room));
            }else{
              // Glyphs closer than minGap: require a positive correction (ceil to round up)
              minCorr=p.round>1?Math.ceil(-room/p.round)*p.round:Math.ceil(-room);
            }
            if(corr<minCorr){corr=minCorr;capped=true;}
          }
        }
        if(p.threshold>0&&!capped&&Math.abs(corr)<p.threshold)corr=0;
        kerningData.push({left:gcA.charLabel,right:gcB.charLabel,correction:corr,mean:r1(calc.mean),base:r1(base),tag,capped,zones:calc.zoneValues.map(v=>`z${v.z}:${v.sum}`).join(','),zonesArr:calc.zoneValues});
      }catch(pairErr){console.warn('pair error',kA,kB,pairErr);}
      if(pi%Math.max(1,Math.floor(pairQueue.length/20))===0){setProgress(45+pi/pairQueue.length*50);await new Promise(r=>setTimeout(r,0));}
    }

    // Space pairs: glyph+space and space+glyph, using base glyph margin
    addSpacePairs(gks,glyphCache,p,baseValueLC,baseValueUC);

    setProgress(100);
    document.getElementById('s-glyphs').textContent=gc;
    const nz=kerningData.filter(d=>d.correction!==0).length;
    document.getElementById('s-pairs').textContent=nz.toLocaleString();
    log(`Pairs: ${kerningData.length.toLocaleString()}  non-zero: ${nz.toLocaleString()}`,'ok');

    filteredData=kerningData.slice();
    sortAndRender();
    buildKernMap();
    applyTextMode();
    renderPreview();
    if(currentTab==='spacing')renderSpacingTable();
    if(currentTab==='cadence'){cadEnsureInit();renderCadence();}
    updateCounterStats();
    const nzCount=kerningData.filter(d=>d.correction!==0).length;
    setStatus(`${gc} gl · ${kerningData.length.toLocaleString()} pairs · ${nzCount.toLocaleString()} kern`,'active');
    updateLightModeButton();
  }catch(err){
    log('Error: '+err.message,'err');
    setStatus('Error','error');
    console.error(err);
  }
  btn.disabled=false;btn.innerHTML='▶ Recompute';
  updateCadenceField();
  afterCompute();
}

if(typeof module!=='undefined')module.exports={measureStemCadence,loadFont,initLoadAndCompute,runAnalysis};
