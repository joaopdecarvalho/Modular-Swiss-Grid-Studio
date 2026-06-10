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
  document.getElementById('view-learn').hidden = v!=='learn';
  document.getElementById('modeswitch').style.visibility = v==='grid'?'visible':'hidden';
  if(v==='grid') render(); else if(v==='type') renderType(); else renderLearn();
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
  if(!document.getElementById('view-learn').hidden) renderLearn();
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

/* ============================================================
   Layout guide — lessons drawn on the user's own grid,
   after Müller-Brockmann, "Grid Systems in Graphic Design"
   ============================================================ */
const LEARN_INK = '#19180f', LEARN_ACC = '#d6392b';
const learn = { idx:0, blocks:[], anchor:null, layout:null, shape:null };

function learnGrid(){
  let G = computeGrid(state);
  if(G.N<=0 || G.colWpt<=0){
    const { _t, ...fb } = PRESETS.flyer;
    G = computeGrid({ ...state, ...fb });
    G.__fallback = true;
  }
  return G;
}
function fieldRect(G,c,r,cs=1,rs=1){
  return { x: G.leftPt + c*(G.colWpt+G.colGutterPt),
           y: G.topPt + r*(G.moduleHpt+G.gutterPt),
           w: cs*G.colWpt + (cs-1)*G.colGutterPt,
           h: rs*G.moduleHpt + (rs-1)*G.gutterPt };
}
function rectsIntersect(a,b){ return a.c<b.c+b.cs && b.c<a.c+a.cs && a.r<b.r+b.rs && b.r<a.r+a.rs; }
function mulberry(seed){ let a=seed>>>0; return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

/* mock content, drawn in page pt coordinates */
function mockImage(g,R){
  g.appendChild(svgEl('rect',{x:R.x,y:R.y,width:R.w,height:R.h,fill:'rgba(25,24,15,.15)',stroke:LEARN_INK,'stroke-width':0.9,'vector-effect':'non-scaling-stroke'}));
  g.appendChild(svgEl('line',{x1:R.x,y1:R.y,x2:R.x+R.w,y2:R.y+R.h,stroke:LEARN_INK,'stroke-width':0.6,opacity:.45,'vector-effect':'non-scaling-stroke'}));
  g.appendChild(svgEl('line',{x1:R.x+R.w,y1:R.y,x2:R.x,y2:R.y+R.h,stroke:LEARN_INK,'stroke-width':0.6,opacity:.45,'vector-effect':'non-scaling-stroke'}));
}
function mockText(g,G,R,seed){
  const rnd = mulberry(seed||7);
  const n = Math.max(1, Math.round(R.h/G.b));
  for(let k=1;k<=n;k++){
    const last = k===n || k%7===0;
    const w = R.w*(last ? .4+.25*rnd() : .88+.12*rnd());
    g.appendChild(svgEl('rect',{x:R.x,y:R.y+k*G.b-G.b*.42,width:w,height:G.b*.42,fill:'rgba(25,24,15,.32)'}));
  }
}
function mockTextStand(g,G,R,lines,seed){
  // a block whose LAST baseline registers on R's bottom edge (a "stand line")
  const rnd = mulberry(seed||5);
  const n = Math.max(1, Math.min(lines, Math.round(R.h/G.b)));
  const y0 = R.y + R.h - n*G.b;
  for(let k=1;k<=n;k++){
    const last = k===n || k%7===0;
    const w = R.w*(last ? .4+.25*rnd() : .88+.12*rnd());
    g.appendChild(svgEl('rect',{x:R.x,y:y0+k*G.b-G.b*.42,width:w,height:G.b*.42,fill:'rgba(25,24,15,.32)'}));
  }
}
function mockTextSized(g,G,R,leadLines,maxLines,seed){
  // mid-size text (taller bars), hung from R's top: first baseline one grid
  // line down, then spaced leadLines baselines apart (1.5 = floating interiors)
  const rnd = mulberry(seed||7);
  const lead = leadLines*G.b;
  const n = Math.max(1, Math.min(maxLines, Math.floor((R.h - G.b)/lead) + 1));
  for(let k=1;k<=n;k++){
    const y = R.y + G.b + (k-1)*lead;
    const w = R.w*(k===n ? .55+.2*rnd() : .8+.2*rnd());
    g.appendChild(svgEl('rect',{x:R.x,y:y-G.b*.62,width:w,height:G.b*.62,fill:'rgba(25,24,15,.5)'}));
  }
  return n;
}
function mockHead(g,G,R,bars,barLines=2){
  const maxBars = Math.max(1, Math.floor(R.h/(barLines*G.b)));
  const nb = Math.min(bars||2, maxBars);
  const barH = G.b*barLines*.52;
  for(let i=1;i<=nb;i++){
    const w = R.w*(i===nb?.62:.9);
    g.appendChild(svgEl('rect',{x:R.x,y:R.y+i*barLines*G.b-barH,width:w,height:barH,fill:LEARN_INK}));
  }
  return nb*barLines; // baselines consumed
}
function mockCaption(g,G,x,y,w,lines){
  const n = Math.max(1, lines||1);
  for(let k=1;k<=n;k++){
    g.appendChild(svgEl('rect',{x,y:y+k*G.b-G.b*.3,width:w*(k===n?.62:.96),height:G.b*.3,fill:'rgba(25,24,15,.46)'}));
  }
}
function lessonMarker(g,x,y,n,fs){
  g.appendChild(svgEl('circle',{cx:x,cy:y,r:fs*.72,fill:LEARN_ACC}));
  const t = svgEl('text',{x,y:y+fs*.34,'text-anchor':'middle','font-size':fs,fill:'#fff','font-family':"'Archivo',sans-serif",'font-weight':'600'});
  t.textContent = String(n);
  g.appendChild(t);
}
function accentDash(g,G,y){
  g.appendChild(svgEl('line',{x1:G.leftPt,y1:y,x2:G.leftPt+G.liveWpt,y2:y,stroke:LEARN_ACC,'stroke-width':1.3,'stroke-dasharray':'5 4','vector-effect':'non-scaling-stroke'}));
}

/* lesson 1 anatomy callouts — markers and key list share one source */
function anatomyItems(G){
  const items = [];
  items.push({ t:'Margins', p:{x:G.p.wpt/2, y:Math.max(7,G.topPt/2)},
    d:'the white frame around the type area. The book treats margins as deliberate proportions — often a heavier foot — never as leftover space.' });
  items.push({ t:'Type area', p:{x:G.leftPt+G.liveWpt, y:G.topPt},
    d:`the live rectangle all content stays inside — ${r1(G.liveWpt/PT)} × ${r1(G.liveHpt/PT)} mm, exactly ${G.N} baselines tall.` });
  items.push({ t:'Field (module)', p:{x:G.leftPt+G.colWpt/2, y:G.topPt+G.moduleHpt/2},
    d:'the unit of placement. Everything you position — text, pictures, captions — occupies one or more whole fields.' });
  if(G.rows>1) items.push({ t:'Row gutter', p:{x:G.leftPt+G.liveWpt/2, y:G.topPt+G.moduleHpt+G.gutterPt/2},
    d: G.g>0 ? `${G.g} blank text line${G.g===1?'':'s'} between fields — sized in whole lines so a caption can sit inside it (lesson 4).`
             : 'currently 0 lines, so the fields touch. The book sets one or more whole lines here so a caption can sit between fields (lesson 4).' });
  if(G.cols>1) items.push({ t:'Column gutter', p:{x:G.leftPt+G.colWpt+G.colGutterPt/2, y:G.topPt+G.liveHpt*.62},
    d:'the horizontal gap between columns — sized so neighbouring text and pictures never touch.' });
  const kb = Math.max(1, Math.min(G.N-1, Math.round(G.N*.8)));
  items.push({ t:'Baseline grid', p:{x:G.leftPt+G.liveWpt*.82, y:G.topPt+kb*G.b}, line:true,
    d:`the ${fmt(G.b)} pt rhythm every line of text sits on — the master unit the whole page is counted in.` });
  return items;
}

/* interactive picture placement (lesson 3) */
function seedBlocks(G){
  const out = [];
  const tryAdd = b => { if(b.c>=0 && b.r>=0 && b.c+b.cs<=G.cols && b.r+b.rs<=G.rows && !out.some(o=>rectsIntersect(o,b))) out.push(b); };
  tryAdd({ c:Math.max(0,G.cols-2), r:0, cs:Math.min(2,G.cols), rs:Math.min(2,G.rows) });
  tryAdd({ c:0, r:G.rows-1, cs:1, rs:1 });
  return out;
}
function learnCellClick(c,r){
  if(!learn.anchor){ learn.anchor={c,r}; renderLearn(); return; }
  const a = learn.anchor; learn.anchor = null;
  const nb = { c:Math.min(a.c,c), r:Math.min(a.r,r), cs:Math.abs(a.c-c)+1, rs:Math.abs(a.r-r)+1 };
  learn.blocks = learn.blocks.filter(b=>!rectsIntersect(b,nb));
  learn.blocks.push(nb);
  renderLearn();
}

/* layout generator (lesson 7) — every layout obeys the lessons' rules */
function genLayout(G){
  const C=G.cols, R=G.rows;
  const occ = Array.from({length:R},()=>Array(C).fill(false));
  const free = (c,r,cs,rs)=>{ if(c<0||r<0||c+cs>C||r+rs>R) return false;
    for(let i=r;i<r+rs;i++) for(let j=c;j<c+cs;j++) if(occ[i][j]) return false; return true; };
  const take = (c,r,cs,rs)=>{ for(let i=r;i<r+rs;i++) for(let j=c;j<c+cs;j++) occ[i][j]=true; };
  const rnd = n => Math.floor(Math.random()*n);
  const out = { cols:C, rows:R, heads:[], imgs:[], texts:[], caps:[] };
  // headline zone: whole columns in the top row — sometimes the full type area, as on the book's cover
  const hc = Math.random()<0.25 ? C : Math.min(C, 1+rnd(Math.min(3,C)));
  const hx = rnd(C-hc+1);
  out.heads.push({ c:hx, r:0, cs:hc, rs:1, bars:1+rnd(2) });
  take(hx,0,hc,1);
  // one strong picture on whole fields
  for(let t=0;t<24;t++){
    const cs = Math.min(C, 1+rnd(Math.min(3,C))), rs = Math.min(R, 1+rnd(Math.min(3,R)));
    const c = rnd(C-cs+1), r = rnd(R-rs+1);
    if(free(c,r,cs,rs)){
      out.imgs.push({c,r,cs,rs}); take(c,r,cs,rs);
      if(G.g>0 && r+rs<R) out.caps.push({img:0});
      break;
    }
  }
  // sometimes a second, small picture
  if(Math.random()<0.5){
    for(let t=0;t<16;t++){ const c=rnd(C), r=rnd(R); if(free(c,r,1,1)){ out.imgs.push({c,r,cs:1,rs:1}); take(c,r,1,1); break; } }
  }
  // text columns fill some of what's left, from field tops; some columns stay empty on purpose
  for(let j=0;j<C;j++){
    if(Math.random()<0.3) continue;
    let best=null, run=0, start=0;
    for(let i=0;i<=R;i++){
      if(i<R && !occ[i][j]){ if(run===0) start=i; run++; }
      else { if(run>0 && (!best||run>best.run)) best={start,run}; run=0; }
    }
    if(best){
      const rs = Math.max(1, best.run - (Math.random()<0.4?1:0));
      out.texts.push({ c:j, r:best.start, cs:1, rs, stand:Math.random()<0.3 });
      take(j,best.start,1,rs);
    }
  }
  if(!out.texts.length){
    outer: for(let i=0;i<R;i++) for(let j=0;j<C;j++) if(!occ[i][j]){ out.texts.push({c:j,r:i,cs:1,rs:1}); take(j,i,1,1); break outer; }
  }
  return out;
}

const LESSONS = [
  { title:'What the grid is', kick:'The idea',
    body:G=>`
<p>Müller-Brockmann’s starting point: the grid is an <i>ordering system</i>. Instead of deciding every element’s place by feel, you divide the page once — and from then on each text block, picture and caption takes a position the system already provides. The constraint is the point: decisions get faster, pages calmer, and a series of pages reads as one family.</p>
<p>Your grid divides the type area into <span class="v">${G.cols} × ${G.rows} = ${G.cols*G.rows} fields</span>, each <span class="v">${r1(G.colWpt/PT)} × ${r1(G.moduleHpt/PT)} mm</span> and exactly <span class="v">${G.moduleLines} lines</span> of body text deep. The numbered points on the page:</p>
<ol class="keylist">${anatomyItems(G).map(it=>`<li><b>${it.t}</b> — ${it.d}</li>`).join('')}</ol>`,
    draw(G,g,ctx){
      g.appendChild(svgEl('rect',{x:G.leftPt,y:G.topPt,width:G.liveWpt,height:G.liveHpt,fill:'none',stroke:LEARN_ACC,'stroke-width':1.4,'stroke-dasharray':'5 4','vector-effect':'non-scaling-stroke'}));
      const R = fieldRect(G,0,0);
      g.appendChild(svgEl('rect',{x:R.x,y:R.y,width:R.w,height:R.h,fill:'rgba(214,57,43,.14)',stroke:LEARN_ACC,'stroke-width':1.1,'vector-effect':'non-scaling-stroke'}));
      anatomyItems(G).forEach((it,i)=>{
        if(it.line) g.appendChild(svgEl('line',{x1:G.leftPt,y1:it.p.y,x2:G.leftPt+G.liveWpt,y2:it.p.y,stroke:LEARN_ACC,'stroke-width':1.2,'vector-effect':'non-scaling-stroke'}));
        lessonMarker(g,it.p.x,it.p.y,i+1,ctx.fs);
      });
    } },

  { title:'Text lives in columns', kick:'Body text',
    body:G=>{
      const cpl = G.colWpt>0 ? Math.round(G.colWpt/(0.5*typeState.baseSize)) : 0;
      const verdict = cpl<40 ? 'on the short side — consider fewer columns' : cpl>78 ? 'on the long side — consider more columns or larger body text' : 'a comfortable measure';
      return `
<p>Body text fills <b>the width of a column</b> and registers to <b>a field edge</b> — never part-way down a module. Because your leading equals the baseline (<span class="v">${fmt(G.b)} pt</span>), one field holds exactly <span class="v">${G.moduleLines} lines</span> and a full column runs <span class="v">${G.N} lines</span>. Text may flow straight past field boundaries — the divisions matter where text meets pictures.</p>
<p>A field offers <b>two registration edges</b>, and the book’s layouts use both. Text usually <b>hangs</b> from the top edge of a field — the capitals of line one reach up to it, and the first baseline sits one line down (upper red dot). But a block may just as well <b>stand</b> on a field’s bottom edge, its last baseline placed exactly on the edge (lower red dot) — captions, credits and the bottom-weighted blocks on the book’s own cover do this. Both are fully on the grid: a field’s depth is a whole number of lines, so a block lands on the baseline grid whichever edge it registers to.</p>
<p>What the system never allows is a block that registers to <i>nothing</i> — floating mid-module with neither edge taking responsibility for it. Every start or end is a field edge (the dashed lines mark the page’s hang line and stand line), which is why columns hung and stood at different heights still pair their baselines exactly, line for line. Mixing the two is one of the book’s quiet tools for vertical tension.</p>
<p><b>Measure check:</b> at your <span class="v">${fmt(typeState.baseSize)} pt</span> body size this column carries about <span class="v">${cpl} characters</span> per line — ${verdict}. The book’s test is comfort: a line you can read at arm’s length, roughly seven to ten words.</p>`;
    },
    draw(G,g,ctx){
      const dot = (x,y)=>g.appendChild(svgEl('circle',{cx:x,cy:y,r:Math.max(2.2,ctx.fs*.26),fill:LEARN_ACC}));
      const dotOff = Math.max(4,ctx.fs*.4);
      const bottomY = G.topPt + G.liveHpt;
      accentDash(g,G,G.topPt);   // hang line
      accentDash(g,G,bottomY);   // stand line
      if(G.cols===1){
        const hr = Math.max(1,G.rows-1);
        const R0 = fieldRect(G,0,0,1,hr);
        mockText(g,G,R0,3);
        dot(R0.x-dotOff, R0.y+G.b);
        if(G.rows>1){
          const RL = fieldRect(G,0,G.rows-1);
          mockTextStand(g,G,RL,Math.max(2,Math.round(G.moduleLines*.6)),5);
          dot(RL.x-dotOff, bottomY);
        }
      } else {
        const R0 = fieldRect(G,0,0,1,G.rows);
        mockText(g,G,R0,3);
        dot(R0.x-dotOff, R0.y+G.b);
        if(G.cols>2 && G.rows>1){
          const R1 = fieldRect(G,1,1,1,Math.max(1,G.rows-2)); // hung from a lower field edge
          accentDash(g,G,R1.y);
          mockText(g,G,R1,5);
        }
        const RL = fieldRect(G,G.cols-1,0,1,G.rows);
        mockTextStand(g,G,RL,Math.max(2,Math.round((RL.h/G.b)*.45)),8);
        dot(RL.x-dotOff, bottomY);
      }
    } },

  { title:'Pictures fill whole fields', kick:'Pictures',
    body:G=>`
<p>A picture never floats on the page: it fills <b>one or more whole fields</b>, edges flush with the field edges. From your ${G.cols}×${G.rows} grid you get a fixed menu of picture sizes — one field, two across, a ${Math.min(2,G.cols)}×${Math.min(2,G.rows)} block, a full row, a full column.</p>
<p>That limited menu is the book’s argument: when every picture is built from the same module, every picture stands in a clear proportional relationship to every other, and the page holds together no matter how varied the content.</p>
<p><b>Try it:</b> click one field, then a second — a picture snaps to the whole rectangle between them (overlapped pictures give way). Click a picture to remove it. Notice what you <i>can’t</i> do: make something “a little bigger”. The grid offers steps, and the steps are the system.</p>`,
    action:{ label:'Clear pictures', fn(){ learn.blocks=[]; learn.anchor=null; renderLearn(); } },
    draw(G,g,ctx){
      for(let r=0;r<G.rows;r++) for(let c=0;c<G.cols;c++){
        const R = fieldRect(G,c,r);
        const cell = svgEl('rect',{x:R.x,y:R.y,width:R.w,height:R.h,class:'cell'});
        cell.addEventListener('click',()=>learnCellClick(c,r));
        g.appendChild(cell);
      }
      if(learn.anchor){
        const R = fieldRect(G,learn.anchor.c,learn.anchor.r);
        g.appendChild(svgEl('rect',{x:R.x,y:R.y,width:R.w,height:R.h,fill:'rgba(214,57,43,.18)',stroke:LEARN_ACC,'stroke-width':1.4,'vector-effect':'non-scaling-stroke'}));
      }
      learn.blocks.forEach((b,i)=>{
        const R = fieldRect(G,b.c,b.r,b.cs,b.rs);
        mockImage(g,R);
        const hit = svgEl('rect',{x:R.x,y:R.y,width:R.w,height:R.h,class:'blockhit'});
        hit.addEventListener('click',()=>{ learn.blocks.splice(i,1); learn.anchor=null; renderLearn(); });
        g.appendChild(hit);
      });
    } },

  { title:'Captions sit in the gutter', kick:'Captions',
    body:G=>{
      const cs = Math.min(2,G.cols);
      const second = G.cols>cs && G.rows>1;
      const gut = G.g>0
        ? `Your row gutter is <span class="v">${G.g} line${G.g===1?'':'s'} · ${fmt(G.gutterPt)} pt</span> — room for exactly ${G.g===1?'one caption line':G.g+' caption lines'} between a picture and the field below, sitting on the same baselines as everything else.`
        : `Your row gutter is currently <span class="v">0 lines</span>, so there is no room for a caption between fields — set it to 1 on the Grid tab and watch this page update.`;
      return `
<p>Captions are typography, not labels stuck on afterwards. This is why the book insists the <b>row gutter is measured in whole lines of text</b>: the gap between fields is itself part of the baseline grid, ready to carry a caption directly beneath a picture. ${gut}</p>
<p>A longer caption takes the <b>top of the field below</b> (or beside) the picture instead${second?' — shown under the smaller picture on the right':''}. Keep captions flush with the picture’s left edge and set them at your smallest scale step (the Type scale tab computes it), and they read as quiet annotation rather than competing text.</p>`;
    },
    draw(G,g,ctx){
      const cs = Math.min(2,G.cols), rs = Math.min(2,G.rows);
      const R = fieldRect(G,0,0,cs,rs);
      mockImage(g,R);
      if(G.g>0 && rs<G.rows) mockCaption(g,G,R.x,R.y+R.h,R.w*0.75,Math.min(G.g,2));
      if(G.cols>cs){
        const R2 = fieldRect(G,G.cols-1,0,1,1);
        mockImage(g,R2);
        if(G.rows>1){
          const R3 = fieldRect(G,G.cols-1,1,1,1);
          mockCaption(g,G,R3.x,R3.y,R3.w*0.92,Math.min(3,G.moduleLines));
        }
      }
      if(G.rows>rs) mockText(g,G,fieldRect(G,0,rs,1,G.rows-rs),9);
    } },

  { title:'Headlines hold position', kick:'Hierarchy',
    body:G=>`
<p>Headlines answer to the <b>type area</b>, not to a single column. The column division exists to give body matter its measure; display type works in coarser units of the same grid — two columns, three, or, as here, the full width of the type area, gutters included. Never a column and a half, though: the span is a whole number of columns, the left edge sits on a column edge, and the leading is a whole number of baselines (the Type scale tab guarantees it), so the text below lands cleanly back on the grid. The finer the matter, the tighter the rules — body text is the most constrained, display type the least.</p>
<p>Hierarchy in the Swiss manner is positional as much as it is size: the book keeps title, body and captions in <b>the same fields, page after page</b>, so a reader learns where to look and stays oriented. Decide once where the headline zone lives — here, the top row — and where body text begins (the dashed line), then hold those positions through the whole document. And when a cover or a poster takes a visible liberty — a title bursting past the column logic — it reads as intentional precisely because everything else on the page obeys.</p>`,
    draw(G,g,ctx){
      const RH = fieldRect(G,0,0,G.cols,1);
      const barLines = G.moduleLines>=6 ? 3 : 2; // display type leads on more lines
      const used = mockHead(g,G,RH,2,barLines);
      if(G.moduleLines>used) mockCaption(g,G,RH.x,RH.y+used*G.b,Math.min(G.colWpt,RH.w*.6),Math.min(2,G.moduleLines-used));
      if(G.rows>1){
        accentDash(g,G,fieldRect(G,0,1).y);
        const sideImg = G.cols>2 && G.rows>2;
        const tcols = Math.min(2, G.cols - (sideImg?1:0));
        for(let c=0;c<tcols;c++) mockText(g,G,fieldRect(G,c,1,1,G.rows-1),c*7+3);
        if(sideImg){
          const irs = Math.min(2,G.rows-1);
          const RI = fieldRect(G,G.cols-1,1,1,irs);
          mockImage(g,RI);
          if(G.g>0 && 1+irs<G.rows) mockCaption(g,G,RI.x,RI.y+RI.h,RI.w*0.6,1);
        }
      }
    } },

  { title:'Sizes between the lines', kick:'Type rhythm',
    body:G=>{
      const s1 = Math.round(typeState.baseSize*currentRatio()*2)/2; // first step above body
      const pc = lead => Math.round(lead*G.b/s1*100);
      const pBody = Math.round(G.b/typeState.baseSize*100);
      const natural = Math.round(s1*(G.b/typeState.baseSize)*2)/2; // body's ratio applied to s1
      const tightNote = pc(1)<105
        ? 'at your sizes a single line barely clears the type — genuinely too tight'
        : `it only feels cramped next to an airy body — the pinch is the contrast in densities (${pc(1)}% against the body’s ${pBody}%), not the number itself`;
      return `
<p>The grid’s one hard rule for type is that leading is counted in <b>whole baselines</b> — and the sizes just above body put that rule under stress. Your body text sits happily on one line (<span class="v">${fmt(typeState.baseSize)} / ${fmt(G.b)} pt</span> = ${pBody}%); a headline happily takes two or three. But the first step up on your scale — <span class="v">${fmt(s1)} pt</span> — is too big for one line and nowhere near needing two. Subheads, pull quotes and contact blocks all live in this gap. Three honest ways out:</p>
<ol class="keylist">
<li><b>Take one line</b> — <span class="v">${fmt(s1)} / ${fmt(G.b)} pt</span> (${pc(1)}%). Every line stays on the grid, and ${tightNote}.</li>
<li><b>Take two lines</b> — <span class="v">${fmt(s1)} / ${fmt(2*G.b)} pt</span> (${pc(2)}%). Fully orthodox and airy. Too loose for running prose, exactly right for standalone items — contact lines, credits, lists — where each line is its own small block. (The Type scale tab prescribes this when you raise <b>Min leading</b> to ~1.3.)</li>
<li><b>Register the edges, float the lines</b> — give the block a leading that suits it (the body’s ratio suggests ≈ <span class="v">${fmt(natural)} pt</span>; drawn here at 1½ lines = <span class="v">${fmt(1.5*G.b)} pt</span>, where every other line re-finds the grid) and snap only its <b>first baseline</b> to a grid line: the hang line from lesson 2, applied to a whole block. Interior lines float between grid lines; the registered edge (red dot) holds the block in the system. In Affinity: untick <i>Align to baseline grid</i> for that one style and set a fixed Leading Override.</li>
</ol>
<p>And a fourth, document-wide move: run the baseline grid at <b>half</b> the body leading (<span class="v">${fmt(G.b/2)} pt</span>). Body then takes two units, the in-between size three (<span class="v">${fmt(1.5*G.b)} pt</span>), and everything snaps natively again — at the price of a finer grid. Worth it when the middle size recurs through a whole document; overkill for a single flyer.</p>`;
    },
    draw(G,g,ctx){
      const slots = [];
      if(G.cols>=3){ [1,2,1.5].forEach((lead,i)=>slots.push({lead, c:i, r:0, rs:Math.min(2,G.rows)})); }
      else if(G.cols===2){
        slots.push({lead:1, c:0, r:0, rs:1});
        slots.push({lead:2, c:1, r:0, rs:Math.min(2,G.rows)});
        if(G.rows>=2) slots.push({lead:1.5, c:0, r:G.rows-1, rs:1});
      } else {
        slots.push({lead:1, c:0, r:0, rs:1});
        if(G.rows>=2) slots.push({lead:2, c:0, r:1, rs:1});
        if(G.rows>=3) slots.push({lead:1.5, c:0, r:2, rs:1});
      }
      slots.forEach((s,i)=>{
        const R = fieldRect(G,s.c,s.r,1,s.rs);
        mockTextSized(g,G,R,s.lead,4,4+i*3);
        lessonMarker(g, R.x+ctx.fs*.85, Math.max(ctx.fs*.9, R.y-ctx.fs*1.15), i+1, ctx.fs);
        if(s.lead===1.5) g.appendChild(svgEl('circle',{cx:R.x-Math.max(4,ctx.fs*.4), cy:R.y+G.b, r:Math.max(2.2,ctx.fs*.26), fill:LEARN_ACC}));
      });
    } },

  { title:'Derive the space between', kick:'Repetition',
    body:G=>{
      const sep = G.moduleLines-3+G.g;
      const liveA = G.moduleLines>=3
        ? `On your grid: a 3-line unit in each <span class="v">${G.moduleLines}-line</span> module leaves <span class="v">${sep} line${sep===1?'':'s'}</span> between units — equal without measuring.`
        : `(Your modules are only ${G.moduleLines} lines deep — too shallow for a 3-line unit, so on this grid the period method is the one to use.)`;
      return `
<p>Pages constantly stack repeated units — a heading with two lines of text, list entries, contact rows. “How much space between them?” is the wrong question: gaps set by eye come out slightly unequal, and the page feels restless without telling you why. In the system the space between blocks is <b>derived, not picked</b> — and it is always a whole number of baselines.</p>
<ol class="keylist">
<li><b>One unit per field</b> — hang each unit from consecutive field tops (lesson 2’s hang line). The separation is then the leftover depth of the module plus the gutter: identical by construction, and the units share their edges with everything else on the page. ${liveA}</li>
<li><b>A fixed period</b> — when the fields don’t cooperate, give every unit the same period in whole lines, ignoring field boundaries: drawn here as a unit every <span class="v">5th line</span> — 3 of content, 2 of air. To fit a run, count the lines available, subtract the content, and split the remainder into equal gaps; anything left over goes to the edges of the run, never into unequal gaps.</li>
<li><b>The proximity check</b> — the one taste rule: a heading must sit closer to its own text than to the block above it, roughly twice as close (the two red brackets). If the gaps tie, the heading floats free; if they invert, it captions the wrong block.</li>
</ol>
<p>In Affinity the robust mechanic is one flowing text frame, with the heading style’s <i>Space Before</i> set in whole-baseline points (<span class="v">${fmt(2*G.b)} pt</span> = two blank lines on your grid) — with <i>Align to baseline grid</i> on, the spacing quantizes itself and survives every edit. Separate frames work too: snap each frame’s top to a field edge and let the grid do the counting.</p>`;
    },
    draw(G,g,ctx){
      const unit = (x,w,yEdge,seed)=>{
        const rnd = mulberry(seed);
        g.appendChild(svgEl('rect',{x,y:yEdge+G.b-G.b*.62,width:w*.72,height:G.b*.62,fill:'rgba(25,24,15,.55)'}));
        g.appendChild(svgEl('rect',{x,y:yEdge+2*G.b-G.b*.42,width:w*(.86+.1*rnd()),height:G.b*.42,fill:'rgba(25,24,15,.32)'}));
        g.appendChild(svgEl('rect',{x,y:yEdge+3*G.b-G.b*.42,width:w*(.5+.25*rnd()),height:G.b*.42,fill:'rgba(25,24,15,.32)'}));
      };
      const bracket = (x,y1,y2)=>{
        g.appendChild(svgEl('line',{x1:x,y1:y1,x2:x,y2:y2,stroke:LEARN_ACC,'stroke-width':1.2,'vector-effect':'non-scaling-stroke'}));
        [y1,y2].forEach(yy=>g.appendChild(svgEl('line',{x1:x-2.5,y1:yy,x2:x+2.5,y2:yy,stroke:LEARN_ACC,'stroke-width':1.2,'vector-effect':'non-scaling-stroke'})));
      };
      // 1 — one unit hung from each field top (column 0)
      const RA = fieldRect(G,0,0);
      const nA = Math.min(4,G.rows);
      for(let r=0;r<nA;r++) unit(RA.x,RA.w,fieldRect(G,0,r).y,11+r);
      lessonMarker(g, RA.x+ctx.fs*.85, Math.max(ctx.fs*.9, RA.y-ctx.fs*1.15), 1, ctx.fs);
      // 2 — fixed 5-line period, ignoring field boundaries (last column)
      if(G.cols>1){
        const RB = fieldRect(G,G.cols-1,0,1,G.rows);
        const P = 5;
        const nB = Math.min(4, Math.max(1, Math.floor((G.N-3)/P)+1));
        for(let u=0;u<nB;u++) unit(RB.x,RB.w,RB.y+u*P*G.b,21+u);
        lessonMarker(g, RB.x+ctx.fs*.85, Math.max(ctx.fs*.9, RB.y-ctx.fs*1.15), 2, ctx.fs);
      }
      // 3 — proximity: tight bracket (heading to its text) vs loose bracket (unit to next heading)
      if(G.rows>1){
        const t0 = fieldRect(G,0,0).y, t1 = fieldRect(G,0,1).y;
        const bx = RA.x - Math.max(4,ctx.fs*.45);
        bracket(bx, t0+G.b, t0+2*G.b);
        bracket(bx, t0+3*G.b, t1+G.b);
        lessonMarker(g, RA.x+RA.w*.82, (t0+3*G.b+t1+G.b)/2, 3, ctx.fs);
      }
    } },

  { title:'Empty fields do work', kick:'White space',
    body:G=>`
<p>Nothing obliges you to fill every field. Empty fields are how a grid breathes: they make the occupied fields louder, steer the eye across the page, and create the off-centre tension Swiss design is known for. In many of the book’s finest examples more of the page is empty than printed.</p>
<p>Two habits to borrow. First, place the strongest element <b>off-centre</b> and let it face into open space — symmetric centring is static; asymmetric balance is alive. Second, when a page feels crowded, remove content or add a page; don’t squeeze the grid to force a fit. White space here isn’t leftover — it is set deliberately, in whole fields, exactly like the content.</p>`,
    draw(G,g,ctx){
      const cs = Math.min(2,G.cols), rs = Math.min(2,G.rows);
      const RI = fieldRect(G,G.cols-cs,0,cs,rs);
      mockImage(g,RI);
      if(G.g>0 && rs<G.rows) mockCaption(g,G,RI.x,RI.y+RI.h,RI.w*0.5,1);
      let tspan = 0, trow = 0;
      if(G.cols>cs){ tspan = Math.min(2,G.rows); trow = G.rows-tspan; }
      else if(G.rows>rs){ tspan = Math.min(2,G.rows-rs); trow = G.rows-tspan; }
      if(tspan>0) mockText(g,G,fieldRect(G,0,trow,1,tspan),11);
    } },

  { title:'One grid, many layouts', kick:'The payoff',
    body:G=>`
<p>The payoff of the system: <b>one grid, endless layouts</b> — all visibly one family. Every arrangement shown here obeys the few rules you’ve just walked through: pictures on whole fields, text registered to field edges (hung from a top, or standing on a bottom), captions on the gutter line, a headline spanning whole columns — sometimes the full type area — and empty fields left on purpose.</p>
<p>Press <b>Shuffle layout</b> a few times and watch how different the pages feel while remaining unmistakably related — that is what the book means by unity through the grid.</p>
<p>When you’re ready to build one for real: the <b>Specification</b> tab on the Grid view lists every measurement of this exact grid, and <b>Apply in Affinity</b> walks you through recreating it, baseline and all.</p>`,
    action:{ label:'Shuffle layout', fn(){ learn.layout = genLayout(learnGrid()); renderLearn(); } },
    draw(G,g,ctx){
      const Ly = learn.layout; if(!Ly) return;
      Ly.heads.forEach(h=>mockHead(g,G,fieldRect(G,h.c,h.r,h.cs,h.rs),h.bars));
      Ly.imgs.forEach(im=>mockImage(g,fieldRect(G,im.c,im.r,im.cs,im.rs)));
      Ly.caps.forEach(cp=>{
        const im = Ly.imgs[cp.img]; if(!im) return;
        const R = fieldRect(G,im.c,im.r,im.cs,im.rs);
        mockCaption(g,G,R.x,R.y+R.h,R.w*0.6,1);
      });
      Ly.texts.forEach(t=>{
        const R = fieldRect(G,t.c,t.r,t.cs,t.rs);
        if(t.stand) mockTextStand(g,G,R,Math.max(2,Math.round((R.h/G.b)*.55)),(t.c+2)*(t.r+5));
        else mockText(g,G,R,(t.c+2)*(t.r+5));
      });
    } },
];

function renderLearnCanvas(G,L){
  const pad = 10;
  const totalW = G.p.wpt + 2*pad, totalH = G.p.hpt + 2*pad;
  const box = document.querySelector('#view-learn .previewbox');
  const availW = Math.max(220, (box ? box.clientWidth : 660) - 40);
  const maxH = Math.min(Math.round((window.innerHeight||800)*0.55), 520);
  const scale = Math.min(availW/totalW, maxH/totalH);
  const svg = svgEl('svg',{ class:'preview', xmlns:'http://www.w3.org/2000/svg', viewBox:`0 0 ${totalW} ${totalH}`,
    width:Math.round(totalW*scale), height:Math.round(totalH*scale), role:'img', 'aria-label':'Layout lesson drawn on your grid' });
  const g = svgEl('g',{transform:`translate(${pad} ${pad})`});
  g.appendChild(svgEl('rect',{x:0,y:0,width:G.p.wpt,height:G.p.hpt,fill:'#fffefb',stroke:LEARN_INK,'stroke-width':1.3,'vector-effect':'non-scaling-stroke'}));
  const period = G.moduleLines + G.g;
  for(let k=0;k<=G.N;k++){
    const y = G.topPt + k*G.b;
    const m = (k%period===0 || k%period===G.moduleLines);
    g.appendChild(svgEl('line',{x1:G.leftPt,y1:y,x2:G.leftPt+G.liveWpt,y2:y,
      stroke:m?'rgba(25,24,15,.20)':'rgba(25,24,15,.09)','stroke-width':m?0.8:0.5,'vector-effect':'non-scaling-stroke'}));
  }
  for(let r=0;r<G.rows;r++) for(let c=0;c<G.cols;c++){
    const R = fieldRect(G,c,r);
    g.appendChild(svgEl('rect',{x:R.x,y:R.y,width:R.w,height:R.h,
      fill:'rgba(214,57,43,.035)',stroke:'rgba(214,57,43,.30)','stroke-width':0.8,'vector-effect':'non-scaling-stroke'}));
  }
  const fs = Math.max(9, Math.min(18, G.p.wpt/40));
  L.draw(G,g,{fs});
  svg.appendChild(g);
  const host = document.getElementById('learnhost');
  host.innerHTML = ''; host.appendChild(svg);
}

function renderLearn(){
  const G = learnGrid();
  if(!learn.shape || learn.shape.c!==G.cols || learn.shape.r!==G.rows){
    learn.shape = { c:G.cols, r:G.rows };
    learn.blocks = seedBlocks(G);
    learn.anchor = null;
    learn.layout = genLayout(G);
  }
  const L = LESSONS[learn.idx];
  document.querySelectorAll('#lessonnav button').forEach((b,i)=>b.classList.toggle('on',i===learn.idx));
  const paperName = state.paper==='Custom' ? `${fmt(G.p.wmm)} × ${fmt(G.p.hmm)} mm` : `${state.paper} ${state.orientation}`;
  document.getElementById('learnnote').innerHTML = G.__fallback
    ? 'Your current settings don’t produce a valid grid, so the lessons draw on a default A5 grid for now. Fix the warnings on the <b>Grid</b> tab and the diagrams will switch to your own grid.'
    : `The diagrams draw on <b>your current grid</b> — ${G.cols} × ${G.rows} fields on ${paperName}, ${fmt(G.b)} pt baseline. Change anything on the Grid tab and the lessons follow.`;
  renderLearnCanvas(G,L);
  document.getElementById('lessonkicker').textContent = `Lesson ${learn.idx+1} of ${LESSONS.length} · ${L.kick}`;
  document.getElementById('lessontitle').textContent = L.title;
  document.getElementById('lessonbody').innerHTML = L.body(G);
  const act = document.getElementById('lessAct');
  if(L.action){ act.hidden = false; act.textContent = L.action.label; act.onclick = L.action.fn; }
  else { act.hidden = true; act.onclick = null; }
  document.getElementById('lessPrev').disabled = learn.idx===0;
  document.getElementById('lessNext').disabled = learn.idx===LESSONS.length-1;
}

(function(){
  const nav = document.getElementById('lessonnav');
  LESSONS.forEach((L,i)=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="n">${String(i+1).padStart(2,'0')}</span><span>${L.title}</span>`;
    b.addEventListener('click',()=>{ learn.idx=i; renderLearn(); });
    nav.appendChild(b);
  });
  document.getElementById('lessPrev').addEventListener('click',()=>{ if(learn.idx>0){ learn.idx--; renderLearn(); } });
  document.getElementById('lessNext').addEventListener('click',()=>{ if(learn.idx<LESSONS.length-1){ learn.idx++; renderLearn(); } });
})();
