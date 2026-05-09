// ══════════════════════════════════════════════════════
// COUNTER & PRINT AREA MEASUREMENT
// ══════════════════════════════════════════════════════
/**
 * Measures Counter (interior void) and Print (ink area) for a glyph
 * using an off-screen canvas at zone resolution.
 *
 * Method: render glyph to an off-screen canvas at resolution (zones × blur) × advanceWidth px.
 * For each zone row:
 *   - Count black pixels (ink = Print)
 *   - Detect interior void: scan horizontally, pixels between leftmost and rightmost ink
 *     that are NOT ink = Counter
 * Returns { counter, print } as sums across all zones (in font-unit² equivalents scaled to zones×AW).
 */
function measureCounterPrint(gc, upm, p, yBot, yTop){
  if(!gc||!fontObj)return null;
  const g=fontObj.glyphs.glyphs[Object.keys(fontObj.glyphs.glyphs).find(k=>fontObj.glyphs.glyphs[k].name===gc.glyphName)];
  if(!g||!g.path||g.path.commands.length===0)return null;
  const aw=gc.advanceWidth||upm;
  const zones=p.zones;
  const zH=(yTop-yBot)/zones;

  // Off-screen canvas: width=advanceWidth px (1px per font unit scaled to aw), height=zones px
  // Scale: canvasH=zones rows, canvasW=aw cols (we use integer aw, capped for perf)
  const CW=Math.min(Math.round(aw),400);
  const CH=zones;
  const scX=CW/aw;
  const scY=CH/(yTop-yBot);
  const baseY=CH+(yBot*scY);  // y=0 in font coords → row baseY in canvas (flipped)
  const fontSize=CH/((yTop-yBot)/upm);  // font size so that em = CH in canvas height

  const cvs=document.createElement('canvas');
  cvs.width=CW; cvs.height=CH;
  const ctx=cvs.getContext('2d');
  ctx.fillStyle='#000';ctx.fillRect(0,0,CW,CH);  // black bg
  const path=g.getPath(0,baseY,fontSize*scX);
  ctx.fillStyle='#fff';
  ctx.fill(new Path2D(path.toPathData(2)));

  const imgData=ctx.getImageData(0,0,CW,CH).data;
  let totalPrint=0, totalCounter=0;

  // pxToFU: convert pixel area back to font-unit² equivalent
  // 1 pixel = (aw/CW) × zH font units
  const pxArea=(aw/CW)*zH;

  for(let row=0;row<CH;row++){
    let firstInk=-1, lastInk=-1, inkCount=0;
    for(let col=0;col<CW;col++){
      const idx=(row*CW+col)*4;
      const isInk=imgData[idx]>128;  // white = ink on black bg
      if(isInk){
        if(firstInk===-1)firstInk=col;
        lastInk=col;
        inkCount++;
      }
    }
    if(firstInk===-1)continue;  // empty row
    const bodySpan=lastInk-firstInk+1;
    const voidPx=bodySpan-inkCount;  // pixels inside body span that are NOT ink
    totalPrint+=inkCount*pxArea;
    totalCounter+=voidPx*pxArea;
  }
  return{print:totalPrint,counter:totalCounter};
}

// Measure inner counter area (white space between ink spans per scan line)
// Works for open counters like 'n' and closed counters like 'O', 'o'.
// Returns counter_area / upm², or null if the glyph isn't available.
function measureGlyphCounter(glyphName){
  const upm=IS_GLYPHS?currentUPM:fontObj?.unitsPerEm;
  if(!upm)return null;
  const SC=4; // px per font unit
  const yT=yTopGlobal||upm*0.8, yB=yBotGlobal||-(upm*0.2);
  const bY=4+Math.ceil(yT*SC);
  const H=bY+Math.ceil(Math.abs(yB)*SC)+4;
  let AW=upm;
  const off=document.createElement('canvas');
  const octx=off.getContext('2d');
  octx.fillStyle='#000';
  if(IS_GLYPHS){
    const gd=glyphsByName?.[glyphName];
    if(!gd||!gd.commands||!gd.commands.length)return null;
    AW=gd.advanceWidth||upm;
    off.width=Math.max(1,Math.ceil(AW*SC));off.height=H;
    const p2d=commandsToPath2D(gd.commands,0,bY,SC);
    if(p2d)octx.fill(p2d);
  } else {
    if(!fontObj)return null;
    const g=fontObj.charToGlyph(glyphName);
    if(!g||!g.path||!g.path.commands.length||!g.advanceWidth)return null;
    AW=g.advanceWidth;
    off.width=Math.max(1,Math.ceil(AW*SC));off.height=H;
    octx.fill(new Path2D(g.getPath(0,bY,SC*upm).toPathData(2)));
  }
  const W=off.width;
  const px=octx.getImageData(0,0,W,H).data;
  let innerPx=0,minRow=H,maxRow=0;
  for(let row=0;row<H;row++){
    const base=row*W*4;
    let first=-1,last=-1;
    for(let x=0;x<W;x++){if(px[base+x*4+3]>127){if(first<0)first=x;last=x;}}
    if(first<0||last<=first+1)continue;
    if(row<minRow)minRow=row;
    if(row>maxRow)maxRow=row;
    for(let x=first+1;x<last;x++)if(px[base+x*4+3]<=127)innerPx++;
  }
  const counter=Math.round(innerPx/(SC*SC));
  const height=maxRow>=minRow?(maxRow-minRow+1)/SC:0;
  return{counter,height};
}

