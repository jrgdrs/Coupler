// ── SPACING CORRECTIONS TABLE ──────────────────────────
/**
 * For each glyph, find its self-pair correction (A+A, n+n, etc.)
 * Then compute suggested spacing adjustments:
 *   - ΔAdvanceWidth: half the self-kern correction (split symmetrically)
 *   - ΔSidebearing: quarter of the self-kern (shift glyph inside bounds)
 *   Net effect: if applied, the self-pair kern approaches zero.
 */
function avgMargin(arr){
  let sum=0,cnt=0;
  for(const v of arr)if(v!==null){sum+=v;cnt++;}
  return cnt>0?sum/cnt:null;
}
// Average only zones 0..maxZ (inclusive) — used for height-limited spacing
// Average zones minZ..maxZ only — zones outside the base glyph height are excluded
function avgMarginZones(arr,minZ,maxZ){
  let sum=0,cnt=0;
  const lo=Math.max(0,minZ),hi=Math.min(arr.length-1,maxZ);
  for(let z=lo;z<=hi;z++)if(arr[z]!==null){sum+=arr[z];cnt++;}
  return cnt>0?sum/cnt:null;
}
// Highest zone with non-null ink (top of ink)
function topZoneOf(gc){
  for(let z=gc.left.length-1;z>=0;z--)if(gc.left[z]!==null||gc.right[z]!==null)return z;
  return gc.left.length-1;
}
// Lowest zone with non-null ink (bottom of ink)
function botZoneOf(gc){
  for(let z=0;z<gc.left.length;z++)if(gc.left[z]!==null||gc.right[z]!==null)return z;
  return 0;
}

function showSpacingContent(show){
  const empty=document.getElementById('spacing-empty');
  const content=document.getElementById('spacing-content');
  if(show){empty.style.display='none';content.style.display='flex';}
  else{empty.style.display='flex';content.style.display='none';}
}

function renderSpacingTable(){
  const gks=Object.keys(glyphCache);
  if(!gks.length){showSpacingContent(false);return;}
  const p=P();
  const baseLcGC=glyphCache[p.baselc],baseUcGC=glyphCache[p.baseuc];
  const trk=p.tracking/2; // tracking split equally across left and right margin targets
  const lcBotZ=baseLcGC?botZoneOf(baseLcGC):null, lcTopZ=baseLcGC?topZoneOf(baseLcGC):null;
  const ucBotZ=baseUcGC?botZoneOf(baseUcGC):null, ucTopZ=baseUcGC?topZoneOf(baseUcGC):null;
  const baseLcL=baseLcGC&&lcBotZ!==null?avgMarginZones(baseLcGC.left,lcBotZ,lcTopZ)+trk:null;
  const baseLcR=baseLcGC&&lcBotZ!==null?avgMarginZones(baseLcGC.right,lcBotZ,lcTopZ)+trk:null;
  const baseUcL=baseUcGC&&ucBotZ!==null?avgMarginZones(baseUcGC.left,ucBotZ,ucTopZ)+trk:null;
  const baseUcR=baseUcGC&&ucBotZ!==null?avgMarginZones(baseUcGC.right,ucBotZ,ucTopZ)+trk:null;

  const rows=[];
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
    const oldAW=gc.advanceWidth;
    const newAW=rtm(oldAW+dL+dR,p.round);
    const dAW=newAW-oldAW;
    const newL=r1(gL+dL);
    const newR=r1(gR+dR);
    rows.push({gk,gc,oldAW,newAW,dAW,dL,dR,newL,newR});
  }

  if(!rows.length){
    showSpacingContent(false);
    document.getElementById('spacing-empty').querySelector('div:last-child').textContent='No glyphs with margins found';
    return;
  }

  rows.sort((a,b)=>a.newAW-b.newAW||(a.gc.charLabel<b.gc.charLabel?-1:1));

  // Histogram grouped by newAW — horizontal rows with glyphs inside bars
  const byAW=new Map();
  for(const r of rows){if(!byAW.has(r.newAW))byAW.set(r.newAW,[]);byAW.get(r.newAW).push(r);}
  const sortedAW=[...byAW.entries()].sort((a,b)=>a[0]-b[0]);
  const maxCount=Math.max(...sortedAW.map(([,a])=>a.length));
  const histEl=document.getElementById('spacing-histogram');
  let histHtml='<div style="display:flex;flex-direction:column;gap:2px;padding:8px 0">';
  for(const[aw,items] of sortedAW){
    const pct=Math.max(6,Math.round(items.length/maxCount*100));
    const chars=items.map(r=>r.gc.charLabel).join(' ');
    const tooltip=items.map(r=>r.gc.charLabel).join(' ');
    histHtml+=`<div title="${esc(tooltip)}" style="display:flex;align-items:center;gap:6px">`;
    histHtml+=`<span style="font-size:10px;color:var(--text2);width:44px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums">${aw}</span>`;
    histHtml+=`<div style="flex:1;min-width:0;background:rgba(255,255,255,.07);border-radius:3px;height:24px;position:relative">`;
    histHtml+=`<div style="position:absolute;left:0;top:0;height:100%;width:${pct}%;background:var(--accent);opacity:.8;border-radius:3px;display:flex;align-items:center;padding:0 7px;overflow:hidden;white-space:nowrap;font-size:14px;letter-spacing:.05em;color:#fff;line-height:1">${esc(chars)}</div>`;
    histHtml+=`</div>`;
    histHtml+=`<span style="font-size:10px;color:var(--text2);flex-shrink:0;width:22px;text-align:left">${items.length}</span>`;
    histHtml+=`</div>`;
  }
  histHtml+='</div>';
  histEl.innerHTML=histHtml;

  const tbody=document.getElementById('spacing-tbody');
  tbody.innerHTML='';
  const fmt=v=>v===0?'0':(v>0?'+'+v:String(v));
  for(const r of rows){
    const tr=document.createElement('tr');
    const cls=r.gc.cls==='UC'?'tuc':'tlc';
    tr.innerHTML=`<td class="cc">${esc(r.gc.charLabel)}</td><td class="${cls}">${r.gc.cls}</td><td>${r.oldAW}</td><td style="font-weight:700">${r.newAW}</td><td class="${r.dAW<0?'vneg':r.dAW>0?'vpos':'vzero'}">${fmt(r.dAW)}</td><td class="${r.dL<0?'vneg':r.dL>0?'vpos':'vzero'}">${fmt(r.dL)}</td><td class="${r.dR<0?'vneg':r.dR>0?'vpos':'vzero'}">${fmt(r.dR)}</td><td>${r.newL}</td><td>${r.newR}</td>`;
    tbody.appendChild(tr);
  }
  showSpacingContent(true);
}

if(typeof module!=='undefined')module.exports={avgMargin,avgMarginZones,topZoneOf,botZoneOf,showSpacingContent,renderSpacingTable};
