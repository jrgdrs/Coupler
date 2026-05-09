// ══════════════════════════════════════════════════════
// CADENCE TAB
// ══════════════════════════════════════════════════════
function cadReset(){
  ['cad-equator','cad-left','cad-right','cad-stem','cad-interval','cad-step','cad-cadence'].forEach(id=>{
    document.getElementById(id).value='';
  });
}

function cadXHeight(){
  const upm=IS_GLYPHS?currentUPM:fontObj?.unitsPerEm||1000;
  if(!IS_GLYPHS&&fontObj){
    const xg=fontObj.charToGlyph('x');
    if(xg&&xg.path&&xg.path.commands.length>0)return Math.round(xg.getBoundingBox().y2);
  } else if(IS_GLYPHS&&glyphsByName?.['x']?.commands){
    // Y is negated in Glyphs commands (font-Y → screen-Y), so topmost point is most negative
    let yMin=Infinity;
    for(const c of glyphsByName['x'].commands)
      for(const k of['y','y1','y2'])if(c[k]!==undefined)yMin=Math.min(yMin,c[k]);
    if(yMin<0)return Math.round(-yMin);
  }
  return Math.round(upm*0.5);
}
function cadEnsureInit(){
  if(document.getElementById('cad-equator').value!=='')return;
  if(IS_GLYPHS&&Object.keys(glyphsByName||{}).length===0)return;
  const upm=IS_GLYPHS?currentUPM:fontObj?.unitsPerEm;
  if(!upm)return;
  const xh=cadXHeight();
  const eq=Math.round(xh/2);
  document.getElementById('cad-equator').value=eq;
  const runs=cadScan(eq);
  if(runs){
    const left=runs[0][0],stem=runs[0][1]-runs[0][0],interval=runs[1][0]-runs[0][0];
    document.getElementById('cad-left').value=Math.round(left);
    document.getElementById('cad-stem').value=Math.round(stem);
    document.getElementById('cad-interval').value=Math.round(interval);
    cadCalcStep();
  }
}

function cadScan(equFU){
  // Renders 'n' to off-screen canvas, returns ink-run edge pairs in font units, or null
  const upm=IS_GLYPHS?currentUPM:fontObj?.unitsPerEm;
  if(!upm)return null;
  const SC=4; // px per font unit
  const yT=yTopGlobal||upm*0.8, yB=yBotGlobal||-(upm*0.2);
  const bY=4+Math.ceil(yT*SC);
  const H2=bY+Math.ceil(Math.abs(yB)*SC)+4;
  let AW=upm;
  const off=document.createElement('canvas');
  const octx=off.getContext('2d');
  octx.fillStyle='#000';
  if(!IS_GLYPHS){
    if(!fontObj)return null;
    const g=fontObj.charToGlyph('n');
    if(!g||!g.path||!g.path.commands.length)return null;
    AW=g.advanceWidth||upm;
    off.width=Math.ceil(AW*SC);off.height=H2;
    octx.fill(new Path2D(g.getPath(0,bY,SC*upm).toPathData(2)));
  } else {
    const gd=glyphsByName?.['n'];
    if(!gd||!gd.commands||!gd.commands.length)return null;
    AW=gd.advanceWidth||upm;
    off.width=Math.ceil(AW*SC);off.height=H2;
    const p2d=commandsToPath2D(gd.commands,0,bY,SC);
    if(p2d)octx.fill(p2d);
  }
  const row=Math.round(bY-equFU*SC);
  if(row<0||row>=H2)return null;
  const px=octx.getImageData(0,row,off.width,1).data;
  const runs=[];let inR=false,rs=0;
  for(let x=0;x<off.width;x++){
    const ink=px[x*4+3]>127;
    if(ink&&!inR){inR=true;rs=x;}
    else if(!ink&&inR){inR=false;runs.push([rs/SC,(x-1)/SC]);}
  }
  if(inR)runs.push([rs/SC,(off.width-1)/SC]);
  return runs.length>=2?runs:null;
}

