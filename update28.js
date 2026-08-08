(() => {
  'use strict';

  const STORAGE_KEY = 'rideTracker.hud.configuration.v1';
  const ELEMENTS = [
    ['pulse', 'Puls', '142 BPM'],
    ['gDial', 'G-Ball & Vertikallast', 'Punkte mit 3-Sekunden-Schweif'],
    ['gValues', 'G-Achsen', 'LAT +0.8 · VERT +2.4 · LONG −0.5'],
    ['speed', 'Geschwindigkeit', '87 KM/H'],
    ['compass', 'Kompass', '032° · NO'],
    ['vibration', 'Vibration', '6.8 m/s²'],
    ['dynamics', 'Fahrdynamik', '2.58 G · 4.1 G/s']
  ];
  const BASE = {
    landscape: {
      pulse: {x:.02,y:.62,w:.29,h:.31}, gDial:{x:.33,y:.44,w:.34,h:.36}, gValues:{x:.33,y:.82,w:.34,h:.11},
      speed:{x:.70,y:.61,w:.28,h:.33}, compass:{x:.41,y:.04,w:.18,h:.18}, vibration:{x:.80,y:.06,w:.18,h:.24}, dynamics:{x:.03,y:.06,w:.24,h:.18}
    },
    portrait: {
      vibration:{x:.04,y:.03,w:.42,h:.13}, dynamics:{x:.54,y:.03,w:.42,h:.13}, compass:{x:.33,y:.17,w:.34,h:.13}, gDial:{x:.08,y:.28,w:.84,h:.27},
      gValues:{x:.07,y:.57,w:.86,h:.10}, pulse:{x:.05,y:.69,w:.43,h:.25}, speed:{x:.52,y:.69,w:.43,h:.25}
    }
  };

  const css = document.createElement('style');
  css.id = 'rtStandaloneHudEditorStyle';
  css.textContent = `
    #rtStandaloneHudEditor{position:fixed;inset:0;z-index:2147483000;background:#02070d;color:#f5fbff;display:none;overflow:hidden;overscroll-behavior:none;touch-action:none;font-family:system-ui,-apple-system,sans-serif}
    #rtStandaloneHudEditor.open{display:grid;grid-template-rows:auto minmax(0,1fr)}
    .rt-hud-top{display:flex;align-items:center;gap:10px;padding:max(10px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left));background:#07131f;border-bottom:1px solid #29435f}
    .rt-hud-top h2{margin:0;font-size:18px}.rt-hud-top .spacer{flex:1}.rt-hud-top button,.rt-hud-top select{background:#102436;color:#fff;border:1px solid #31536b;border-radius:10px;padding:9px 11px;font-weight:700}
    .rt-hud-body{min-height:0;display:grid;grid-template-columns:minmax(230px,320px) minmax(0,1fr);gap:12px;padding:12px;overflow:hidden}
    .rt-hud-sidebar{overflow:auto;overscroll-behavior:contain;background:#07131f;border:1px solid #29435f;border-radius:14px;padding:12px}
    .rt-hud-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:hidden;background:#000;border:1px solid #29435f;border-radius:14px}
    .rt-hud-stage{position:relative;background:radial-gradient(circle at 50% 25%,#214a57 0,#102331 38%,#050a0d 100%);box-shadow:0 0 0 1px #00e5ff55 inset;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
    .rt-hud-stage.landscape{aspect-ratio:16/9;width:min(100%,calc((100dvh - 110px)*16/9))}.rt-hud-stage.portrait{aspect-ratio:9/16;height:min(100%,calc(100dvh - 110px));max-width:100%}
    .rt-hud-grid{position:absolute;inset:0;background-image:linear-gradient(#ffffff0b 1px,transparent 1px),linear-gradient(90deg,#ffffff0b 1px,transparent 1px);background-size:5% 5%;pointer-events:none}
    .rt-hud-item{position:absolute;border:2px solid #00e5ff;border-radius:12px;background:rgba(6,20,22,.86);box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;padding:8px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}
    .rt-hud-item.dragging{cursor:grabbing;outline:3px solid #fff;z-index:100}.rt-hud-item.selected{box-shadow:0 0 0 2px #fff inset}
    .rt-hud-item .title{font-size:clamp(8px,1.1vw,16px);letter-spacing:.08em}.rt-hud-item .value{font-size:clamp(10px,2vw,28px);font-weight:850;font-variant-numeric:tabular-nums;color:#00e5ff}
    .rt-hud-grip{position:absolute;right:-10px;top:-10px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#00e5ff;color:#061416;border:2px solid #fff;font-weight:900;touch-action:none}
    .rt-hud-control{border:1px solid #29435f;border-radius:12px;padding:10px;margin:0 0 9px;background:#0b1b29}.rt-hud-control.active{border-color:#00e5ff}.rt-hud-control button{width:100%;text-align:left;background:transparent;color:#fff;border:0;font-weight:750;padding:0}
    .rt-hud-control label{display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px;margin-top:8px;font-size:12px}.rt-hud-control input[type=range]{width:120px}
    @media (orientation:portrait), (max-width:760px){.rt-hud-body{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) minmax(150px,34dvh)}.rt-hud-sidebar{grid-row:2}.rt-hud-stage-wrap{grid-row:1}.rt-hud-stage.landscape{width:min(100%,calc((66dvh - 70px)*16/9))}.rt-hud-stage.portrait{height:min(100%,calc(66dvh - 70px))}}
  `;
  document.head.appendChild(css);

  function loadConfig() {
    let config = {};
    try { config = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) {}
    config.profiles ||= {};
    for (const mode of ['landscape','portrait']) {
      config.profiles[mode] ||= { panelOpacity:.86, globalOpacity:1, fontScale:1, elements:{} };
      config.profiles[mode].elements ||= {};
      for (const [key] of ELEMENTS) {
        const b = BASE[mode][key];
        config.profiles[mode].elements[key] ||= { visible:true, x:b.x, y:b.y, width:b.w, height:b.h, scale:1, opacity:1, fontScale:1 };
      }
    }
    return config;
  }
  let config = loadConfig();
  if (config.gForceVisualizerVersion !== 2) {
    const oldLandscape=config.profiles.landscape.elements.gDial,oldPortrait=config.profiles.portrait.elements.gDial;
    if(Math.abs(Number(oldLandscape.width)-.17)<.001&&Math.abs(Number(oldLandscape.height)-.30)<.001)Object.assign(oldLandscape,{x:BASE.landscape.gDial.x,y:BASE.landscape.gDial.y,width:BASE.landscape.gDial.w,height:BASE.landscape.gDial.h});
    if(Math.abs(Number(oldPortrait.width)-.64)<.001&&Math.abs(Number(oldPortrait.height)-.21)<.001)Object.assign(oldPortrait,{x:BASE.portrait.gDial.x,y:BASE.portrait.gDial.y,width:BASE.portrait.gDial.w,height:BASE.portrait.gDial.h});
    config.gForceVisualizerVersion=2;localStorage.setItem(STORAGE_KEY,JSON.stringify(config));
  }
  let mode = matchMedia('(orientation:portrait)').matches ? 'portrait' : 'landscape';
  let selected = 'pulse';
  let drag = null;

  const root = document.createElement('section');
  root.id = 'rtStandaloneHudEditor';
  root.innerHTML = `<div class="rt-hud-top"><h2>HUD-Layout</h2><select id="rtHudMode"><option value="portrait">Hochformat 9:16</option><option value="landscape">Querformat 16:9</option></select><div class="spacer"></div><button id="rtHudReset">Zurücksetzen</button><button id="rtHudDone">Fertig</button></div><div class="rt-hud-body"><aside class="rt-hud-sidebar"></aside><div class="rt-hud-stage-wrap"><div class="rt-hud-stage"><div class="rt-hud-grid"></div></div></div></div>`;
  document.body.appendChild(root);
  const stage = root.querySelector('.rt-hud-stage');
  const sidebar = root.querySelector('.rt-hud-sidebar');
  const modeSelect = root.querySelector('#rtHudMode');

  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); }
  function profile() { return config.profiles[mode]; }
  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function applyItem(el,key) {
    const e = profile().elements[key];
    el.hidden = e.visible === false;
    el.style.left = `${e.x*100}%`; el.style.top = `${e.y*100}%`;
    el.style.width = `${e.width*(e.scale||1)*100}%`; el.style.height = `${e.height*(e.scale||1)*100}%`;
    el.style.opacity = String((e.opacity ?? 1) * (profile().globalOpacity ?? 1));
    el.style.background = `rgba(6,20,22,${profile().panelOpacity ?? .86})`;
    el.style.fontSize = `${(e.fontScale||1)*(profile().fontScale||1)}em`;
    el.classList.toggle('selected',key===selected);
  }
  function render() {
    stage.className = `rt-hud-stage ${mode}`;
    modeSelect.value = mode;
    stage.querySelectorAll('.rt-hud-item').forEach(n=>n.remove());
    for (const [key,label,value] of ELEMENTS) {
      const el=document.createElement('div'); el.className='rt-hud-item'; el.dataset.key=key;
      el.innerHTML=`<span class="title">${label}</span><span class="value">${value}</span><span class="rt-hud-grip" aria-label="${label} verschieben">✥</span>`;
      stage.appendChild(el); applyItem(el,key);
    }
    sidebar.innerHTML = ELEMENTS.map(([key,label]) => {
      const e=profile().elements[key];
      return `<div class="rt-hud-control ${key===selected?'active':''}" data-control="${key}"><button type="button" data-select="${key}">${label}</button><label>Sichtbar <input data-key="${key}" data-prop="visible" type="checkbox" ${e.visible!==false?'checked':''}></label><label>Größe <input data-key="${key}" data-prop="scale" type="range" min=".3" max="2.5" step=".05" value="${e.scale||1}"></label><label>Deckkraft <input data-key="${key}" data-prop="opacity" type="range" min=".1" max="1" step=".05" value="${e.opacity??1}"></label></div>`;
    }).join('');
  }

  function stagePoint(event){ const r=stage.getBoundingClientRect(); return {x:event.clientX-r.left,y:event.clientY-r.top,w:r.width,h:r.height}; }
  function startDrag(event, el) {
    const key=el.dataset.key, p=stagePoint(event), e=profile().elements[key];
    selected=key; drag={pointerId:event.pointerId,key,startX:p.x,startY:p.y,originX:e.x,originY:e.y};
    el.classList.add('dragging'); el.setPointerCapture?.(event.pointerId); event.preventDefault(); event.stopPropagation(); renderSelectionOnly();
  }
  function renderSelectionOnly(){ stage.querySelectorAll('.rt-hud-item').forEach(el=>el.classList.toggle('selected',el.dataset.key===selected)); sidebar.querySelectorAll('.rt-hud-control').forEach(el=>el.classList.toggle('active',el.dataset.control===selected)); }
  stage.addEventListener('pointerdown', event => { const el=event.target.closest('.rt-hud-item'); if(el) startDrag(event,el); }, {capture:true});
  stage.addEventListener('pointermove', event => {
    if(!drag || drag.pointerId!==event.pointerId) return;
    const p=stagePoint(event), e=profile().elements[drag.key], width=e.width*(e.scale||1), height=e.height*(e.scale||1);
    e.x=clamp(drag.originX+(p.x-drag.startX)/p.w,0,1-width); e.y=clamp(drag.originY+(p.y-drag.startY)/p.h,0,1-height);
    const el=stage.querySelector(`[data-key="${drag.key}"]`); applyItem(el,drag.key); save(); event.preventDefault();
  }, {capture:true});
  const endDrag = event => { if(!drag || (event.pointerId!=null&&drag.pointerId!==event.pointerId)) return; stage.querySelector(`[data-key="${drag.key}"]`)?.classList.remove('dragging'); drag=null; save(); };
  stage.addEventListener('pointerup',endDrag,{capture:true}); stage.addEventListener('pointercancel',endDrag,{capture:true});
  sidebar.addEventListener('click', e=>{ const b=e.target.closest('[data-select]'); if(b){selected=b.dataset.select;renderSelectionOnly();} });
  sidebar.addEventListener('input', e=>{ const input=e.target.closest('[data-key]'); if(!input)return; const item=profile().elements[input.dataset.key]; item[input.dataset.prop]=input.type==='checkbox'?input.checked:Number(input.value); applyItem(stage.querySelector(`[data-key="${input.dataset.key}"]`),input.dataset.key); save(); });
  modeSelect.onchange=()=>{mode=modeSelect.value;selected='pulse';render();};
  root.querySelector('#rtHudReset').onclick=()=>{ for(const [key] of ELEMENTS){const b=BASE[mode][key];profile().elements[key]={visible:true,x:b.x,y:b.y,width:b.w,height:b.h,scale:1,opacity:1,fontScale:1};} save();render();};

  async function enterEditorFullscreen(){
    root.classList.add('open'); document.documentElement.style.overflow='hidden'; document.body.style.overflow='hidden'; render();
    // The editor already fills the visual viewport through CSS. Native fullscreen
    // puts Chromium's top layer between the editor and the app and can leave the
    // underlying navigation non-interactive after exit on some devices.
  }
  async function closeEditor(){
    try { if(document.fullscreenElement) await document.exitFullscreen(); else if(document.webkitFullscreenElement&&document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch(_) {}
    root.classList.remove('open'); document.documentElement.style.overflow=''; document.body.style.overflow=''; save();
  }
  root.querySelector('#rtHudDone').onclick=closeEditor;

  window.RideTrackerStandaloneHudEditor = { open: enterEditorFullscreen, close: closeEditor };
  document.addEventListener('click', event => {
    const route=event.target.closest?.('[data-route="HUD-Konfiguration"],.rt-dashboard-hud,[data-setting="hud"]');
    if(!route) return;
    event.preventDefault(); event.stopImmediatePropagation();
    document.getElementById('rtNavDrawer')?.classList.remove('open'); document.getElementById('rtNavScrim')?.classList.remove('open');
    enterEditorFullscreen();
  }, true);
})();
