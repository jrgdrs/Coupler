// ── PREVIEW ───────────────────────────────────────────
function toggleKern(){
  showKerning=!showKerning;
  const b=document.getElementById('tbtn-kern');
  b.textContent=showKerning?'⟷ Kerning ON':'⟷ Kerning OFF';
  b.className='tbtn '+(showKerning?'on-green':'');
  renderPreview();
}
function toggleMetrics(){showMetrics=!showMetrics;document.getElementById('tbtn-metrics').className='tbtn'+(showMetrics?' on':'');renderPreview();}
function toggleGlow(){showGlow=!showGlow;document.getElementById('tbtn-glow').className='tbtn'+(showGlow?' on':'');renderPreview();}
function toggleLightMode(){
  lightMode=!lightMode;
  document.body.classList.toggle('light-mode',lightMode);
  updateLightModeButton();
  if(IS_GLYPHS){
    if(lightMode){window.location.href='coupler://resize?w=240&h=675';}
    else{window.location.href='coupler://resize?w=980&h=720';}
  }
}
function updateLightModeButton(){
  const b=document.getElementById('btn-light-act');if(b)b.disabled=kerningData.length===0;
  const r=document.getElementById('btn-light-recompute');if(r)r.disabled=kerningData.length===0;
  const c=document.getElementById('btn-light-clip');if(c)c.disabled=kerningData.length===0;
}

function afterCompute(){
  isComputing=false;
  const next=pendingAction;
  pendingAction=null;
  if(next)setTimeout(next,0);
}

function guardedAction(fn){
  if(isComputing){pendingAction=fn;log('⏳ Action queued — will run after computation finishes','info');return;}
  fn();
}

function toggleBaseline(){showBaseline=!showBaseline;document.getElementById('tbtn-baseline').className='tbtn'+(showBaseline?' on':'');renderPreview();}
function toggleXheight(){showXheight=!showXheight;document.getElementById('tbtn-xheight').className='tbtn'+(showXheight?' on':'');renderPreview();}
function toggleSmallCaps(){showSmallCaps=!showSmallCaps;document.getElementById('tbtn-sc').className='tbtn'+(showSmallCaps?' on':'');applyTextMode();renderPreview();}
function toggleOSF(){showOSF=!showOSF;document.getElementById('tbtn-osf').className='tbtn'+(showOSF?' on':'');applyTextMode();renderPreview();}

// ── GRAYSCALE PREVIEW HELPER ──────────────────────────
// Returns a cached HTMLCanvasElement with the blur heatmap for a glyph at 1px/FU.
// Colors: RGBA where R=255,G=140,B=20 and alpha = blurred ink opacity (0-255).
// Cache key includes greyBlur so changing the param auto-invalidates.
// Returns a cached amber silhouette canvas for glyph gk at 1px/FU.
// Visual blur is applied separately via ctx.filter when drawing to the preview.
function buildGlowCanvas(gk, glyph, upm, yBot, yTop){
  if(glowPreviewCache[gk]) return glowPreviewCache[gk];

  const SC = 1;
  const topPx = Math.max(1, Math.ceil(yTop * SC));
  const H = topPx + Math.max(0, Math.ceil(-yBot * SC));
  const W = Math.max(1, Math.ceil((glyph.advanceWidth || upm) * SC));

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#fff';

  if(IS_GLYPHS){
    const gd = glyphsByName[gk];
    if(gd?.commands){ const p2d=commandsToPath2D(gd.commands,0,topPx,SC); if(p2d)cx.fill(p2d); }
  } else {
    const pd = glyph.getPath(0, topPx, SC * upm).toPathData(4);
    if(pd) cx.fill(new Path2D(pd));
  }

  // Tint amber — keep original alpha, just set RGB
  const id = cx.getImageData(0, 0, W, H);
  const d = id.data;
  for(let i=0;i<W*H;i++){ d[i*4]=255; d[i*4+1]=160; d[i*4+2]=0; }
  cx.putImageData(id, 0, 0);
  glowPreviewCache[gk] = cv;
  return cv;
}