function cadGetAW(){
  if(!IS_GLYPHS&&fontObj){const g=fontObj.charToGlyph('n');if(g)return g.advanceWidth||(fontObj.unitsPerEm||1000);}
  if(IS_GLYPHS){const gd=glyphsByName?.['n'];if(gd)return gd.advanceWidth||(currentUPM||1000);}
  return IS_GLYPHS?currentUPM||1000:fontObj?.unitsPerEm||1000;
}
function cadUpdateRight(){
  const l=parseFloat(document.getElementById('cad-left').value);
  const iv=parseFloat(document.getElementById('cad-interval').value);
  const st=parseFloat(document.getElementById('cad-stem').value);
  const el=document.getElementById('cad-right');
  if(!isNaN(l)&&!isNaN(iv)&&!isNaN(st))
    el.value=Math.round(cadGetAW()-(l+iv+st));
  else
    el.value='';
}
function cadCalcStep(){
  const iv=parseFloat(document.getElementById('cad-interval').value);
  const st=parseFloat(document.getElementById('cad-stem').value);
  const dv=Math.max(1,parseInt(document.getElementById('cad-divider').value)||4);
  if(!isNaN(iv)&&!isNaN(st)&&st>0){
    const step=Math.max(1,Math.round(iv*dv/st));
    document.getElementById('cad-step').value=step;
    document.getElementById('cad-cadence').value=r1(iv/step);
  } else {
    document.getElementById('cad-step').value='';
    document.getElementById('cad-cadence').value='';
  }
  cadUpdateRight();
}
function cadInput(src){
  const dv=Math.max(1,parseInt(document.getElementById('cad-divider').value)||4);
  if(src==='eq'){
    const eq=parseFloat(document.getElementById('cad-equator').value);
    if(!isNaN(eq)){
      const runs=cadScan(eq);
      if(runs){
        const left=runs[0][0],stem=runs[0][1]-runs[0][0],interval=runs[1][0]-runs[0][0];
        document.getElementById('cad-left').value=Math.round(left);
        document.getElementById('cad-stem').value=Math.round(stem);
        document.getElementById('cad-interval').value=Math.round(interval);
        cadCalcStep();
      }
    }
  } else if(src==='interval'||src==='stem'||src==='div'){
    cadCalcStep();
  } else if(src==='step'){
    const step=Math.max(1,parseInt(document.getElementById('cad-step').value)||1);
    const st=parseFloat(document.getElementById('cad-stem').value);
    if(!isNaN(st)&&st>0){
      const iv=Math.round(step*st/dv);
      document.getElementById('cad-interval').value=iv;
      document.getElementById('cad-cadence').value=r1(iv/step);
      cadUpdateRight();
    }
  }
  renderCadence();
}
function cadAssignPreset(){
  const cad=parseFloat(document.getElementById('cad-cadence').value);
  if(!isNaN(cad)&&cad>0){
    document.getElementById('p-round').value=cadToRound(cad);
    const el=document.getElementById('p-round');
    el.style.borderColor='var(--accent)';
    setTimeout(()=>el.style.borderColor='',800);
  }
}

// Adjust raw cadence to a suitable Round module value:
// > 40 → halve (stem interval too coarse), < 20 → double (too fine)
function cadToRound(raw){const n=Math.round(raw);return n>40?Math.round(n/2):n<20?Math.round(n*2):n;}

function updateCadenceField(){
  try{
    cadEnsureInit();
    const cv=document.getElementById('cad-cadence').value;
    const n=cadToRound(parseFloat(cv));
    if(!isNaN(n)&&n>0){
      document.getElementById('light-cad-val').value=n;
      if(!cadenceAutoFilled){
        document.getElementById('p-round').value=n;
        cadenceAutoFilled=true;
      }
    }
    renderLightCadCanvas();
  }catch(_){}
}

