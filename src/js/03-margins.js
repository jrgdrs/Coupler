// ── SMOOTHING ─────────────────────────────────────────
function r1(v){return Math.round(v*10)/10;}
function smoothMargins(arr,zH,pct){
  if(pct<=0)return arr.slice();
  const mD=pct*zH,n=arr.length,out=arr.slice();
  let aZ=-1,aV=Infinity;
  for(let z=0;z<n;z++)if(arr[z]!==null&&arr[z]<aV){aV=arr[z];aZ=z;}
  if(aZ===-1)return out;
  let prev=aZ;
  for(let z=aZ-1;z>=0;z--){if(out[z]===null)continue;const mA=r1(out[prev]+mD);if(out[z]>mA)out[z]=mA;if(out[z]<aV)out[z]=r1(aV);prev=z;}
  prev=aZ;
  for(let z=aZ+1;z<n;z++){if(out[z]===null)continue;const mA=r1(out[prev]+mD);if(out[z]>mA)out[z]=mA;if(out[z]<aV)out[z]=r1(aV);prev=z;}
  return out;
}

// ── GLYPH MARGINS ─────────────────────────────────────
function computeGlyphMargins(glyph,upm,p,yBot,yTop){
  const aw=glyph.advanceWidth??0;
  const zH=(yTop-yBot)/p.zones;
  const subs=p.zones*p.blur;
  const path=glyph.getPath(0,0,upm);
  // Geometric margins (outline only, no glow) — authoritative for min-gap checks
  const geomSubR=pathXZones(path,subs,yBot,yTop);
  const lGeom=[],rGeom=[];
  for(let z=0;z<p.zones;z++){
    const s0=z*p.blur;let sL=0,sR=0,cnt=0;
    for(let s=0;s<p.blur;s++){const sub=geomSubR[s0+s];if(!sub)continue;sL+=sub.xMin;sR+=aw-sub.xMax;cnt++;}
    if(cnt===0){lGeom.push(null);rGeom.push(null);}else{lGeom.push(r1(sL/cnt));rGeom.push(r1(sR/cnt));}
  }
  // Kerning margins: glow-spread when glow is on, else reuse geometric
  let lR,rR;
  if(p.glow){
    const glowSubR=glowZones(glyph,aw,p,yBot,yTop,false,upm);
    lR=[];rR=[];
    for(let z=0;z<p.zones;z++){
      const s0=z*p.blur;let sL=0,sR=0,cnt=0;
      for(let s=0;s<p.blur;s++){const sub=glowSubR[s0+s];if(!sub)continue;sL+=sub.xMin;sR+=aw-sub.xMax;cnt++;}
      if(cnt===0){lR.push(null);rR.push(null);}else{lR.push(r1(sL/cnt));rR.push(r1(sR/cnt));}
    }
  }else{lR=lGeom;rR=rGeom;}
  const leftSm=smoothMargins(lR,zH,p.smooth);
  const rightSm=smoothMargins(rR,zH,p.smooth);
  let unicode=null;
  if(glyph.unicodes?.length>0)unicode=glyph.unicodes[0];
  return{left:leftSm,right:rightSm,leftRaw:lR,rightRaw:rR,leftGeom:lGeom,rightGeom:rGeom,advanceWidth:aw,unicode};
}

// ── CLASSIFICATION ────────────────────────────────────
function classifyGlyph(unicode,name){
  if(unicode===null)return /^[A-Z]/.test(name)?'UC':'LC';
  if(unicode>=48&&unicode<=57)return'UC';
  if(unicode>=65&&unicode<=90)return'UC';
  if((unicode>=192&&unicode<=214)||(unicode>=216&&unicode<=222))return'UC';
  if(unicode>=256&&unicode<=382&&unicode%2===0)return'UC';
  if(unicode>=0x0391&&unicode<=0x03A9)return'UC';
  if(unicode>=0x0410&&unicode<=0x042F)return'UC';
  return'LC';
}

// ── PAIR MEAN ─────────────────────────────────────────
function pairMean(rA,lB){
  const zv=[];let sum=0;
  for(let z=0;z<rA.length;z++){const a=rA[z],b=lB[z];if(a===null||b===null)continue;const s=a+b;sum+=s;zv.push({z,rA:a,lB:b,sum:r1(s)});}
  if(zv.length===0)return null;
  return{mean:sum/zv.length,validCount:zv.length,zoneValues:zv};
}
function rtm(v,mod){if(mod<=1)return Math.round(v);return Math.round(v/mod)*mod;}

// ── CHAR LABEL ────────────────────────────────────────
// charLabel: use the actual unicode character so it matches KERNING_PAIRS entries directly.
// Glyph-name fallback only when unicode is unavailable (unnamed/private-use glyphs).
function cLbl(unicode,gn,gk){
  if(unicode!==null){try{return String.fromCodePoint(unicode);}catch(_){}}
  if(gn&&!/^glyph\d+$/i.test(gn))return gn;
  return gk;
}

if(typeof module!=='undefined')module.exports={r1,smoothMargins,computeGlyphMargins,classifyGlyph,pairMean,rtm,cLbl};
