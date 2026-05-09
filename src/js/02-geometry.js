// ── BEZIER / GEOMETRY ─────────────────────────────────
function cubicXY(p0,p1,p2,p3,t){
  const mt=1-t,mt2=mt*mt,t2=t*t;
  return{x:mt2*mt*p0.x+3*mt2*t*p1.x+3*mt*t2*p2.x+t2*t*p3.x,
         y:mt2*mt*p0.y+3*mt2*t*p1.y+3*mt*t2*p2.y+t2*t*p3.y};
}
function quadXY(p0,p1,p2,t){
  const mt=1-t;
  return{x:mt*mt*p0.x+2*mt*t*p1.x+t*t*p2.x,y:mt*mt*p0.y+2*mt*t*p1.y+t*t*p2.y};
}
function bisectCurve(yFn,xFn,yt,t0,t1,res){
  const y0=yFn(t0),y1=yFn(t1);
  if((y0-yt)*(y1-yt)>0&&(t1-t0)<.05)return;
  if(t1-t0<.05){res.push(Math.abs(y0-yt)<Math.abs(y1-yt)?xFn(t0):xFn(t1));return;}
  const m=(t0+t1)/2;
  bisectCurve(yFn,xFn,yt,t0,m,res);
  bisectCurve(yFn,xFn,yt,m,t1,res);
}
function segXRng(xyFn,yLo,yHi){
  let xMn=Infinity,xMx=-Infinity;
  for(let i=0;i<=512;i++){const t=i/512,p=xyFn(t);if(p.y>=yLo&&p.y<=yHi){if(p.x<xMn)xMn=p.x;if(p.x>xMx)xMx=p.x;}}
  for(const yB of[yLo,yHi]){const xs=[];bisectCurve(t=>xyFn(t).y,t=>xyFn(t).x,yB,0,1,xs);for(const x of xs){if(x<xMn)xMn=x;if(x>xMx)xMx=x;}}
  return isFinite(xMn)?{xMin:xMn,xMax:xMx}:null;
}
// ── GRAYSCALE ZONE COMPUTATION ────────────────────────
// Returns same format as pathXZones — array of {xMin,xMax}|null with length p.zones*p.blur.
// Rasterizes the glyph at 1px/FU, averages alpha per sub-zone column, applies box blur,
// then detects boundaries at a very low threshold so greyBlur radius pushes margins outward.
function glowZones(glyphOrCmds, aw, p, yBot, yTop, isGlyphs, upm) {
  const SC = 1; // 1 pixel per font unit
  const glowBlur = Math.max(0, Math.round(p.glowblur || 0));
  const subs = p.zones * p.blur;
  const zH = (yTop - yBot) / subs;

  const topPx = Math.max(1, Math.ceil(yTop * SC));
  const H = topPx + Math.max(0, Math.ceil(-yBot * SC));
  const W = Math.max(1, Math.ceil(aw * SC));

  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const octx = off.getContext('2d');
  octx.fillStyle = '#000';

  if (isGlyphs) {
    const p2d = commandsToPath2D(glyphOrCmds, 0, topPx, SC);
    if (p2d) octx.fill(p2d);
  } else {
    const pd = glyphOrCmds.getPath(0, topPx, SC * upm).toPathData(4);
    if (pd) octx.fill(new Path2D(pd));
  }

  const raw = octx.getImageData(0, 0, W, H).data;
  // Compact alpha channel for cache-friendly row scans
  const alpha = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = raw[i * 4 + 3];

  const result = [];
  const opBuf = new Float64Array(W);
  const preBuf = new Float64Array(W + 1);

  for (let z = 0; z < subs; z++) {
    const yLo = yBot + z * zH;
    const yHi = yLo + zH;
    // Font y → canvas row: row = topPx - font_y * SC
    const rowLo = Math.max(0, Math.floor(topPx - yHi * SC));
    const rowHi = Math.min(H - 1, Math.ceil(topPx - yLo * SC));
    const rowCnt = rowHi - rowLo + 1;

    opBuf.fill(0);
    for (let row = rowLo; row <= rowHi; row++) {
      const base = row * W;
      for (let x = 0; x < W; x++) opBuf[x] += alpha[base + x];
    }
    const norm = rowCnt * 255;
    for (let x = 0; x < W; x++) opBuf[x] /= norm;

    // Horizontal box blur via prefix sum (O(N), clamp at edges)
    if (glowBlur > 0) {
      preBuf[0] = 0;
      for (let x = 0; x < W; x++) preBuf[x + 1] = preBuf[x] + opBuf[x];
      for (let x = 0; x < W; x++) {
        const lo = Math.max(0, x - glowBlur);
        const hi = Math.min(W - 1, x + glowBlur);
        opBuf[x] = (preBuf[hi + 1] - preBuf[lo]) / (hi - lo + 1);
      }
    }

    // Any visible ink (after blur) — low threshold so greyBlur expands the boundary
    const thresh = 0.002;
    let xMin = Infinity, xMax = -Infinity;
    for (let x = 0; x < W; x++) { if (opBuf[x] >= thresh) { xMin = x / SC; break; } }
    for (let x = W - 1; x >= 0; x--) { if (opBuf[x] >= thresh) { xMax = x / SC; break; } }

    result.push(isFinite(xMin) ? { xMin, xMax } : null);
  }
  return result;
}