function renderCadence(){
  const canvas=document.getElementById('cadence-canvas');
  const wrap=document.getElementById('cadence-wrap');
  if(!canvas||!wrap)return;
  const W=wrap.offsetWidth,H=wrap.offsetHeight;
  if(W<10||H<10)return;
  const dpr=window.devicePixelRatio||1;
  canvas.width=W*dpr;canvas.height=H*dpr;
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.fillStyle='#141618';ctx.fillRect(0,0,W,H);

  const hasFont=IS_GLYPHS?Object.keys(glyphsByName||{}).length>0:!!fontObj;
  if(!hasFont){
    ctx.fillStyle='#3d4450';ctx.font='12px monospace';ctx.textAlign='left';
    ctx.fillText('Load a font to use Cadence',20,H/2);return;
  }

  const upm=IS_GLYPHS?currentUPM:fontObj.unitsPerEm;
  const xh=cadXHeight();

  // Glyph 'n' data
  let AW=upm,bbx1=0,bbx2=upm*0.5;
  if(!IS_GLYPHS&&fontObj){
    const g=fontObj.charToGlyph('n');
    if(g){AW=g.advanceWidth||upm;if(g.path&&g.path.commands.length>0){const bb=g.getBoundingBox();bbx1=bb.x1;bbx2=bb.x2;}}
  } else if(IS_GLYPHS){
    const gd=glyphsByName?.['n'];
    if(gd){AW=gd.advanceWidth||upm;if(gd.commands){let mn=Infinity,mx=-Infinity;for(const c of gd.commands){for(const k of['x','x1','x2'])if(c[k]!==undefined){mn=Math.min(mn,c[k]);mx=Math.max(mx,c[k]);}}if(mn<Infinity){bbx1=mn;bbx2=mx;}}}
  }

  // Layout
  const rPad=60,bPad=22,drawW=W-rPad,drawH=H-bPad;
  const scale=drawH*0.66/xh;
  const topM=drawH*0.17; // top margin above glyph
  const baseY=topM+xh*scale; // canvas y of baseline

  // FU → canvas
  const fx=fu=>20+(fu*(drawW-40)/AW); // map 0..AW to 20..drawW-20
  const fy=fu=>baseY-fu*scale;

  // Actually better to center glyph advance width in drawW
  const awPx=AW*scale;
  const xOff=Math.max(16,(drawW-awPx)/2);
  const fxA=fu=>xOff+fu*scale; // font-unit x → canvas x (absolute)

  // ── Dimmed glyph ──
  ctx.save();ctx.globalAlpha=0.28;ctx.fillStyle='#d4d8de';
  if(!IS_GLYPHS&&fontObj){
    const g=fontObj.charToGlyph('n');
    if(g&&g.path&&g.path.commands.length>0)ctx.fill(new Path2D(g.getPath(xOff,baseY,scale*upm).toPathData(2)));
  } else if(IS_GLYPHS){
    const gd=glyphsByName?.['n'];
    if(gd&&gd.commands){const p2d=commandsToPath2D(gd.commands,xOff,baseY,scale);if(p2d)ctx.fill(p2d);}
  }
  ctx.restore();

  // ── Yellow baseline & x-height ──
  ctx.setLineDash([]);
  [[0,'0'],[xh,String(xh)]].forEach(([yFU,lbl])=>{
    ctx.strokeStyle='rgba(232,160,32,.7)';ctx.lineWidth=0.8;
    ctx.beginPath();ctx.moveTo(0,fy(yFU));ctx.lineTo(drawW,fy(yFU));ctx.stroke();
    ctx.fillStyle='rgba(232,160,32,.85)';ctx.font='bold 9px monospace';ctx.textAlign='left';
    ctx.fillText(lbl,drawW+4,fy(yFU)+4);
  });
  // Factor: how many Cadence units fit in x-height (below x-height label)
  const cadCadVal=parseFloat(document.getElementById('cad-cadence').value);
  if(!isNaN(cadCadVal)&&cadCadVal>0){
    const factor=Math.round(xh/cadCadVal*10)/10;
    ctx.fillStyle='rgba(232,160,32,.55)';ctx.font='9px monospace';ctx.textAlign='left';
    ctx.fillText('×'+factor,drawW+4,fy(xh)+15);
  }

  // ── Equator ──
  let equFU=parseFloat(document.getElementById('cad-equator').value);
  if(isNaN(equFU))equFU=Math.round(xh/2);
  ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=0.8;
  ctx.beginPath();ctx.moveTo(0,fy(equFU));ctx.lineTo(drawW,fy(equFU));ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.65)';ctx.font='bold 9px monospace';ctx.textAlign='left';
  ctx.fillText(String(Math.round(equFU)),drawW+4,fy(equFU)+4);


  // ── Cadence overlay lines ──
  const cadL=parseFloat(document.getElementById('cad-left').value);
  const cadSt=parseFloat(document.getElementById('cad-stem').value);
  const cadIv=parseFloat(document.getElementById('cad-interval').value);
  const cadDiv=Math.max(1,parseInt(document.getElementById('cad-divider').value)||4);
  const glyphTop=fy(xh),glyphBot=fy(0);

  function vline(xFU,color,lw,dash,y0,y1){
    const cx=fxA(xFU);
    ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.setLineDash(dash);
    ctx.beginPath();ctx.moveTo(cx,y0);ctx.lineTo(cx,y1);ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── White solid: x=0 and advance width boundaries (full height) ──
  vline(0,'rgba(255,255,255,.55)',1,[],0,drawH);
  vline(AW,'rgba(255,255,255,.55)',1,[],0,drawH);
  ctx.fillStyle='rgba(255,255,255,.5)';ctx.font='9px monospace';ctx.textAlign='center';
  ctx.fillText('0',fxA(0),drawH+15);
  ctx.fillText(String(Math.round(AW)),fxA(AW),drawH+15);

  if(!isNaN(cadL)&&!isNaN(cadSt)&&cadSt>0){
    // ── Gray dashed divider grid (radiates from cadL at Stem/Divider spacing) ──
    const divStep=cadSt/cadDiv;
    // Compute range of n such that cadL + n*divStep ∈ [0, AW]
    const nMin=Math.ceil((0-cadL)/divStep);
    const nMax=Math.floor((AW-cadL)/divStep);
    for(let n=nMin;n<=nMax;n++){
      if(n===0||n===cadDiv)continue; // white lines at those positions
      vline(cadL+n*divStep,'rgba(160,160,160,.38)',0.6,[3,3],glyphTop,glyphBot);
    }
    // ── White stem lines at Left and Left+Stem ──
    vline(cadL,'rgba(255,255,255,.8)',0.8,[],glyphTop,glyphBot);
    vline(cadL+cadSt,'rgba(255,255,255,.8)',0.8,[],glyphTop,glyphBot);

    if(!isNaN(cadIv)){
      // Interval line (start of right stem)
      vline(cadL+cadIv,'rgba(255,255,255,.8)',0.8,[],glyphTop,glyphBot);
      // Additional line at interval + stem (end of right stem)
      vline(cadL+cadIv+cadSt,'rgba(255,255,255,.4)',0.8,[],glyphTop,glyphBot);
    }
  }
}