// Collect glyph names for a given OpenType feature variant
// Small caps: glyph names ending in .sc or .smcp; OSF: ending in .osf or in oldstyle set (F730–F739)
function getSmallCapsGlyphs(){
  if(IS_GLYPHS){
    const map={};
    for(const [name,g] of Object.entries(glyphsByName)){
      const m=name.match(/^([a-zA-Z])\.(sc|smcp)$/i);
      if(m){map[m[1].toLowerCase()]={name,advanceWidth:g.advanceWidth};map[m[1].toUpperCase()]={name,advanceWidth:g.advanceWidth};}
    }
    return map;
  }
  if(!fontObj)return{};
  const map={};
  for(const key of Object.keys(fontObj.glyphs.glyphs)){
    const g=fontObj.glyphs.glyphs[key];
    if(!g.name)continue;
    // small cap variants typically named "a.sc","A.sc","a.smcp" etc.
    const m=g.name.match(/^([a-zA-Z])\.(sc|smcp)$/i);
    if(m){
      // map the uppercase version of the base letter to this sc glyph
      map[m[1].toLowerCase()]=g;
      map[m[1].toUpperCase()]=g;
    }
  }
  return map;
}

function getOSFGlyphs(){
  if(IS_GLYPHS){
    const map={};
    const digits={'zero':'0','one':'1','two':'2','three':'3','four':'4','five':'5','six':'6','seven':'7','eight':'8','nine':'9'};
    for(const [name,g] of Object.entries(glyphsByName)){
      const m=name.match(/^(zero|one|two|three|four|five|six|seven|eight|nine)\.(osf|oldstyle)$/i);
      if(m){const ch=digits[m[1].toLowerCase()];if(ch)map[ch]={name,advanceWidth:g.advanceWidth};}
      if(g.unicode>=0xF730&&g.unicode<=0xF739)map[String(g.unicode-0xF730)]={name,advanceWidth:g.advanceWidth};
    }
    return map;
  }
  if(!fontObj)return{};
  const map={};
  // OSF glyph names: zero.osf, one.osf ... or oldstyle PUA F730-F739
  for(const key of Object.keys(fontObj.glyphs.glyphs)){
    const g=fontObj.glyphs.glyphs[key];
    if(!g.name)continue;
    const m=g.name.match(/^(zero|one|two|three|four|five|six|seven|eight|nine)\.(osf|oldstyle)$/i);
    if(m){
      const digits={'zero':'0','one':'1','two':'2','three':'3','four':'4','five':'5','six':'6','seven':'7','eight':'8','nine':'9'};
      const ch=digits[m[1].toLowerCase()];
      if(ch)map[ch]=g;
    }
    // PUA oldstyle figures F730–F739
    if(g.unicodes){
      for(const u of g.unicodes){
        if(u>=0xF730&&u<=0xF739)map[String(u-0xF730)]=g;
      }
    }
  }
  return map;
}

let _scGlyphs={},_osfGlyphs={};
function applyTextMode(){
  _scGlyphs=showSmallCaps?getSmallCapsGlyphs():{};
  _osfGlyphs=showOSF?getOSFGlyphs():{};
}

function resolveGlyph(ch){
  const cp=ch.codePointAt(0);
  if(IS_GLYPHS){
    // OSF/SC substitution using Glyphs-mode variant maps
    if(showOSF&&_osfGlyphs[ch])return _osfGlyphs[ch];
    if(showSmallCaps&&_scGlyphs[ch])return _scGlyphs[ch];
    const name=unicodeToGlyphName[cp];
    if(!name)return null;
    const g=glyphsByName[name];
    return g?{name,advanceWidth:g.advanceWidth}:null;
  }
  if(!fontObj)return null;
  // OSF substitution for digits
  if(showOSF&&_osfGlyphs[ch])return _osfGlyphs[ch];
  // Small caps substitution for letters
  if(showSmallCaps&&_scGlyphs[ch])return _scGlyphs[ch];
  return fontObj.charToGlyph(ch);
}
function syncSize(v){document.getElementById('psize').value=v;document.getElementById('psize-n').value=v;}
function applyPreset(val){
  if(!val)return;
  if(val.startsWith('sc:')){
    // Activate small caps mode and set text
    if(!showSmallCaps)toggleSmallCaps();
    document.getElementById('preview-text').value=val.slice(3);
  } else if(val.startsWith('osf:')){
    // Activate OSF mode and set text
    if(!showOSF)toggleOSF();
    document.getElementById('preview-text').value=val.slice(4);
  } else {
    document.getElementById('preview-text').value=val;
  }
  renderPreview();
}

let kernMap={};
function buildKernMap(){kernMap={};for(const d of kerningData)kernMap[d.left+':'+d.right]=d.correction;}
function getKern(a,b){return kernMap[a+':'+b]??0;}