function pathXZones(path,zones,yBot,yTop){
  const zH=(yTop-yBot)/zones;
  const mn=new Float64Array(zones).fill(Infinity),mx=new Float64Array(zones).fill(-Infinity);
  let cx=0,cy=0,sx=0,sy=0;
  function pSeg(xyFn){
    let syMn=Infinity,syMx=-Infinity;
    for(let i=0;i<=32;i++){const y=-xyFn(i/32).y;if(y<syMn)syMn=y;if(y>syMx)syMx=y;}
    const zS=Math.max(0,Math.floor((syMn-yBot)/zH));
    const zE=Math.min(zones-1,Math.ceil((syMx-yBot)/zH));
    const fn=t=>{const p=xyFn(t);return{x:p.x,y:-p.y};};
    for(let z=zS;z<=zE;z++){const lo=yBot+z*zH,hi=lo+zH;const r=segXRng(fn,lo,hi);if(r){if(r.xMin<mn[z])mn[z]=r.xMin;if(r.xMax>mx[z])mx[z]=r.xMax;}}
  }
  for(const cmd of path.commands){
    switch(cmd.type){
      case'M':cx=cmd.x;cy=cmd.y;sx=cx;sy=cy;break;
      case'L':{const x0=cx,y0=cy,x1=cmd.x,y1=cmd.y;pSeg(t=>({x:x0+t*(x1-x0),y:y0+t*(y1-y0)}));cx=cmd.x;cy=cmd.y;break;}
      case'Q':{const p0={x:cx,y:cy},p1={x:cmd.x1,y:cmd.y1},p2={x:cmd.x,y:cmd.y};pSeg(t=>quadXY(p0,p1,p2,t));cx=cmd.x;cy=cmd.y;break;}
      case'C':{const p0={x:cx,y:cy},p1={x:cmd.x1,y:cmd.y1},p2={x:cmd.x2,y:cmd.y2},p3={x:cmd.x,y:cmd.y};pSeg(t=>cubicXY(p0,p1,p2,p3,t));cx=cmd.x;cy=cmd.y;break;}
      case'Z':if(cx!==sx||cy!==sy){const x0=cx,y0=cy,x1=sx,y1=sy;pSeg(t=>({x:x0+t*(x1-x0),y:y0+t*(y1-y0)}));}cx=sx;cy=sy;break;
    }
  }
  return Array.from({length:zones},(_,z)=>isFinite(mn[z])?{xMin:mn[z],xMax:mx[z]}:null);
}

if(typeof module!=='undefined')module.exports={cubicXY,quadXY,bisectCurve,segXRng,pathXZones,glowZones};