// Wire cadence resize observer
new ResizeObserver(()=>{if(currentTab==='cadence')renderCadence();}).observe(document.getElementById('cadence-wrap'));

function renderLightCadCanvas(){
  const canvas=document.getElementById('light-cad-canvas');
  if(!canvas)return;
  const W=canvas.offsetWidth||200,H=canvas.offsetHeight||110;
  if(W<10||H<10)return;
  const dpr=window.devicePixelRatio||1;
  canvas.width=W*dpr;canvas.height=H*dpr;
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.fillStyle='#141618';ctx.fillRect(0,0,W,H);

  const hasFont=IS_GLYPHS?Object.keys(glyphsByName||{}).length>0:!!fontObj;
  if(!hasFont)return;

  const upm=IS_GLYPHS?currentUPM:fontObj.unitsPerEm;
  const xh=cadXHeight();
  let AW=upm;
  if(!IS_GLYPHS&&fontObj){const g=fontObj.charToGlyph('n');if(g)AW=g.advanceWidth||upm;}
  else if(IS_GLYPHS){const gd=glyphsByName?.['n'];if(gd)AW=gd.advanceWidth||upm;}

  const drawW=W,drawH=H;
  const scale=drawH*0.66/xh;
  const topM=drawH*0.17;
  const baseY=topM+xh*scale;
  const awPx=AW*scale;
  const xOff=Math.max(8,(drawW-awPx)/2);
  const fxA=fu=>xOff+fu*scale;
  const fy=fu=>baseY-fu*scale;

  // Dimmed glyph
  ctx.save();ctx.globalAlpha=0.28;ctx.fillStyle='#d4d8de';
  if(!IS_GLYPHS&&fontObj){
    const g=fontObj.charToGlyph('n');
    if(g&&g.path&&g.path.commands.length>0)ctx.fill(new Path2D(g.getPath(xOff,baseY,scale*upm).toPathData(2)));
  } else if(IS_GLYPHS){
    const gd=glyphsByName?.['n'];
    if(gd&&gd.commands){const p2d=commandsToPath2D(gd.commands,xOff,baseY,scale);if(p2d)ctx.fill(p2d);}
  }
  ctx.restore();

  // Amber baseline & x-height
  ctx.setLineDash([]);
  [0,xh].forEach(yFU=>{
    ctx.strokeStyle='rgba(232,160,32,.7)';ctx.lineWidth=0.8;
    ctx.beginPath();ctx.moveTo(0,fy(yFU));ctx.lineTo(drawW,fy(yFU));ctx.stroke();
  });

  // White equator
  let equFU=parseFloat(document.getElementById('cad-equator').value);
  if(isNaN(equFU))equFU=Math.round(xh/2);
  ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=0.8;
  ctx.beginPath();ctx.moveTo(0,fy(equFU));ctx.lineTo(drawW,fy(equFU));ctx.stroke();

  // Cadence vertical lines
  const cadL=parseFloat(document.getElementById('cad-left').value);
  const cadSt=parseFloat(document.getElementById('cad-stem').value);
  const cadIv=parseFloat(document.getElementById('cad-interval').value);
  const cadDiv=Math.max(1,parseInt(document.getElementById('cad-divider').value)||4);
  const glyphTop=fy(xh),glyphBot=fy(0);

  function vline(xFU,color,lw,dash,y0,y1){
    const cx=fxA(xFU);
    ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.setLineDash(dash);
    ctx.beginPath();ctx.moveTo(cx,y0);ctx.lineTo(cx,y1);ctx.stroke();
    ctx.setLineDash([]);
  }

  if(!isNaN(cadL)&&!isNaN(cadSt)&&cadSt>0){
    const divStep=cadSt/cadDiv;
    const nMin=Math.ceil((0-cadL)/divStep),nMax=Math.floor((AW-cadL)/divStep);
    for(let n=nMin;n<=nMax;n++){
      if(n===0||n===cadDiv)continue;
      vline(cadL+n*divStep,'rgba(160,160,160,.38)',0.6,[3,3],glyphTop,glyphBot);
    }
    vline(cadL,'rgba(255,255,255,.8)',0.8,[],glyphTop,glyphBot);
    vline(cadL+cadSt,'rgba(255,255,255,.8)',0.8,[],glyphTop,glyphBot);
    if(!isNaN(cadIv)){
      vline(cadL+cadIv,'rgba(255,255,255,.8)',0.8,[],glyphTop,glyphBot);
      vline(cadL+cadIv+cadSt,'rgba(255,255,255,.4)',0.8,[],glyphTop,glyphBot);
    }
  }
}

if(typeof module!=='undefined')module.exports={cadReset,cadXHeight,cadEnsureInit,cadScan,cadGetAW,cadUpdateRight,cadCalcStep,cadInput,cadAssignPreset,cadToRound,updateCadenceField,renderCadence,renderLightCadCanvas};
