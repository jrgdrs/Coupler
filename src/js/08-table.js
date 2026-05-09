// ── TABLE ─────────────────────────────────────────────
function sortBy(col){if(sortCol===col)sortAsc=!sortAsc;else{sortCol=col;sortAsc=col!=='correction';}sortAndRender();}
function sortAndRender(){
  filteredData.sort((a,b)=>{let va=a[sortCol],vb=b[sortCol];if(typeof va==='string'){va=va.toLowerCase();vb=vb.toLowerCase();}return sortAsc?(va>vb?1:-1):(va<vb?1:-1);});
  renderTable();
}

function filterTable(){
  const q=document.getElementById('search-box').value;
  document.getElementById('rx-err').textContent='';
  if(!q){filteredData=kerningData.slice();sortAndRender();return;}

  if(useRegex){
    let rx;
    try{rx=new RegExp(q);}  // no 'i' flag — case sensitive
    catch(e){document.getElementById('rx-err').textContent='⚠ '+e.message.slice(0,28);filteredData=[];renderTable();return;}
    filteredData=kerningData.filter(d=>rx.test(d.left)||rx.test(d.right));
  } else {
    // Plain mode: exact, case-sensitive glyph name match
    // One term  → left===q OR right===q
    // Two terms → left===parts[0] AND right===parts[1]
    const parts=q.split(/\s+/).filter(Boolean);
    if(parts.length===1){
      const t=parts[0];
      filteredData=kerningData.filter(d=>d.left===t||d.right===t||String(d.correction)===t);
    } else if(parts.length>=2){
      filteredData=kerningData.filter(d=>d.left===parts[0]&&d.right===parts[1]);
    } else {
      filteredData=kerningData.slice();
    }
  }
  sortAndRender();
}

function toggleRegex(){
  useRegex=!useRegex;
  document.getElementById('rx-btn').className='filter-mode'+(useRegex?' on':'');
  filterTable();
}

function renderTable(){
  const tbody=document.getElementById('results-tbody');
  const MAX=600,rows=filteredData.slice(0,MAX);
  if(rows.length===0){
    document.getElementById('results-table').style.display='none';
    document.getElementById('empty-state').style.display='flex';
    document.querySelector('#empty-state div:last-child').textContent=kerningData.length?'No pairs match the filter':'Drop a font to get started';
    return;
  }
  document.getElementById('results-table').style.display='table';
  document.getElementById('empty-state').style.display='none';
  tbody.innerHTML='';
  for(let ri=0;ri<rows.length;ri++){
    const d=rows[ri];
    const tr=document.createElement('tr');
    const cc=d.correction<0?'vneg':d.correction>0?'vpos':'vzero';
    const tc=d.tag==='UC'?'tuc':d.tag==='mixed'?'tmix':'tlc';
    const cap=d.capped?'<span class="tcap">⚑</span>':'';
    const tip=d.zonesArr?d.zonesArr.map(v=>`z${v.z}: rA=${v.rA}  lB=${v.lB}  gap=${v.sum}`).join('\n'):'';
    if(ri===selectedPairIdx)tr.className='selected';
    tr.style.cursor='pointer';
    tr.dataset.idx=ri;
    tr.onclick=()=>selectPairRow(ri);
    tr.innerHTML=`<td class="cc">${esc(d.left)}</td><td class="cc">${esc(d.right)}</td><td class="${cc}" style="font-weight:700">${d.correction}${cap}</td><td>${d.mean}</td><td>${d.base}</td><td class="${tc}">${d.tag}</td><td style="color:var(--text3);font-size:10px;cursor:help" title="${tip}">${d.zones}</td>`;
    tbody.appendChild(tr);
  }
  if(filteredData.length>MAX){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td colspan="7" style="color:var(--text3);text-align:center;padding:9px">… ${(filteredData.length-MAX).toLocaleString()} more rows — refine filter</td>`;
    tbody.appendChild(tr);
  }
}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── TAB SWITCHING ─────────────────────────────────────
let currentTab='kern';
function switchTab(tab){
  currentTab=tab;
  ['kern','spacing','cadence'].forEach(t=>{
    document.getElementById('tab-'+t).className='tab-btn'+(tab===t?' active':'');
  });
  document.getElementById('kern-panel').style.display=tab==='kern'?'flex':'none';
  document.getElementById('spacing-panel').style.display=tab==='spacing'?'flex':'none';
  document.getElementById('cadence-panel').style.display=tab==='cadence'?'flex':'none';
  document.getElementById('kern-filter-group').style.display=tab==='kern'?'flex':'none';
  document.getElementById('spacing-filter-group').style.display=tab==='spacing'?'flex':'none';
  document.getElementById('cadence-filter-group').style.display=tab==='cadence'?'flex':'none';
  if(tab==='spacing')renderSpacingTable();
  if(tab==='cadence'){cadEnsureInit();renderCadence();}
}

// ── PAIR PREVIEW TOGGLE BUTTON ─────────────────────────
function togglePairPreview(){
  if(pairPreviewMode){
    pairPreviewMode=false;selectedPairIdx=-1;
    document.getElementById('pair-preview-btn').className='tbtn';
    renderTable();renderPreview();
  } else {
    // activate with first pair if available
    if(filteredData.length>0)selectPairRow(0);
    document.getElementById('pair-preview-btn').className='tbtn on';
  }
}

function selectPairRow(idx){
  selectedPairIdx=idx;
  pairPreviewMode=true;
  document.getElementById('pair-preview-btn').className='tbtn on';
  renderTable();
  renderPreview();
  // Scroll selected row into view
  const sel=document.querySelector('#results-tbody tr.selected');
  if(sel)sel.scrollIntoView({block:'nearest'});
}

// Keyboard navigation for table pair selection and text preset cycling
document.addEventListener('keydown',e=>{
  const tag=document.activeElement.tagName;
  // Don't hijack when typing in input/select
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;

  if(e.key==='ArrowDown'&&pairPreviewMode){
    e.preventDefault();
    if(selectedPairIdx<filteredData.length-1)selectPairRow(selectedPairIdx+1);
  } else if(e.key==='ArrowUp'&&pairPreviewMode){
    e.preventDefault();
    if(selectedPairIdx>0)selectPairRow(selectedPairIdx-1);
  } else if(e.key==='Escape'){
    pairPreviewMode=false;
    selectedPairIdx=-1;
    document.getElementById('pair-preview-btn').className='tbtn';
    renderTable();
    renderPreview();
  } else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
    // Cycle through text presets
    const sel=document.getElementById('preset-select');
    const opts=Array.from(sel.options).filter(o=>o.value&&!o.disabled);
    if(opts.length===0)return;
    const cur=opts.findIndex(o=>o.value===document.getElementById('preview-text').value)||0;
    let next=e.key==='ArrowRight'?cur+1:cur-1;
    next=Math.max(0,Math.min(opts.length-1,next));
    if(opts[next]){e.preventDefault();sel.value=opts[next].value;applyPreset(opts[next].value);}
  }
});

if(typeof module!=='undefined')module.exports={sortBy,sortAndRender,filterTable,toggleRegex,renderTable,esc,switchTab,togglePairPreview,selectPairRow};