function updateCounterStats(){
  const upm=IS_GLYPHS?currentUPM:fontObj?.unitsPerEm;
  [
    ['n','s-cnt-n','s-cnt-n-r',false],
    ['O','s-cnt-O','s-cnt-O-r',true],
    ['o','s-cnt-o','s-cnt-o-r',false],
  ].forEach(([g,idArea,idRatio,isUC])=>{
    const elA=document.getElementById(idArea);
    const elR=document.getElementById(idRatio);
    const res=measureGlyphCounter(g);
    if(!res){if(elA)elA.textContent='—';if(elR)elR.textContent='—';return;}
    const{counter,height}=res;
    if(elA)elA.textContent=counter.toLocaleString();
    const baseMargin=isUC?baseValueUC:baseValueLC;
    if(elR){
      const marginRun=baseMargin*height;
      elR.textContent=(marginRun>0)?r1(counter/marginRun):'—';
    }
  });
}

// ── Kerning-pair helpers (uses KERNING_PAIRS from fuchs.js) ─────────────────
// Returns the set of all char-labels that appear as left or right in KERNING_PAIRS.
// Always includes the reference glyphs so baselines can always be computed.
function buildAllowedChars(baseLcChar, baseUcChar){
  const s=new Set([baseLcChar,baseUcChar]);
  for(const pair of KERNING_PAIRS){const c=[...pair];if(c.length>=2){s.add(c[0]);s.add(c[1]);}}
  return s;
}

// Walk KERNING_PAIRS in frequency order and return [{kA,kB}] up to limit (0=all).
function buildPairQueue(labelToKey, limit){
  const q=[],seen=new Set(),lim=limit>0?limit:Infinity;
  for(const pair of KERNING_PAIRS){
    if(q.length>=lim)break;
    const c=[...pair];if(c.length<2)continue;
    const kA=labelToKey[c[0]],kB=labelToKey[c[1]];
    if(!kA||!kB)continue;
    const id=kA+'|'+kB;if(seen.has(id))continue;
    seen.add(id);q.push({kA,kB});
  }
  return q;
}

// For each computed glyph add two pairs with space:
//   glyph + space  → pairMean(glyph.right, base.left)
//   space + glyph  → pairMean(base.right,  glyph.left)
// Base margin is used to simulate a "normal" adjacent character.
// Only added to kerningData if the rounded correction is outside the threshold.
function addSpacePairs(gks, gc, p, bvLC, bvUC){
  const baseLcGC=gc[p.baselc],baseUcGC=gc[p.baseuc];
  for(const k of gks){
    const g=gc[k];
    const isUC=g.cls==='UC';
    const baseGC=isUC?baseUcGC:baseLcGC;
    const baseVal=isUC?bvUC:bvLC;
    if(!baseGC)continue;
    const tag=isUC?'UC':'LC';
    const cL=g.charLabel;
    // glyph + space
    const rC=pairMean(g.right,baseGC.left);
    if(rC){
      const corr=rtm(baseVal-rC.mean,p.round);
      if(Math.abs(corr)>p.threshold)
        kerningData.push({left:cL,right:'space',correction:corr,mean:r1(rC.mean),base:r1(baseVal),tag,capped:false,zones:rC.zoneValues.map(v=>`z${v.z}:${v.sum}`).join(','),zonesArr:rC.zoneValues});
    }
    // space + glyph
    const lC=pairMean(baseGC.right,g.left);
    if(lC){
      const corr=rtm(baseVal-lC.mean,p.round);
      if(Math.abs(corr)>p.threshold)
        kerningData.push({left:'space',right:cL,correction:corr,mean:r1(lC.mean),base:r1(baseVal),tag,capped:false,zones:lC.zoneValues.map(v=>`z${v.z}:${v.sum}`).join(','),zonesArr:lC.zoneValues});
    }
  }
}

if(typeof module!=='undefined')module.exports={measureCounterPrint,measureGlyphCounter,updateCounterStats,buildAllowedChars,buildPairQueue,addSpacePairs};
