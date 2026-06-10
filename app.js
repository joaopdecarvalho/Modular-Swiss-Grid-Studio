const PT = 72/25.4;
const PAPERS = { A6:[105,148], A5:[148,210], A4:[210,297], A3:[297,420], DL:[99,210], Letter:[215.9,279.4] };
const r1 = x => Math.round(x*10)/10;
const r2 = x => Math.round(x*100)/100;
const fmt = x => { const v = r2(x); return Number.isInteger(v)? String(v) : String(v); };
const __initHash = (typeof location!=='undefined' && location.hash) ? location.hash : '';

const state = {
  paper:'A5', orientation:'portrait', customW:148, customH:210,
  baseline:15, rows:4, cols:3, gutterLines:1, colGutterVal:1, colGutterUnit:'lines', square:true,
  topMarginMM:10.6, leftMarginMM:5.2, rightMarginMM:5.2, linkLR:true, facing:false,
  bleedMM:0, safeMM:0, mode:'traditional', marginUnit:'mm',
  show:{ base:true, mod:true, bleed:true }
};
const typeState = { baseSize:10, ratioSel:'1.2', ratioCustom:1.2, up:5, down:1, minLH:1, font:'Archivo', fontCustom:'', weight:'500' };
const FONT_FALLBACK = { 'Fraunces':'serif', 'Newsreader':'serif', 'Spline Sans Mono':'monospace' };
const loadedFonts = new Set(['Archivo','Spline Sans Mono']);
function ensureFont(name){
  if(!name || name==='system' || loadedFonts.has(name)) return;
  loadedFonts.add(name);
  const known = FONT_FALLBACK.hasOwnProperty(name) || ['DM Sans','Hanken Grotesk','Space Grotesk','Inter Tight','IBM Plex Sans','Work Sans','Libre Franklin'].includes(name);
  const fam = encodeURIComponent(name).replace(/%20/g,'+');
  const axis = known ? ':wght@400;500;700' : '';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fam}${axis}&display=swap`;
  document.head.appendChild(link);
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(()=>{ if(!document.getElementById('view-type').hidden) renderType(); }); }
}
function currentFontStack(){
  const sel = typeState.font;
  if(sel==='system') return 'system-ui, -apple-system, sans-serif';
  const name = (sel==='custom' ? (typeState.fontCustom.trim()||'Archivo') : sel).replace(/["']/g,'');
  return `'${name}', ${FONT_FALLBACK[name]||'sans-serif'}`;
}

function colGutterPtOf(s){
  if(s.colGutterUnit==='mm') return Math.max(0, s.colGutterVal)*PT;
  if(s.colGutterUnit==='pt') return Math.max(0, s.colGutterVal);
  return Math.max(0, s.colGutterVal)*s.baseline; // lines
}
function pageDims(s){
  let w,h;
  if(s.paper==='Custom'){ w=s.customW; h=s.customH; } else { [w,h]=PAPERS[s.paper]; }
  if(s.orientation==='landscape'){ [w,h]=[h,w]; }
  return { wmm:w, hmm:h, wpt:w*PT, hpt:h*PT };
}

function computeGrid(s){
  const p = pageDims(s);
  const b = s.baseline;
  const g = Math.max(0, Math.round(s.gutterLines));
  const gutterPt = g*b;
  const colGutterPt = colGutterPtOf(s);
  const cg = b>0 ? colGutterPt/b : 0;
  const rows = Math.max(1, Math.round(s.rows));
  const cols = Math.max(1, Math.round(s.cols));
  const comfort = s.mode==='comfortable';
  const minBottomPt = (comfort?14 : b/PT)*PT;
  const minSidePt   = (comfort?12 : b/PT)*PT;
  const topPt = s.topMarginMM*PT;
  const availH = p.hpt - topPt - minBottomPt;
  const maxLines = Math.floor(availH / b + 1e-6);
  let N=-1, moduleLines=0;
  for(let n=maxLines; n>=1; n--){
    const num = n-(rows-1)*g;
    if(num>=rows && num%rows===0){ N=n; moduleLines=num/rows; break; }
  }
  const vWarn = N<0 ? `${rows} rows ${g>0?`(plus ${g}-line gutters) `:''}don’t fit between a ${r1(s.topMarginMM)} mm top margin and the page bottom. Reduce rows, gutter or top margin.` : null;
  const liveHpt = N>0 ? N*b : 0;
  const bottomPt = N>0 ? (p.hpt - topPt - liveHpt) : 0;
  const moduleHpt = moduleLines*b;

  let leftPt, rightPt, colWpt, hWarn=null;
  const square = s.square && N>0;
  if(square){
    colWpt = moduleHpt;
    const blockW = cols*colWpt + (cols-1)*colGutterPt;
    if(s.linkLR){ leftPt = (p.wpt - blockW)/2; rightPt = leftPt; }
    else { leftPt = s.leftMarginMM*PT; rightPt = p.wpt - blockW - leftPt; }
    if(leftPt < 0 || rightPt < 0){
      hWarn = `${cols} square columns are wider than the page fits with these margins. Reduce columns, shrink the gutter, or turn off “square modules”.`;
    } else if(Math.min(leftPt,rightPt) < minSidePt){
      hWarn = `Side margin is ${r1(Math.min(leftPt,rightPt)/PT)} mm — fine for screen, tight for print. Use fewer columns or Comfortable mode for more room.`;
    }
  } else {
    leftPt = s.leftMarginMM*PT;
    rightPt = s.linkLR ? leftPt : s.rightMarginMM*PT;
    const liveWpt = p.wpt - leftPt - rightPt;
    colWpt = (liveWpt - (cols-1)*colGutterPt)/cols;
    if(colWpt<=0) hWarn = `Those margins leave no room for ${cols} columns.`;
  }

  return { p, b, g, cg, gutterPt, colGutterPt, rows, cols, N, moduleLines, moduleHpt, liveHpt,
    topPt, bottomPt, leftPt, rightPt, sidePt:leftPt, colWpt,
    liveWpt: p.wpt - leftPt - rightPt,
    aspect: moduleHpt? colWpt/moduleHpt : 0, vWarn, hWarn,
    facing: s.facing,
    bleedPt: s.bleedMM*PT, safePt: s.safeMM*PT };
}

function svgEl(name, attrs){
  const e = document.createElementNS('http://www.w3.org/2000/svg', name);
  for(const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function renderPreview(G){
  const s = state;
  const off = G.bleedPt;
  const totalW = G.p.wpt + 2*off;
  const totalH = G.p.hpt + 2*off;
  const C = { field:'#fffefb', ink:'#19180f',
              line:'rgba(25,24,15,.30)', lineStrong:'rgba(25,24,15,.5)',
              modFill:'rgba(214,57,43,.10)', modLine:'rgba(214,57,43,.6)',
              bleedFill:'rgba(214,57,43,.07)' };
  const box = document.querySelector('.previewbox');
  const availW = Math.max(220, (box ? box.clientWidth : 660) - 40);
  const maxH = Math.min(Math.round((window.innerHeight||800)*0.58), 560);
  const scale = Math.min(availW/totalW, maxH/totalH);
  const dispW = Math.round(totalW*scale);
  const dispH = Math.round(totalH*scale);
  const svg = svgEl('svg', { class:'preview', xmlns:'http://www.w3.org/2000/svg', viewBox:`0 0 ${totalW} ${totalH}`,
    width:dispW, height:dispH, role:'img', 'aria-label':'Grid preview' });

  if(G.bleedPt>0 && s.show.bleed){
    svg.appendChild(svgEl('rect',{x:0,y:0,width:totalW,height:totalH,
      fill:C.bleedFill, stroke:C.modLine,'stroke-width':1,'stroke-dasharray':'4 3','vector-effect':'non-scaling-stroke'}));
  }
  svg.appendChild(svgEl('rect',{x:off,y:off,width:G.p.wpt,height:G.p.hpt,
    fill:C.field, stroke:C.ink,'stroke-width':1.4,'vector-effect':'non-scaling-stroke'}));
  if(G.safePt>0 && s.show.bleed){
    svg.appendChild(svgEl('rect',{x:off+G.safePt,y:off+G.safePt,
      width:G.p.wpt-2*G.safePt,height:G.p.hpt-2*G.safePt,
      fill:'none', stroke:C.modLine,'stroke-width':1,'stroke-dasharray':'2 3','vector-effect':'non-scaling-stroke'}));
  }

  if(G.N>0){
    const liveL = off + G.leftPt;
    const liveT = off + G.topPt;
    const liveW = G.liveWpt;
    const liveH = G.liveHpt;
    if(s.show.base){
      const period = G.moduleLines + G.g;
      for(let k=0;k<=G.N;k++){
        const y = liveT + k*G.b;
        const r = k % period;
        const major = (r===0 || r===G.moduleLines);
        svg.appendChild(svgEl('line',{x1:liveL,y1:y,x2:liveL+liveW,y2:y,
          stroke:major?C.lineStrong:C.line,'stroke-width':major?0.9:0.5,
          'vector-effect':'non-scaling-stroke'}));
      }
    }
    if(s.show.mod){
      for(let rr=0;rr<G.rows;rr++){
        const y = liveT + rr*(G.moduleHpt+G.gutterPt);
        for(let cc=0;cc<G.cols;cc++){
          const x = liveL + cc*(G.colWpt+G.colGutterPt);
          svg.appendChild(svgEl('rect',{x,y,width:G.colWpt,height:G.moduleHpt,
            fill:C.modFill, stroke:C.modLine,'stroke-width':1,'vector-effect':'non-scaling-stroke'}));
        }
      }
    }
    svg.appendChild(svgEl('rect',{x:liveL,y:liveT,width:liveW,height:liveH,
      fill:'none', stroke:C.ink,'stroke-width':0.8,opacity:.45,'vector-effect':'non-scaling-stroke'}));
  }
  if(G.facing){
    svg.appendChild(svgEl('line',{x1:off,y1:off,x2:off,y2:off+G.p.hpt,
      stroke:C.ink,'stroke-width':3,opacity:.5,'vector-effect':'non-scaling-stroke'}));
  }
  const host = document.getElementById('svghost');
  host.innerHTML=''; host.appendChild(svg);
}

function renderStatus(G){
  const el = document.getElementById('status');
  let html='';
  if(G.vWarn){ html += `<div class="status warn">⚠ <span>${G.vWarn}</span></div>`; }
  if(G.hWarn){ html += `<div class="status warn">⚠ <span>${G.hWarn}</span></div>`; }
  if(!G.vWarn && !G.hWarn && G.N>0){
    const sq = Math.abs(G.aspect-1)<0.02;
    html += `<div class="status ok">✓ <span><b>Valid grid.</b> ${G.rows}×${G.cols} = ${G.rows*G.cols} fields, each ${G.moduleLines} baseline lines tall${sq?', perfectly square':` (${r1(G.aspect)}:1)`}. Every edge lands on the ${fmt(G.b)} pt baseline.</span></div>`;
  }
  el.innerHTML = html;
}

function renderSpec(G){
  const t = document.getElementById('spec');
  if(G.N<=0){ t.innerHTML = '<tr><td colspan="2" style="color:var(--warn)">No valid grid — adjust the controls above.</td></tr>'; return; }
  const mm = pt => `${r1(pt/PT)} <span class="pt">mm · ${fmt(pt)} pt</span>`;
  const sq = Math.abs(G.aspect-1)<0.02;
  const lname = G.facing?'Inner':'Left', rname = G.facing?'Outer':'Right';
  const cpl = G.colWpt>0 ? Math.round(G.colWpt/(0.5*typeState.baseSize)) : 0;
  const cplTag = cpl<40?'short' : cpl>78?'long' : 'good';
  const rows = [
    ['Page', `${fmt(G.p.wmm)} × ${fmt(G.p.hmm)} mm`, false],
    ['Baseline', `${fmt(G.b)} pt`, false],
    ['Top margin', mm(G.topPt), false],
    ['Bottom margin', mm(G.bottomPt), false],
    [lname+' margin', mm(G.leftPt), false],
    [rname+' margin', mm(G.rightPt), false],
    ['Live area (W × H)', `${r1(G.liveWpt/PT)} × ${r1(G.liveHpt/PT)} mm`, true],
    ['Body lines', `${G.N} lines`, false],
    ['Rows × module', `${G.rows} × ${G.moduleLines} lines`, false],
    ['Module height', mm(G.moduleHpt), false],
    ['Columns × width', `${G.cols} × ${r1(G.colWpt/PT)} mm`, false],
    ['Module shape', sq?'square':`${r1(G.aspect)} : 1`, false],
    ['Row gutter', `${G.g} line · ${mm(G.gutterPt)}`, false],
    ['Column gutter', `${state.colGutterUnit==='lines' ? `${fmt(G.cg)} line · ${mm(G.colGutterPt)}` : mm(G.colGutterPt)}`, false],
    ['Measure / column', `~${cpl} char <span class="pt">${cplTag} · at ${fmt(typeState.baseSize)} pt</span>`, true],
  ];
  if(G.bleedPt>0) rows.push(['Bleed', `${r1(G.bleedPt/PT)} mm / edge`, false]);
  if(G.safePt>0) rows.push(['Safe inset', `${r1(G.safePt/PT)} mm`, false]);
  t.innerHTML = rows.map(([a,b,maj])=>`<tr class="${maj?'major':''}"><td>${a}</td><td>${b}</td></tr>`).join('');
}

function renderSteps(G){
  const steps = document.getElementById('steps');
  const foot = document.getElementById('foot');
  if(G.N<=0){ steps.innerHTML='<li>Fix the warnings above to generate Affinity steps.</li>'; foot.textContent=''; return; }
  const ptv = pt => `${fmt(pt)} pt`;
  const mmv = pt => `${r1(pt/PT)} mm`;
  const bleedTxt = G.bleedPt>0 ? ` Set <b>Bleed</b> to <span class="v">${r1(G.bleedPt/PT)} mm</span> on all four edges.` : '';
  const facingTxt = G.facing ? ` Turn on <b>Facing pages</b> (spread) so margins mirror across the spine.` : '';
  const lname = G.facing?'inner':'left', rname = G.facing?'outer':'right';
  const items = [
    [`New document`, `File ▸ New`,
      `Choose a <b>Print</b> preset with units in <b>Millimetres</b>. Width <span class="v">${fmt(G.p.wmm)} mm</span>, height <span class="v">${fmt(G.p.hmm)} mm</span>, <span class="v">300 DPI</span>.${bleedTxt}${facingTxt}`],
    [`Set the margins`, `Document Setup ▸ Margins`,
      `Top <span class="v">${mmv(G.topPt)}</span>, bottom <span class="v">${mmv(G.bottomPt)}</span>, ${lname} <span class="v">${mmv(G.leftPt)}</span>, ${rname} <span class="v">${mmv(G.rightPt)}</span>.`],
    [`Baseline grid`, `View ▸ Baseline Grid Manager`,
      `Switch the field units to <b>Points</b>. Spacing <span class="v">${ptv(G.b)}</span>, start position <span class="v">${ptv(G.topPt)}</span> (= your top margin). Enable it, set body leading to <span class="v">${ptv(G.b)}</span>. The start is measured to the first <i>baseline</i>, so the cap of line one sits a little above it — enabling “Align to baseline grid” on your text handles that automatically.`],
    [`Columns &amp; rows`, `View ▸ Guides Manager`,
      `With field units in <b>Points</b>: columns <span class="v">${G.cols}</span>, column gutter <span class="v">${ptv(G.colGutterPt)}</span>; rows <span class="v">${G.rows}</span>, row gutter <span class="v">${ptv(G.gutterPt)}</span>.`],
    [`Snap &amp; reuse`, `View ▸ Snapping`,
      `Turn on snapping (to guides + baseline). Build this on a <b>master page</b> so every page inherits the grid${G.facing?' — Affinity mirrors the inner/outer margins on left and right pages':''}.`],
  ];
  steps.innerHTML = items.map(([t,w,d])=>`<li><span class="where">${w}</span><b>${t}.</b> ${d}</li>`).join('');
  const sq = Math.abs(G.aspect-1)<0.02;
  foot.innerHTML = `Because every value is a multiple of the ${fmt(G.b)} pt baseline, all ${G.rows*G.cols} fields ${sq?'are exact squares and ':''}land cleanly on the grid — no leftover fractions. Switching row or column counts later keeps that alignment as long as the live area stays the same.`;
}

function plainSteps(G){
  if(G.N<=0) return 'No valid grid.';
  const mmv = pt => `${r1(pt/PT)} mm`;
  const ptv = pt => `${fmt(pt)} pt`;
  const lname = G.facing?'inner':'left', rname = G.facing?'outer':'right';
  let out = `MODULAR GRID — Affinity setup\n`;
  out += `Page: ${fmt(G.p.wmm)} x ${fmt(G.p.hmm)} mm, 300 DPI`+(G.bleedPt>0?`, bleed ${r1(G.bleedPt/PT)} mm`:``)+(G.facing?`, facing pages`:``)+`\n\n`;
  out += `1. New document (Print, mm): ${fmt(G.p.wmm)} x ${fmt(G.p.hmm)} mm`+(G.bleedPt>0?`, bleed ${r1(G.bleedPt/PT)} mm all edges`:``)+`.\n`;
  out += `2. Margins: top ${mmv(G.topPt)}, bottom ${mmv(G.bottomPt)}, ${lname} ${mmv(G.leftPt)}, ${rname} ${mmv(G.rightPt)}.\n`;
  out += `3. Baseline Grid (units=pt): spacing ${ptv(G.b)}, start ${ptv(G.topPt)}. Body leading ${ptv(G.b)}.\n`;
  out += `4. Guides Manager (units=pt): columns ${G.cols} gutter ${ptv(G.colGutterPt)}; rows ${G.rows} gutter ${ptv(G.gutterPt)}.\n`;
  out += `5. Enable snapping; set on a master page.\n\n`;
  out += `Result: ${G.rows}x${G.cols} fields, each ${G.moduleLines} lines tall, module ${r1(G.colWpt/PT)} x ${r1(G.moduleHpt/PT)} mm.`;
  return out;
}

function render(){
  const G = computeGrid(state);
  renderPreview(G);
  renderStatus(G);
  renderSpec(G);
  renderSteps(G);
  updateMarginFields(G);
  window.__lastG = G;
  persist();
}
function updateMarginFields(G){
  const link=state.linkLR, sq=state.square && G.N>0;
  const leftm=document.getElementById('leftm'), rightm=document.getElementById('rightm');
  const leftDis = sq && link, rightDis = link || sq;
  leftm.disabled=leftDis; rightm.disabled=rightDis;
  if(leftDis || leftm!==document.activeElement) leftm.value = leftDis ? mDisp(G.leftPt/PT) : mDisp(state.leftMarginMM);
  if(rightDis || rightm!==document.activeElement) rightm.value = rightDis ? mDisp(G.rightPt/PT) : mDisp(state.rightMarginMM);
}

/* ---- wiring ---- */
function applyModeDefaults(){
  if(state.mode==='comfortable'){
    state.topMarginMM = 15; state.leftMarginMM = 15; state.rightMarginMM = 15;
    state.bleedMM = 3; state.safeMM = 3; state.square = false; state.linkLR = true;
  } else {
    state.topMarginMM = r1(2*state.baseline/PT);
    state.leftMarginMM = r1(state.baseline/PT);
    state.rightMarginMM = r1(state.baseline/PT);
    state.bleedMM = 0; state.safeMM = 0; state.square = true; state.linkLR = true;
  }
  syncInputs();
}
function syncInputs(){
  document.getElementById('paper').value = state.paper;
  document.getElementById('baseline').value = state.baseline;
  document.getElementById('rows').value = state.rows;
  document.getElementById('cols').value = state.cols;
  document.getElementById('gutter').value = state.gutterLines;
  document.getElementById('cgutter').value = state.colGutterVal;
  document.getElementById('cgUnit').value = state.colGutterUnit;
  document.getElementById('cgUnitLbl').textContent = state.colGutterUnit==='lines' ? 'in baseline lines' : state.colGutterUnit;
  document.getElementById('square').checked = state.square;
  document.getElementById('linkLR').checked = state.linkLR;
  document.getElementById('facing').checked = state.facing;
  document.getElementById('topm').value = mDisp(state.topMarginMM);
  document.getElementById('leftm').value = mDisp(state.leftMarginMM);
  document.getElementById('rightm').value = mDisp(state.rightMarginMM);
  document.getElementById('bleed').value = state.bleedMM;
  document.getElementById('safe').value = state.safeMM;
  document.getElementById('customRow').hidden = state.paper!=='Custom';
  document.querySelectorAll('#orient button').forEach(b=>b.classList.toggle('on', b.dataset.o===state.orientation));
  document.querySelectorAll('#modeswitch button').forEach(b=>b.classList.toggle('on', b.dataset.mode===state.mode));
  document.querySelectorAll('#munit button').forEach(b=>b.classList.toggle('on', b.dataset.u===state.marginUnit));
  updateUnitLabels();
}

document.getElementById('paper').addEventListener('change',e=>{state.paper=e.target.value; document.getElementById('customRow').hidden=state.paper!=='Custom'; render();});
document.getElementById('cw').addEventListener('input',e=>{state.customW=+e.target.value||10; render();});
document.getElementById('ch').addEventListener('input',e=>{state.customH=+e.target.value||10; render();});
document.getElementById('baseline').addEventListener('input',e=>{state.baseline=+e.target.value||15; document.getElementById('tbaseline').value=state.baseline; render(); renderType();});
document.getElementById('rows').addEventListener('input',e=>{state.rows=Math.max(1,+e.target.value||1); render();});
document.getElementById('cols').addEventListener('input',e=>{state.cols=Math.max(1,+e.target.value||1); render();});
document.getElementById('gutter').addEventListener('input',e=>{state.gutterLines=Math.max(0,+e.target.value||0); render();});
document.getElementById('cgutter').addEventListener('input',e=>{state.colGutterVal=Math.max(0,+e.target.value||0); render();});
document.getElementById('cgUnit').addEventListener('change',e=>{
  const curPt = colGutterPtOf(state);
  const u = e.target.value;
  state.colGutterUnit = u;
  state.colGutterVal = u==='lines' ? r1(curPt/state.baseline) : u==='mm' ? r1(curPt/PT) : r2(curPt);
  document.getElementById('cgutter').value = state.colGutterVal;
  document.getElementById('cgUnitLbl').textContent = u==='lines' ? 'in baseline lines' : u;
  render();
});
document.getElementById('topm').addEventListener('input',e=>{state.topMarginMM=Math.max(0,mParse(+e.target.value||0)); render();});
document.getElementById('leftm').addEventListener('input',e=>{state.leftMarginMM=Math.max(0,mParse(+e.target.value||0)); if(state.linkLR) state.rightMarginMM=state.leftMarginMM; render();});
document.getElementById('rightm').addEventListener('input',e=>{state.rightMarginMM=Math.max(0,mParse(+e.target.value||0)); render();});
document.getElementById('bleed').addEventListener('input',e=>{state.bleedMM=Math.max(0,+e.target.value||0); render();});
document.getElementById('safe').addEventListener('input',e=>{state.safeMM=Math.max(0,+e.target.value||0); render();});
document.getElementById('linkLR').addEventListener('change',e=>{state.linkLR=e.target.checked; if(state.linkLR) state.rightMarginMM=state.leftMarginMM; render();});
document.getElementById('facing').addEventListener('change',e=>{state.facing=e.target.checked; updateUnitLabels(); render();});
document.getElementById('square').addEventListener('change',e=>{
  if(!e.target.checked && window.__lastG && window.__lastG.N>0){
    state.leftMarginMM = Math.max(0, r1(window.__lastG.leftPt/PT));
    state.rightMarginMM = Math.max(0, r1(window.__lastG.rightPt/PT));
  }
  state.square=e.target.checked;
  render();
});

document.querySelectorAll('[data-step]').forEach(btn=>btn.addEventListener('click',()=>{
  const k=btn.dataset.step, d=+btn.dataset.d;
  state[k]=Math.min(16,Math.max(1,state[k]+d));
  document.getElementById(k).value=state[k]; render();
}));
document.querySelectorAll('#orient button').forEach(b=>b.addEventListener('click',()=>{
  state.orientation=b.dataset.o; syncInputs(); render();
}));
document.querySelectorAll('#modeswitch button').forEach(b=>b.addEventListener('click',()=>{
  state.mode=b.dataset.mode; applyModeDefaults(); render();
}));
document.getElementById('reset').addEventListener('click',()=>{applyModeDefaults(); render();});

/* ---- presets (after Müller-Brockmann's 8 / 20 / 32 field grids, plus a flyer) ---- */
const PRESETS = {
  f8:   { paper:'A4', orientation:'portrait', baseline:12, rows:4, cols:2, gutterLines:1, colGutterVal:1, colGutterUnit:'lines', square:false, linkLR:true, facing:false, topMarginMM:14, leftMarginMM:18, rightMarginMM:18, bleedMM:0, safeMM:0, mode:'traditional', _t:{ baseSize:9 } },
  f20:  { paper:'A4', orientation:'portrait', baseline:11, rows:5, cols:4, gutterLines:1, colGutterVal:1, colGutterUnit:'lines', square:false, linkLR:true, facing:false, topMarginMM:13, leftMarginMM:16, rightMarginMM:16, bleedMM:0, safeMM:0, mode:'traditional', _t:{ baseSize:8.5 } },
  f32:  { paper:'A4', orientation:'portrait', baseline:10, rows:8, cols:4, gutterLines:1, colGutterVal:1, colGutterUnit:'lines', square:false, linkLR:true, facing:false, topMarginMM:10, leftMarginMM:15, rightMarginMM:15, bleedMM:0, safeMM:0, mode:'traditional', _t:{ baseSize:8 } },
  flyer:{ paper:'A5', orientation:'portrait', baseline:15, rows:4, cols:3, gutterLines:1, colGutterVal:1, colGutterUnit:'lines', square:true,  linkLR:true, facing:false, topMarginMM:10.6, leftMarginMM:5.2, rightMarginMM:5.2, bleedMM:3, safeMM:3, mode:'traditional', _t:{ baseSize:10 } },
  // A5 booklet page — 2-column text grid, facing pages with a wider inner (spine) margin so the measure clears the gutter
  a5book:  { paper:'A5', orientation:'portrait',  baseline:12, rows:6, cols:2, gutterLines:1, colGutterVal:1, colGutterUnit:'lines', square:false, linkLR:false, facing:true,  topMarginMM:13, leftMarginMM:16, rightMarginMM:11, bleedMM:0, safeMM:0, mode:'traditional', _t:{ baseSize:9 } },
  // A5 landscape card — 4×3 photo-led grid with print bleed and safe margins
  a5card:  { paper:'A5', orientation:'landscape', baseline:12, rows:3, cols:4, gutterLines:1, colGutterVal:1, colGutterUnit:'lines', square:false, linkLR:true,  facing:false, topMarginMM:8,  leftMarginMM:8,  rightMarginMM:8,  bleedMM:3, safeMM:3, mode:'traditional', _t:{ baseSize:9 } },
  // A5 poster — single wide column over a large baseline for headline-led type
  a5poster:{ paper:'A5', orientation:'portrait',  baseline:18, rows:3, cols:1, gutterLines:1, colGutterVal:1, colGutterUnit:'lines', square:false, linkLR:true,  facing:false, topMarginMM:16, leftMarginMM:12, rightMarginMM:12, bleedMM:3, safeMM:3, mode:'traditional', _t:{ baseSize:12 } },
  // A3 grid poster — 4×6 structured field grid for event / information posters
  a3grid: { paper:'A3', orientation:'portrait', baseline:16, rows:6, cols:4, gutterLines:1, colGutterVal:1, colGutterUnit:'lines', square:false, linkLR:true, facing:false, topMarginMM:20, leftMarginMM:20, rightMarginMM:20, bleedMM:3, safeMM:5, mode:'traditional', _t:{ baseSize:11 } },
  // A3 type poster — 2 wide columns over a large baseline for headline-led type
  a3type: { paper:'A3', orientation:'portrait', baseline:24, rows:4, cols:2, gutterLines:1, colGutterVal:1, colGutterUnit:'lines', square:false, linkLR:true, facing:false, topMarginMM:24, leftMarginMM:22, rightMarginMM:22, bleedMM:3, safeMM:5, mode:'traditional', _t:{ baseSize:14 } },
  // A3 image poster — 5×7 square-module grid for photo / exhibition posters
  a3photo:{ paper:'A3', orientation:'portrait', baseline:14, rows:7, cols:5, gutterLines:1, colGutterVal:1, colGutterUnit:'lines', square:true,  linkLR:true, facing:false, topMarginMM:16, leftMarginMM:16, rightMarginMM:16, bleedMM:3, safeMM:5, mode:'traditional', _t:{ baseSize:10 } },
};
function applyPreset(key){
  const p = PRESETS[key]; if(!p) return;
  const { _t, ...g } = p;
  Object.assign(state, g);
  if(_t) Object.assign(typeState, _t);
  syncInputs(); syncTypeInputs(); render(); renderType();
}
document.getElementById('preset').addEventListener('change',e=>{ if(e.target.value){ applyPreset(e.target.value); e.target.value=''; } });

/* ---- proportional margins (the book treats margins as deliberate proportions) ---- */
const PROPORTIONS = {
  equal:   { t:1, b:1, l:1, r:1, facing:false },
  classic: { t:2, b:3, l:1, r:1, facing:false },
  golden:  { t:1, b:1.618, l:1, r:1, facing:false },
  spread:  { t:2, b:3, l:2, r:3, facing:true },
};
function applyProportion(key){
  const P = PROPORTIONS[key]; const G = window.__lastG; if(!P || !G) return;
  // horizontal: redistribute the current total side white by the ratio
  const hBudget = Math.max(2*PT, G.leftPt + G.rightPt);
  state.square = false;
  state.facing = P.facing;
  state.linkLR = (P.l === P.r);
  state.leftMarginMM  = (hBudget * P.l/(P.l+P.r))/PT;
  state.rightMarginMM = (hBudget * P.r/(P.l+P.r))/PT;
  // vertical: find the top margin whose whole-line fit lands closest to the target top:bottom
  const vBudget = Math.max(2*PT, G.topPt + G.bottomPt);
  const target = P.b/P.t;
  const baseTop = (vBudget * P.t/(P.t+P.b))/PT;
  let best=null;
  for(let tmm = Math.max(2, baseTop-8); tmm <= baseTop+8; tmm += 0.5){
    const g = computeGrid({...state, topMarginMM:tmm});
    if(g.N<=0 || g.topPt<=0) continue;
    const err = Math.abs((g.bottomPt/g.topPt) - target);
    if(!best || err < best.err) best = { tmm, err };
  }
  state.topMarginMM = best ? best.tmm : baseTop;
  syncInputs(); render();
}
document.getElementById('applyProp').addEventListener('click',()=>{
  applyProportion(document.getElementById('propScheme').value);
});

document.getElementById('lyBase').addEventListener('change',e=>{state.show.base=e.target.checked; render();});
document.getElementById('lyMod').addEventListener('change',e=>{state.show.mod=e.target.checked; render();});
document.getElementById('lyBleed').addEventListener('change',e=>{state.show.bleed=e.target.checked; render();});

document.querySelectorAll('#tabs button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('#view-grid .tabpane').forEach(p=>p.hidden = p.dataset.pane!==b.dataset.tab);
}));
document.getElementById('copy').addEventListener('click',()=>{
  const txt = plainSteps(window.__lastG);
  navigator.clipboard?.writeText(txt).then(()=>{
    const btn=document.getElementById('copy'); const old=btn.textContent;
    btn.textContent='Copied ✓'; setTimeout(()=>btn.textContent=old,1400);
  }).catch(()=>{});
});

/* ---- margin units ---- */
function mDisp(mm){ return state.marginUnit==='pt' ? r2(mm*PT) : r1(mm); }
function mParse(v){ return state.marginUnit==='pt' ? (v/PT) : v; }
function updateUnitLabels(){
  const u=state.marginUnit;
  const t=document.getElementById('topUnit'); if(t) t.textContent=`baseline start (${u})`;
  const lu=document.getElementById('leftUnit'); if(lu) lu.textContent=u;
  const ru=document.getElementById('rightUnit'); if(ru) ru.textContent=u;
  const ll=document.getElementById('leftLbl'); if(ll) ll.textContent = state.facing?'Inner':'Left';
  const rl=document.getElementById('rightLbl'); if(rl) rl.textContent = state.facing?'Outer':'Right';
}
document.querySelectorAll('#munit button').forEach(b=>b.addEventListener('click',()=>{
  state.marginUnit=b.dataset.u;
  document.querySelectorAll('#munit button').forEach(x=>x.classList.toggle('on',x.dataset.u===state.marginUnit));
  updateUnitLabels();
  document.getElementById('topm').value=mDisp(state.topMarginMM);
  document.getElementById('leftm').value=mDisp(state.leftMarginMM);
  document.getElementById('rightm').value=mDisp(state.rightMarginMM);
  render();
}));

/* ---- type scale ---- */
function currentRatio(){ return typeState.ratioSel==='custom' ? (typeState.ratioCustom||1.25) : parseFloat(typeState.ratioSel); }
function roleName(i){
  if(i===0) return 'Body';
  if(i<0) return ['Caption','Footnote','Fine print','Micro'][-i-1] || 'Micro';
  return 'H'+(typeState.up - i + 1);
}
function computeScale(){
  const b0=typeState.baseSize, r=currentRatio(), B=state.baseline, minLH=typeState.minLH;
  const rows=[];
  for(let i=typeState.up;i>=-typeState.down;i--){
    const size=Math.round(b0*Math.pow(r,i)*2)/2;
    let lines=Math.ceil((size*minLH)/B - 1e-9); if(lines<1) lines=1;
    rows.push({ i, role:roleName(i), size, lead:lines*B, lines });
  }
  return rows;
}
const SPECIMEN_TEXT = 'Sixty zippers were quickly picked from the woven jute bag';
function renderTypePreview(rows){
  const host = document.getElementById('scaleprev');
  const fontStack = currentFontStack();
  const weight = typeState.weight;
  const html = rows.map(r => {
    const isBody = r.i === 0;
    const ptLabel = `${fmt(r.size)} / ${fmt(r.lead)} pt`;
    // truncate specimen to fit at very large sizes
    const words = SPECIMEN_TEXT.split(' ');
    const maxWords = Math.max(3, Math.round(18 - r.size * 0.6));
    const txt = r.size > 24 ? words.slice(0, maxWords).join(' ') : SPECIMEN_TEXT;
    return `<div class="specrow${isBody?' is-body':''}">
      <div class="speclabel">
        <span class="role">${r.role}</span>
        <span class="val">${ptLabel}</span>
      </div>
      <div class="spectext" style="font-family:${fontStack};font-size:${r.size}px;font-weight:${weight};line-height:${r.lead}px;color:${isBody?'#19180f':'#2a2920'}">${txt}</div>
    </div>`;
  }).join('');
  host.innerHTML = html;
}
function renderType(){
  const B=state.baseline, rows=computeScale();
  renderTypePreview(rows);
  const body=rows.find(r=>r.i===0);
  const heads=rows.filter(r=>r.i>0).length, caps=rows.filter(r=>r.i<0).length;
  let st;
  if(body.lines>1){
    st=`<div class="status warn">⚠ <span>Body text needs ${body.lines} baseline lines, so it no longer sits one line per row. Use a larger baseline or a smaller body size for a tight rhythm — leadings still land on the grid.</span></div>`;
  } else {
    st=`<div class="status ok">✓ <span><b>On the grid.</b> Body leading ${fmt(body.lead)} pt = 1 baseline line; ${heads} heading ${heads===1?'size':'sizes'}, ${caps} below body. Every leading is a whole multiple of the ${fmt(B)} pt baseline.</span></div>`;
  }
  document.getElementById('tstatus').innerHTML=st;
  const t=document.getElementById('tspec');
  let html=`<tr class="major"><td>Role</td><td class="num">Size</td><td class="num">Leading</td><td class="num">Lines</td></tr>`;
  html+=rows.map(r=>`<tr class="${r.i===0?'major':''}"><td>${r.role} <span class="pt">step ${r.i>=0?'+':''}${r.i}</span></td><td class="num">${fmt(r.size)}<span class="u"> pt</span></td><td class="num">${fmt(r.lead)}<span class="u"> pt</span></td><td class="num">${r.lines}</td></tr>`).join('');
  t.innerHTML=html;
  document.getElementById('tsteps').innerHTML=[
    [`Open Text Styles`,`Window ▸ Text Styles`,`Work in <b>paragraph styles</b> so size and leading travel together and stay editable later.`],
    [`One style per role`,`Text Styles ▸ New Paragraph Style`,`Make a style for each row in the table. Set <b>Font size</b> and a fixed <b>Leading Override</b> in points — not “Auto” or a percentage — so it locks to the grid. Body = <span class="v">${fmt(body.size)} / ${fmt(body.lead)} pt</span>.`],
    [`Snap to the grid`,`Paragraph ▸ Spacing`,`In each style enable <b>Align to baseline grid</b>. With the baseline grid you built on the Grid tab, every line then lands on a row.`],
    [`Body anchors it`,``,`Keep body leading equal to the baseline (<span class="v">${fmt(B)} pt</span>): body runs one line per row, and a heading of <i>n</i> lines occupies <i>n</i> rows, lining up with module edges.`],
  ].map(([t,w,d])=>`<li>${w?`<span class="where">${w}</span>`:''}<b>${t}.</b> ${d}</li>`).join('');
  document.getElementById('tfoot').innerHTML=`Sizes step by a ${currentRatio()}× ratio from a ${fmt(typeState.baseSize)} pt base; each leading is rounded up to the nearest whole baseline, so the type and the grid share one rhythm.`;
  window.__lastRows=rows;
  persist();
}
function plainStyles(){
  const rows=window.__lastRows||computeScale(), B=state.baseline;
  let out=`TYPE SCALE — Affinity paragraph styles (baseline ${fmt(B)} pt)\n\n`;
  rows.forEach(r=>{ out+=`${r.role.padEnd(11)} size ${fmt(r.size)} pt / leading ${fmt(r.lead)} pt (${r.lines} ${r.lines===1?'line':'lines'})\n`; });
  out+=`\nFor each style: set Leading Override to the exact pt value and enable “Align to baseline grid”.`;
  return out;
}
document.getElementById('tbase').addEventListener('input',e=>{typeState.baseSize=Math.max(1,+e.target.value||10); renderType();});
document.getElementById('tratio').addEventListener('change',e=>{typeState.ratioSel=e.target.value; document.getElementById('tratioCustomRow').hidden=e.target.value!=='custom'; renderType();});
document.getElementById('tratioCustom').addEventListener('input',e=>{typeState.ratioCustom=Math.max(1.01,+e.target.value||1.25); renderType();});
document.getElementById('tup').addEventListener('input',e=>{typeState.up=Math.max(0,Math.min(9,Math.round(+e.target.value||0))); renderType();});
document.getElementById('tdown').addEventListener('input',e=>{typeState.down=Math.max(0,Math.min(4,Math.round(+e.target.value||0))); renderType();});
document.getElementById('tminlh').addEventListener('input',e=>{typeState.minLH=Math.max(1,+e.target.value||1); renderType();});
document.getElementById('tfont').addEventListener('change',e=>{
  typeState.font=e.target.value;
  document.getElementById('tfontCustomRow').hidden = e.target.value!=='custom';
  if(e.target.value!=='custom' && e.target.value!=='system') ensureFont(e.target.value);
  renderType();
});
document.getElementById('tfontCustom').addEventListener('input',e=>{
  typeState.fontCustom=e.target.value;
  if(e.target.value.trim()) ensureFont(e.target.value.trim());
  renderType();
});
document.getElementById('tweight').addEventListener('change',e=>{typeState.weight=e.target.value; renderType();});
document.getElementById('tbaseline').addEventListener('input',e=>{state.baseline=+e.target.value||15; document.getElementById('baseline').value=state.baseline; render(); renderType();});
document.querySelectorAll('#ttabs button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('#ttabs button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('#view-type .tabpane').forEach(p=>p.hidden=p.dataset.tpane!==b.dataset.ttab);
}));
document.getElementById('tcopy').addEventListener('click',()=>{
  navigator.clipboard?.writeText(plainStyles()).then(()=>{
    const btn=document.getElementById('tcopy'),old=btn.textContent; btn.textContent='Copied ✓'; setTimeout(()=>btn.textContent=old,1400);
  }).catch(()=>{});
});

/* ---- primary nav ---- */
document.querySelectorAll('#topnav button').forEach(b=>b.addEventListener('click',()=>{
  const v=b.dataset.view;
  document.querySelectorAll('#topnav button').forEach(x=>x.classList.toggle('on',x===b));
  document.getElementById('view-grid').hidden = v!=='grid';
  document.getElementById('view-type').hidden = v!=='type';
  document.getElementById('modeswitch').style.visibility = v==='grid'?'visible':'hidden';
  if(v==='grid') render(); else renderType();
}));

/* ---- type input sync ---- */
function syncTypeInputs(){
  document.getElementById('tbase').value = typeState.baseSize;
  document.getElementById('tratio').value = typeState.ratioSel;
  document.getElementById('tratioCustom').value = typeState.ratioCustom;
  document.getElementById('tratioCustomRow').hidden = typeState.ratioSel!=='custom';
  document.getElementById('tup').value = typeState.up;
  document.getElementById('tdown').value = typeState.down;
  document.getElementById('tminlh').value = typeState.minLH;
  document.getElementById('tbaseline').value = state.baseline;
  document.getElementById('tfont').value = typeState.font;
  document.getElementById('tfontCustom').value = typeState.fontCustom||'';
  document.getElementById('tfontCustomRow').hidden = typeState.font!=='custom';
  document.getElementById('tweight').value = typeState.weight;
  if(typeState.font!=='custom' && typeState.font!=='system') ensureFont(typeState.font);
  if(typeState.font==='custom' && typeState.fontCustom) ensureFont(typeState.fontCustom.trim());
}

/* ---- persistence & share ---- */
function snapshot(){
  const {show, ...sRest} = state;
  return { v:1, s:sRest, t:{...typeState} };
}
function encodeCfg(o){ return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }
function decodeCfg(str){ return JSON.parse(decodeURIComponent(escape(atob(str)))); }
let __restoring=false, __persistT=null, __hashBroken=false;
function writePersist(){
  let code; try{ code=encodeCfg(snapshot()); }catch(e){ return; }
  if(!__hashBroken){
    try{ history.replaceState(null,'','#cfg='+code); }
    catch(e){ __hashBroken=true; }   // some file:// contexts block this — stop retrying, don't spam history
  }
  try{ localStorage.setItem('mbgrid:v1', code); }catch(e){}
  try{ if(window.storage && window.storage.set) window.storage.set('mbgrid:v1', code, false).catch(()=>{}); }catch(e){}
}
function persist(){
  if(__restoring) return;
  clearTimeout(__persistT);
  __persistT=setTimeout(writePersist, 400);
}
function migrateCfg(o){
  if(!o || !o.s) return o;
  const s=o.s;
  if(s.colGutterLines!=null && s.colGutterVal==null){ s.colGutterVal=s.colGutterLines; s.colGutterUnit='lines'; }
  delete s.colGutterLines;
  if(s.sideMarginMM!=null){
    if(s.leftMarginMM==null) s.leftMarginMM=s.sideMarginMM;
    if(s.rightMarginMM==null) s.rightMarginMM=s.sideMarginMM;
    delete s.sideMarginMM;
  }
  if(s.linkLR==null) s.linkLR=true;
  if(s.facing==null) s.facing=false;
  if(s.colGutterVal==null){ s.colGutterVal=1; s.colGutterUnit='lines'; }
  return o;
}
function applySnapshot(o){
  o = migrateCfg(o);
  if(!o || !o.s) return false;
  __restoring=true;
  Object.assign(state, o.s); if(o.t) Object.assign(typeState, o.t);
  syncInputs(); syncTypeInputs();
  __restoring=false;
  render(); renderType();
  return true;
}
function restore(){
  try{
    const m = (__initHash||'').match(/cfg=([^&]+)/);
    if(m){ applySnapshot(decodeCfg(m[1])); return; }
  }catch(e){}
  try{
    const ls = localStorage.getItem('mbgrid:v1');
    if(ls){ applySnapshot(decodeCfg(ls)); return; }
  }catch(e){}
  try{
    if(window.storage && window.storage.get){
      window.storage.get('mbgrid:v1').then(r=>{ if(r && r.value){ try{ applySnapshot(decodeCfg(r.value)); }catch(_){} } }).catch(()=>{});
    }
  }catch(e){}
}

/* ---- export ---- */
function gridSvgNode(){ return document.querySelector('#svghost svg'); }
function downloadBlob(data, type, name){
  const b = new Blob([data], {type}); const u = URL.createObjectURL(b);
  const a = document.createElement('a'); a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(u), 1500);
}
function downloadSVG(){
  const svg = gridSvgNode(); if(!svg) return;
  const s = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
  downloadBlob(s, 'image/svg+xml', 'modular-grid.svg');
}
function downloadPNG(){
  const svg = gridSvgNode(); if(!svg) return;
  const s = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([s], {type:'image/svg+xml'}));
  const img = new Image();
  img.onload = ()=>{
    const scale = 2;
    const w = (svg.width.baseVal && svg.width.baseVal.value) || img.width;
    const h = (svg.height.baseVal && svg.height.baseVal.value) || img.height;
    const c = document.createElement('canvas'); c.width = w*scale; c.height = h*scale;
    const ctx = c.getContext('2d'); ctx.fillStyle='#f2eee4'; ctx.fillRect(0,0,c.width,c.height);
    ctx.scale(scale,scale); ctx.drawImage(img,0,0,w,h); URL.revokeObjectURL(url);
    try{ c.toBlob(b=>{ if(b) downloadBlob(b,'image/png','modular-grid.png'); }); }
    catch(e){ downloadBlob(c.toDataURL('image/png'),'image/png','modular-grid.png'); }
  };
  img.onerror = ()=>URL.revokeObjectURL(url);
  img.src = url;
}
document.getElementById('dlPng').addEventListener('click',downloadPNG);
document.getElementById('dlSvg').addEventListener('click',downloadSVG);
document.getElementById('copyCfg').addEventListener('click',()=>{
  let code; try{ code=encodeCfg(snapshot()); }catch(e){ return; }
  navigator.clipboard?.writeText(code).then(()=>{
    const btn=document.getElementById('copyCfg'),old=btn.textContent; btn.textContent='Copied ✓'; setTimeout(()=>btn.textContent=old,1400);
  }).catch(()=>{});
  const f=document.getElementById('exfoot'); if(f) f.textContent='Setup code copied. Paste it on another device (or after a reset) and press Load to restore everything.';
});
document.getElementById('loadCfg').addEventListener('click',()=>{
  const v=document.getElementById('cfgIn').value.trim(); if(!v) return;
  const f=document.getElementById('exfoot');
  try{ const ok=applySnapshot(decodeCfg(v)); if(f) f.textContent= ok?'Setup loaded.':'That code did not contain a valid setup.'; }
  catch(e){ if(f) f.textContent='That code could not be read. Check it was copied in full.'; }
});
const TIPS = {
  paper: '<b>Paper size.</b> The finished trim size. A6 = small handout, A5 = standard flyer, A4 = full sheet, DL = tall third-of-A4 that fits a #10 envelope. Set this first — every margin and field scales from it. Bigger pages fit more baseline lines and more fields.',
  preset: '<b>Presets.</b> Starting points built on the three grids Müller-Brockmann works through in <i>Grid Systems in Graphic Design</i> — type-and-picture areas of 8, 20 and 32 fields — plus a set of A5 layouts: a square flyer, a 2-column booklet spread, a landscape photo card, and a single-column type poster — and three A3 posters: a structured 4×6 grid, a 2-column big-type layout, and a 5×7 image grid. Loading one fills in every setting; treat it as a base camp and adjust from there. 8 fields suits simple brochures, 20 is a flexible editorial workhorse, 32 handles image-dense catalogues.',
  orient: '<b>Orientation.</b> Portrait is taller than wide; landscape swaps the two. Portrait suits text- and headline-led flyers; landscape suits photo-led or on-screen layouts.',
  custom: '<b>Custom size.</b> Type any trim size in millimetres when your format is not a preset — a 210×210 square, a poster, a ticket. The grid math adapts to whatever you enter.',
  baseline: '<b>Baseline / leading.</b> The master unit of the system. In the book everything is measured in the typographic point system, and the type area is built as an <i>exact whole number of these lines</i> — that is what locks the rhythm. Rule of thumb: leading ≈ 1.2–1.5× the text size (10 pt text → about 13–15 pt). Set it to your real body leading and snap text to it.',
  cols: '<b>Columns.</b> Vertical divisions across the live area; in the book each grid field is exactly one column wide. More columns give more ways to combine them but narrower fields. The book stresses choosing column width for <i>legibility</i> — a line read comfortably at arm’s length, very roughly seven words across — so watch the measure readout in the spec. 12 splits cleanly into 2/3/4/6; flyers usually want fewer, 2–4.',
  rows: '<b>Rows.</b> Horizontal field divisions. The book defines a field’s <i>depth as a set number of text lines</i>, so rows are <b>derived from the baseline</b>, not chosen freely: the tool finds the largest line count that divides evenly into your rows. Fewer rows = bigger, bolder fields (good for flyers); more = finer editorial control. Images are meant to span one to several whole fields.',
  gutter: '<b>Row gutter.</b> The vertical gap between fields. The book sets this as <i>one, two or more whole lines of text</i> — keeping it on the baseline and leaving room for a caption beneath a picture. One line is the tight, traditional default; two opens things up. It also affects how many rows fit, since each gutter spends baseline lines.',
  cgutter: '<b>Column gutter.</b> The horizontal gap between columns. The book treats this differently from the row gutter — it is set by the <i>size of the type and the pictures</i>, not by the baseline — so you can choose lines, mm or pt here. Wide enough that columns and images do not touch and reading stays clear; a common choice is to echo the row gutter, but it is free.',
  square: '<b>Square modules.</b> A modern interpretation, not a rule from the book — there a field is simply “N lines deep × one column wide,” whatever proportion that yields. Turning this on forces width = height for perfectly square fields and derives the side margins (centred when L/R is linked, positioned by the left margin when unlinked). Off, fields can be any rectangle and you set margins freely.',
  topm: '<b>Top margin.</b> Space from the top trim edge to the first baseline — also the baseline grid start position in Affinity. The tool packs in as many whole modules as it can and lets the bottom absorb the remainder. The book treats margins as <i>deliberate proportions</i> rather than equal borders (often a larger foot), so nudge this — or use the Proportion control below — to shape the white space intentionally.',
  prop: '<b>Margin proportion.</b> The book devotes a section to margin proportions: margins should be chosen as a considered ratio, not four equal borders, and a larger bottom (foot) margin is traditional. This redistributes your current margin white into the chosen ratio — Equal, Classic foot (top:bottom 2:3), Golden, or a book-style Spread with a wider outer margin — then finds the closest fit that still keeps every line on the baseline. A starting point to refine by eye.',
  linkLR: '<b>Link L/R margins.</b> On (default), left and right stay equal — a centred, symmetric block. Off, you control them independently for an asymmetric layout: shifting the block toward one edge creates the dynamic, off-centre tension typical of Swiss design. With square modules on, linked = centred and unlinked lets the left margin position the block (right is computed).',
  facing: '<b>Facing pages (spread).</b> Treats the layout as one page of a two-page spread. The left/right margins become <b>inner</b> (spine side) and <b>outer</b> (open edge), and Affinity will mirror them on left and right pages. A wider outer or inner margin is common in booklets; leave off for a single flyer.',
  leftm: '<b>Left / inner margin.</b> Editable when L/R is unlinked (or, with square modules, it positions the block). Wider here pushes content right; combined with a different right margin it produces deliberate asymmetry. Watch the measure readout — very wide margins shorten the line length.',
  rightm: '<b>Right / outer margin.</b> Editable only when L/R is unlinked and square modules is off; otherwise it is computed and shown for reference. Use it with the left margin to place the column block exactly where you want it across the width.',
  bleed: '<b>Bleed.</b> Extra artwork extending past the trim edge, so a slightly off cut leaves no white sliver. Standard is 3 mm. Use it whenever color or images run to the edge of a printed piece; leave it at 0 for screen-only or fully-margined designs.',
  safe: '<b>Safe zone.</b> An inner buffer keeping critical content (text, logos) away from the trim, since cutting is never perfectly precise. Around 3–5 mm. It is the inner dashed line in the preview — keep anything you cannot afford to lose inside it.',
  munit: '<b>Margin units.</b> Switch the top, left and right margin fields between millimetres and points. Points are handy here because the baseline is in points — a top margin of an exact number of points lines up perfectly with the baseline grid start. The underlying value is kept precise, so switching units does not drift.',
  tbase: '<b>Base size.</b> The size of your body text, in points — the anchor the whole scale grows from. Everything else is this number multiplied or divided by the ratio. Set it to match the body size you will actually set in Affinity. For print, 9–11 pt is typical.',
  tratio: '<b>Ratio.</b> The constant each step multiplies by, borrowed from musical intervals. Small ratios (1.067–1.2) give gentle, closely-spaced sizes good for dense text; large ones (1.5, golden 1.618) give dramatic jumps good for posters and big headlines. Major third (1.25) is a versatile default.',
  tup: '<b>Steps up.</b> How many heading sizes to generate above body. Each step is one multiplication by the ratio. Flyers rarely need more than 3–4 distinct heading sizes; more steps mostly serve complex editorial hierarchies.',
  tdown: '<b>Steps down.</b> How many smaller sizes below body — captions, footnotes, fine print. One is usually enough. These still snap to the baseline (one line each), so small text stays on the grid too.',
  tbaseline: '<b>Baseline.</b> The same master unit as on the Grid tab — editing it here updates both. Every size in the scale gets a leading rounded up to a whole multiple of this number, which is exactly what keeps text aligned to the grid you built.',
  tminlh: '<b>Min leading.</b> The minimum line spacing as a multiple of font size, before snapping to the baseline. 1.0 means leading only needs to clear the glyphs (tightest); raise it toward 1.1–1.2 if a size feels cramped and you want it bumped to the next baseline multiple.',
  tfont: '<b>Font.</b> Previews the scale in a real typeface so you can judge the letterforms at each size. The listed faces load automatically; pick “Custom…” to type any Google Font name, or a font installed on your computer (e.g. Helvetica Neue), or “System UI”. This is preview only — set the matching font in Affinity yourself.',
  tweight: '<b>Weight.</b> The specimen weight. Headings often read better a touch heavier and body at regular; use this to sanity-check how the hierarchy feels. It does not change the size or leading numbers.',
};
const tipEl = document.createElement('div');
tipEl.id = 'tip';
document.body.appendChild(tipEl);
let tipPinned = null;
function showTip(el){
  const key = el.dataset.tip; if(!TIPS[key]) return;
  tipEl.innerHTML = TIPS[key];
  tipEl.classList.add('show');
  const r = el.getBoundingClientRect();
  const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  let x = r.right + 10, y = r.top + r.height/2 - th/2;
  if(x + tw > window.innerWidth - 8) x = r.left - tw - 10;
  if(x < 8) x = 8;
  if(y < 8) y = 8;
  if(y + th > window.innerHeight - 8) y = window.innerHeight - th - 8;
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}
function hideTip(){ tipEl.classList.remove('show'); tipPinned = null; }
document.querySelectorAll('.info').forEach(el=>{
  el.addEventListener('mouseenter',()=>{ if(!tipPinned) showTip(el); });
  el.addEventListener('mouseleave',()=>{ if(!tipPinned) hideTip(); });
  el.addEventListener('focus',()=>showTip(el));
  el.addEventListener('blur',()=>{ if(!tipPinned) hideTip(); });
  el.addEventListener('click',e=>{ e.preventDefault(); e.stopPropagation();
    if(tipPinned===el){ hideTip(); } else { tipPinned=el; showTip(el); } });
  el.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); el.click(); } });
});
document.addEventListener('click',e=>{ if(tipPinned && !e.target.closest('.info')) hideTip(); });
window.addEventListener('scroll',()=>{ if(tipPinned) showTip(tipPinned); }, true);

syncInputs();
syncTypeInputs();
render();
renderType();
restore();
let __rz; window.addEventListener('resize',()=>{clearTimeout(__rz); __rz=setTimeout(()=>{
  if(!document.getElementById('view-grid').hidden) render();
  if(!document.getElementById('view-type').hidden) renderType();
},120);});

// Give every plain number field a − / + stepper (replaces the native spin arrows).
(function(){
  const decimals = s => (String(s).split('.')[1]||'').length;
  function bump(input, dir){
    if(input.disabled) return;
    const step = parseFloat(input.step) || 1;
    const min = input.min!=='' ? parseFloat(input.min) : -Infinity;
    const max = input.max!=='' ? parseFloat(input.max) :  Infinity;
    const cur = parseFloat(input.value) || 0;
    let next = cur + dir*step;
    next = Math.min(max, Math.max(min, next));
    input.value = parseFloat(next.toFixed(decimals(step)));
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  document.querySelectorAll('input[type=number]').forEach(input=>{
    if(input.closest('.stepper')) return;            // cols/rows already have steppers
    const wrap = document.createElement('div');
    wrap.className = 'stepper';
    const minus = document.createElement('button');
    const plus  = document.createElement('button');
    minus.type = plus.type = 'button';
    minus.textContent = '−'; plus.textContent = '+';
    minus.setAttribute('aria-label','Decrease'); plus.setAttribute('aria-label','Increase');
    input.style.width = '';                          // drop inline widths for a uniform field
    input.parentNode.insertBefore(wrap, input);
    wrap.append(minus, input, plus);
    minus.addEventListener('click',()=>bump(input,-1));
    plus .addEventListener('click',()=>bump(input, 1));
  });
})();