function renderPreview(){
  const canvas=document.getElementById('preview-canvas');
  const wrap=document.getElementById('canvas-wrap');
  const dpr=window.devicePixelRatio||1;
  const W=wrap.offsetWidth;

  const hasFont = IS_GLYPHS ? Object.keys(glyphsByName).length>0 : !!fontObj;
  if(!hasFont){
    const H=120;
    canvas.width=W*dpr;canvas.height=H*dpr;
    canvas.style.height=H+'px';
    const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
    ctx.fillStyle='#141618';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#3d4450';ctx.font='12px monospace';
    ctx.fillText(IS_GLYPHS?'▶  Compute to enable preview':'Drop a font file to preview',18,H/2);
    return;
  }

  const fontSize=+document.getElementById('psize').value||72;
  // Pair preview mode: show selected pair in context "oABo nABn OABO HABHAB"
  let text=document.getElementById('preview-text').value||'';
  if(pairPreviewMode&&selectedPairIdx>=0&&selectedPairIdx<filteredData.length){
    const d=filteredData[selectedPairIdx];
    const L=d.left, R=d.right;
    // resolve label → single display character
    function labelToChar(lbl){
      if(lbl.length===1)return lbl;
      if(IS_GLYPHS){
        // find glyph by charLabel in glyphCache
        for(const[nm,gc]of Object.entries(glyphCache)){if(gc.charLabel===lbl&&gc.unicode!=null)return String.fromCodePoint(gc.unicode);}
        return lbl;
      }
      const g=fontObj.glyphs.glyphs[Object.keys(fontObj.glyphs.glyphs).find(k=>fontObj.glyphs.glyphs[k].name===lbl)];
      return g&&g.unicodes?.[0]?String.fromCodePoint(g.unicodes[0]):lbl;
    }
    const lc=labelToChar(L),rc=labelToChar(R);
    text=`o${lc}${rc}o  n${lc}${rc}n  O${lc}${rc}O  H${lc}${rc}H`;
  }
  const upm=IS_GLYPHS?currentUPM:fontObj.unitsPerEm;
  const sc=fontSize/upm;

  // Compute canvas height: ascender above baseline + descender below + padding
  const ascender=yTopGlobal||upm*.8;
  const descender=yBotGlobal||-(upm*.2);  // negative value (below baseline)
  const topPad=16, botPad=16;
  const ascPx=Math.ceil(ascender*sc);
  const desPx=Math.ceil(Math.abs(descender)*sc);  // pixels below baseline
  const H=Math.max(80, ascPx+desPx+topPad+botPad);
  const baseY=topPad+ascPx;

  canvas.width=W*dpr; canvas.height=H*dpr;
  canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);

  // bg
  ctx.fillStyle='#141618';ctx.fillRect(0,0,W,H);

  // x-height
  const xhVal = IS_GLYPHS ? xHeightGlobal : (fontObj.tables?.os2?.sxHeight||0);
  if(showXheight&&xhVal){
    const yxh=baseY-xhVal*sc;
    ctx.strokeStyle='#1e3a6e';ctx.lineWidth=1;ctx.setLineDash([]);
    ctx.fillStyle='#1e3a6e';ctx.fillRect(0,yxh,W,1);
    ctx.fillStyle='rgba(30,58,110,.8)';ctx.fillRect(0,yxh-13,48,13);
    ctx.fillStyle='#5b9cf6';ctx.font='bold 9px monospace';
    ctx.fillText('x-height',3,yxh-3);
  }

  // baseline
  if(showBaseline){
    ctx.strokeStyle='#6b3a00';ctx.lineWidth=1;ctx.setLineDash([]);
    ctx.fillStyle='#6b3a00';ctx.fillRect(0,baseY,W,1);
    ctx.fillStyle='rgba(107,58,0,.8)';ctx.fillRect(0,baseY+1,50,12);
    ctx.fillStyle='#e8a020';ctx.font='bold 9px monospace';
    ctx.fillText('baseline',3,baseY+10);
    ctx.setLineDash([]);
  }

  let x=16;
  const chars=[...text];

  for(let i=0;i<chars.length;i++){
    const ch=chars[i];
    const cp=ch.codePointAt(0);
    if(cp===32){x+=fontSize*0.2;continue;}
    const glyph=resolveGlyph(ch);
    if(!glyph||!glyph.name)continue;
    const gk=glyph.name??'';
    const lbl=cLbl(cp,glyph.name,gk);
    const aw=(glyph.advanceWidth??0)*sc;

    // advance box
    if(showMetrics){
      ctx.fillStyle='rgba(91,156,246,.09)';
      ctx.fillRect(x,baseY-ascender*sc,aw,(ascender-descender)*sc);
      ctx.strokeStyle='rgba(91,156,246,.28)';ctx.lineWidth=.5;
      ctx.strokeRect(x+.25,baseY-ascender*sc+.25,aw-.5,(ascender-descender)*sc-.5);
    }

    // grayscale glow — only when the last analysis actually ran in greyscale mode.
    // Stroke width = greyscale blur zone in screen pixels (shows blur magnitude visually).
    // Soft pink with moderate opacity — two passes for gentle accumulation.
    if(showGlow&&analysisWasGlow){
      const gb=P().glowblur||0;
      const strokeW=Math.max(1.5, gb*sc*3+1.5); // blur zone thickness in screen px
      const blurPx=strokeW*2+3;
      ctx.save();
      ctx.shadowColor='rgba(232,160,32,0.65)';
      ctx.shadowBlur=blurPx;
      ctx.strokeStyle='rgba(232,160,32,0.38)';
      ctx.lineWidth=strokeW;
      for(let gi=0;gi<2;gi++){
        if(IS_GLYPHS){
          const gd=glyphsByName[gk];
          if(gd?.commands){const p2d=commandsToPath2D(gd.commands,x,baseY,sc);if(p2d)ctx.stroke(p2d);}
        } else {
          ctx.stroke(new Path2D(glyph.getPath(x,baseY,fontSize).toPathData(2)));
        }
      }
      ctx.restore();
    }

    // glyph fill
    ctx.fillStyle=showKerning?'#e8edf3':'#6070a0';
    if(IS_GLYPHS){
      const gd=glyphsByName[gk];
      if(gd&&gd.commands){const p2d=commandsToPath2D(gd.commands,x,baseY,sc);if(p2d)ctx.fill(p2d);}
    } else {
      const path=glyph.getPath(x,baseY,fontSize);
      ctx.fill(new Path2D(path.toPathData(2)));
    }

    // margin overlays
    if(showMetrics&&kerningData.length>0){
      const gc=glyphCache[gk];
      if(gc){
        const zones=P().zones;
        const zH_fu=(yTopGlobal-yBotGlobal)/zones;
        const zH_px=(yTopGlobal-yBotGlobal)*sc/zones;
        for(let z=0;z<zones;z++){
          const lv=gc.left[z],rv=gc.right[z];
          const zLo=baseY-(yBotGlobal+z*zH_fu)*sc;
          const zHi=baseY-(yBotGlobal+(z+1)*zH_fu)*sc;
          const top=Math.min(zLo,zHi),bot=Math.max(zLo,zHi);
          if(lv!==null){
            ctx.fillStyle='rgba(232,140,0,.3)';
            ctx.fillRect(x,top,lv*sc,bot-top);
            ctx.strokeStyle='rgba(232,140,0,.7)';ctx.lineWidth=.8;ctx.strokeRect(x+.4,top+.4,lv*sc-.8,bot-top-.8);
          }
          if(rv!==null){
            ctx.fillStyle='rgba(50,180,100,.28)';
            ctx.fillRect(x+aw-rv*sc,top,rv*sc,bot-top);
            ctx.strokeStyle='rgba(50,180,100,.65)';ctx.lineWidth=.8;ctx.strokeRect(x+aw-rv*sc+.4,top+.4,rv*sc-.8,bot-top-.8);
          }
          ctx.strokeStyle='rgba(255,255,255,.04)';ctx.lineWidth=.5;ctx.setLineDash([]);
          ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x+aw,top);ctx.stroke();
        }
      }
    }

    // kerning
    let kern=0;
    if(showKerning&&kerningData.length>0&&i+1<chars.length){
      const nch=chars[i+1];
      if(nch.codePointAt(0)!==32){const ng=resolveGlyph(nch);if(ng){const nlbl=cLbl(nch.codePointAt(0),ng.name??'',ng.name??'');kern=getKern(lbl,nlbl)*sc;}}
    }
    x+=aw+kern;
  }

  // status
  ctx.fillStyle='#2a3040';ctx.font='9px monospace';
  const st=`${fontSize}px · ${showKerning?(kerningData.length?'Coupler kerning':'no data'):'kern OFF'}`;
  ctx.fillText(st,W-ctx.measureText(st).width-6,H-5);
}

const ro=new ResizeObserver(()=>renderPreview());
ro.observe(document.getElementById('canvas-wrap'));
renderPreview();

if(typeof module!=='undefined')module.exports={toggleKern,toggleMetrics,toggleGlow,toggleLightMode,updateLightModeButton,afterCompute,guardedAction,toggleBaseline,toggleXheight,toggleSmallCaps,toggleOSF,buildGlowCanvas,getSmallCapsGlyphs,getOSFGlyphs,applyTextMode,resolveGlyph,syncSize,applyPreset,buildKernMap,getKern,renderPreview};
