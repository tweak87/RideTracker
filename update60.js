(() => {
  'use strict';

  const STORAGE_KEY = 'rideTracker.diagnostics.log.v1';
  const ENABLE_KEY = 'rideTracker.diagnostics.enabled.v1';
  const MAX_LOGS = 500;
  const query = new URLSearchParams(location.search);
  const state = {
    enabled: query.get('diag') === '1' || localStorage.getItem(ENABLE_KEY) === '1',
    logs: [],
    bootAt: performance.now(),
    lastRoute: null,
    lastNavigationAudit: null,
    bootRecovery: null,
  };

  function nowIso() { return new Date().toISOString(); }
  function safeValue(value, depth = 0) {
    if (depth > 3) return '[max-depth]';
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Error) return { name:value.name, message:value.message, stack:value.stack || null };
    if (value instanceof Blob) return { type:'Blob', size:value.size, mime:value.type };
    if (Array.isArray(value)) return value.slice(0, 30).map(item => safeValue(item, depth + 1));
    if (typeof value === 'object') {
      const out = {};
      for (const [key, item] of Object.entries(value).slice(0, 50)) {
        // Exact coordinates are intentionally excluded from ordinary diagnostics.
        if (/^(lat|latitude|lon|lng|longitude)$/i.test(key)) continue;
        out[key] = safeValue(item, depth + 1);
      }
      return out;
    }
    return String(value);
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.logs.slice(-MAX_LOGS))); } catch (_) {}
  }
  function add(level, source, message, detail = null) {
    const item = { at:nowIso(), tMs:Math.round(performance.now()), level, source, message:String(message || ''), detail:safeValue(detail) };
    state.logs.push(item);
    if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS);
    if (state.enabled || level === 'error') persist();
    renderBadge();
    return item;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) state.logs = saved.slice(-MAX_LOGS);
  } catch (_) {}

  function isRecording() {
    return document.getElementById('stop')?.disabled === false || Boolean(window.RideTrackerRecordingFullscreen?.isRecording?.());
  }

  async function closeKnownBlockers({ forceHome = false } = {}) {
    if (isRecording()) return { skipped:'recording' };
    const closed = [];
    const activeDialog = window.RideTrackerDialogManager?.active?.() || null;
    try {
      await window.RideTrackerDialogManager?.closeAll?.('safe-boot');
      if (activeDialog) closed.push(`dialog:${activeDialog}`);
    } catch (error) { add('warn','boot','Dialog recovery failed',error); }
    const removeOpen = id => {
      const node = document.getElementById(id);
      if (!node) return;
      if (node.classList.contains('open')) { node.classList.remove('open'); closed.push(id); }
    };
    ['rtCanonicalScrim','rtInlineScrim','rtNavScrim','rtCanonicalDrawer','rtInlineDrawer','rtNavDrawer','rtSourceRouting'].forEach(removeOpen);

    const exportDialog = document.getElementById('rtExportDialog');
    if (exportDialog && !exportDialog.hidden) { exportDialog.hidden = true; closed.push('rtExportDialog'); }

    const hud = document.getElementById('rtStandaloneHudEditor');
    try { await window.RideTrackerStandaloneHudEditor?.close?.(); }
    catch (error) { add('warn','boot','HUD recovery failed',error); }
    if (hud?.classList.contains('open')) { hud.classList.remove('open'); closed.push('rtStandaloneHudEditor'); }
    const device = document.getElementById('rtDeviceCenter');
    if (device?.classList.contains('open')) { device.classList.remove('open'); closed.push('rtDeviceCenter'); }
    document.querySelectorAll('.rt-home-panel.open').forEach(panel=>{panel.classList.remove('open');closed.push('rt-home-panel');});

    document.body.classList.remove('rt-dialog-open','rt-navigation-open','rt-hud-editor-open');
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) await document.webkitExitFullscreen();
    } catch (error) { add('warn','boot','Fullscreen recovery failed',error); }
    document.documentElement.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('pointer-events');
    document.documentElement.removeAttribute('inert');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('pointer-events');
    document.body.removeAttribute('inert');

    if (forceHome) {
      try {
        window.RideTrackerFrontendNavigation?.ensureHome?.();
        if (window.RideTrackerFrontendNavigation?.home) window.RideTrackerFrontendNavigation.home();
        else if (window.RideTrackerNavigationRegistry?.navigate) void window.RideTrackerNavigationRegistry.navigate('home');
      } catch (error) { add('error','boot','Home recovery failed',error); }
      const inline = document.getElementById('rtInlineDashboard');
      if (inline) inline.hidden = false;
      document.body.dataset.rtRoute = 'home';
    }

    const actions = document.querySelectorAll('#rtInlineDashboard [data-registry-route],#rtInlineDashboard button');
    actions.forEach(button => {
      button.style.removeProperty('pointer-events');
      button.removeAttribute('inert');
      button.disabled = false;
    });

    return { closed, homeActions:actions.length, route:document.body.dataset.rtRoute || null };
  }

  function bootAudit() {
    const registry = window.RideTrackerNavigationRegistry;
    let navigationAudit = null;
    try { navigationAudit = registry?.audit?.() || null; } catch (error) { add('error','boot','Navigation audit failed',error); }
    state.lastNavigationAudit = navigationAudit;
    const inline = document.getElementById('rtInlineDashboard');
    const blockers = ['rtCanonicalScrim','rtInlineScrim','rtNavScrim','rtExportDialog','rtStandaloneHudEditor','rtDeviceCenter'].map(id => {
      const node = document.getElementById(id); if (!node) return null;
      const cs = getComputedStyle(node);
      return { id, display:cs.display, visibility:cs.visibility, pointerEvents:cs.pointerEvents, open:node.classList.contains('open'), hidden:Boolean(node.hidden) };
    }).filter(Boolean);
    const result = {
      route:document.body.dataset.rtRoute || null,
      inlineDashboard:Boolean(inline),
      inlineHidden:inline ? Boolean(inline.hidden) : null,
      navigationRegistry:Boolean(registry),
      navigationAudit,
      blockers,
      gps:Boolean(window.RideTrackerGpsHealth),
      gpsCapture:Boolean(window.RideTrackerGpsCapture),
      database:Boolean(window.RideTrackerDatabase),
      pluginHost:Boolean(window.RideTrackerWebPlugins),
    };
    add('info','boot','Runtime audit',result);
    return result;
  }

  function pluginSnapshot() {
    try {
      if (window.RideTrackerSensorChannelRegistry?.snapshot) return window.RideTrackerSensorChannelRegistry.snapshot();
      return null;
    } catch (error) { return { error:error.message }; }
  }

  async function databaseSnapshot() {
    const db = window.RideTrackerDatabase;
    if (!db) return { ready:false };
    const result = { ready:true, stores:{...db.stores} };
    try { result.ridePackages = (await db.getAll(db.stores.ridePackages) || []).length; } catch (error) { result.ridePackagesError = error.message; }
    try { result.videos = (await db.getAll(db.stores.videos) || []).length; } catch (error) { result.videosError = error.message; }
    return result;
  }

  function runtimeVersion() {
    const script = [...document.scripts].find(s => /update60\.js/.test(s.src || ''));
    try { return new URL(script?.src || location.href).searchParams.get('v') || null; } catch { return null; }
  }

  async function snapshot() {
    let gps = null;
    try { gps = window.RideTrackerGpsHealth?.snapshot?.() || null; } catch (error) { gps = { error:error.message }; }
    if (gps && typeof gps === 'object') {
      delete gps.latitude; delete gps.longitude; delete gps.lat; delete gps.lon;
    }
    return {
      generatedAt:nowIso(),
      app:{ commit:runtimeVersion(), url:`${location.origin}${location.pathname}`, route:document.body.dataset.rtRoute || null, visibility:document.visibilityState },
      browser:{ userAgent:navigator.userAgent, language:navigator.language, online:navigator.onLine, viewport:{width:innerWidth,height:innerHeight}, visualViewport:window.visualViewport?{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}:null },
      boot:{ uptimeMs:Math.round(performance.now()-state.bootAt), recovery:state.bootRecovery, audit:bootAudit() },
      gps:safeValue(gps),
      sensorChannels:safeValue(pluginSnapshot()),
      database:await databaseSnapshot(),
      logs:state.logs.slice(-300),
    };
  }

  async function exportReport() {
    const report = await snapshot();
    const blob = new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RideTracker-Diagnose-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    add('info','diagnostics','Diagnostic report exported');
  }

  function ensurePanel() {
    let panel = document.getElementById('rtDiagnostics60');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'rtDiagnostics60';
    panel.hidden = true;
    panel.innerHTML = `<div class="rt60-card"><div class="rt60-head"><div><b>RideTracker Diagnose</b><small>Runtime, Navigation, GPS, Plugins und Storage</small></div><button data-close>×</button></div><div class="rt60-status" data-status></div><div class="rt60-actions"><button data-audit>Prüfen & UI freigeben</button><button data-export>Diagnose exportieren</button><button data-clear>Log leeren</button><button data-disable>Diagnosemodus aus</button></div><pre data-log></pre></div>`;
    document.body.appendChild(panel);
    panel.querySelector('[data-close]').onclick=()=>{panel.hidden=true};
    panel.querySelector('[data-audit]').onclick=async()=>{state.bootRecovery=await closeKnownBlockers({forceHome:true});bootAudit();renderPanel();};
    panel.querySelector('[data-export]').onclick=()=>void exportReport();
    panel.querySelector('[data-clear]').onclick=()=>{state.logs=[];persist();renderPanel();};
    panel.querySelector('[data-disable]').onclick=()=>disable();
    return panel;
  }

  function renderPanel() {
    const panel=ensurePanel();
    const gps=window.RideTrackerGpsHealth?.snapshot?.();
    panel.querySelector('[data-status]').textContent = `Route: ${document.body.dataset.rtRoute || '–'} · GPS: ${gps?.points||0} Punkte · ${Number(gps?.speedKmh||0).toFixed(1)} km/h · Log: ${state.logs.length}`;
    panel.querySelector('[data-log]').textContent = state.logs.slice(-40).map(item=>`${item.at.slice(11,19)} ${item.level.toUpperCase()} ${item.source}: ${item.message}`).join('\n') || 'Noch keine Logeinträge.';
  }
  function renderBadge() {
    const button=document.getElementById('rtDiagnosticsButton60');
    if(button)button.textContent=`DIAG ${state.logs.filter(x=>x.level==='error').length||''}`.trim();
    if(!document.getElementById('rtDiagnostics60')?.hidden)renderPanel();
  }

  function enable() {
    state.enabled=true; localStorage.setItem(ENABLE_KEY,'1');
    ensureUi(); add('info','diagnostics','Diagnostics enabled');
  }
  function disable() {
    state.enabled=false; localStorage.removeItem(ENABLE_KEY);
    document.getElementById('rtDiagnosticsButton60')?.remove();
    document.getElementById('rtDiagnostics60')?.setAttribute('hidden','');
  }
  function ensureUi() {
    if(!state.enabled)return;
    ensurePanel();
    let button=document.getElementById('rtDiagnosticsButton60');
    if(!button){
      button=document.createElement('button');button.id='rtDiagnosticsButton60';button.type='button';button.textContent='DIAG';button.title='RideTracker Diagnose öffnen';
      document.body.appendChild(button);button.onclick=()=>{const panel=ensurePanel();panel.hidden=!panel.hidden;if(!panel.hidden)renderPanel();};
    }
    renderBadge();
  }

  const style=document.createElement('style');
  style.id='rtDiagnostics60Style';
  style.textContent=`#rtDiagnosticsButton60{position:fixed;right:max(10px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483646;padding:7px 10px;border:1px solid #5fd0ff;border-radius:999px;background:#071522;color:#5fd0ff;font:800 11px system-ui}#rtDiagnostics60{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.72);padding:max(16px,env(safe-area-inset-top)) 12px max(16px,env(safe-area-inset-bottom));overflow:auto;color:#f5fbff}#rtDiagnostics60[hidden]{display:none!important}.rt60-card{max-width:760px;margin:auto;border:1px solid #35536f;border-radius:18px;background:#091626;padding:14px}.rt60-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.rt60-head b{font-size:19px}.rt60-head small{display:block;color:#96aac1;margin-top:3px}.rt60-head button{padding:6px 10px}.rt60-status{margin:12px 0;padding:9px;border-radius:10px;background:#07111f;color:#96aac1;font-size:12px}.rt60-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.rt60-actions button{padding:10px}.rt60-card pre{margin:12px 0 0;max-height:48vh;overflow:auto;white-space:pre-wrap;background:#030a11;border-radius:10px;padding:10px;color:#bcd0e4;font:11px/1.45 ui-monospace,monospace}@media(max-width:560px){.rt60-actions{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  const originalWarn=console.warn.bind(console), originalError=console.error.bind(console);
  console.warn=(...args)=>{add('warn','console',String(args[0]??''),args.slice(1));originalWarn(...args);};
  console.error=(...args)=>{add('error','console',String(args[0]??''),args.slice(1));originalError(...args);};
  window.addEventListener('error',event=>add('error','window',event.message||'window error',{filename:event.filename,lineno:event.lineno,colno:event.colno,error:event.error}));
  window.addEventListener('unhandledrejection',event=>add('error','promise',event.reason?.message||String(event.reason||'unhandled rejection'),event.reason));

  const watchedEvents=['ridetracker:recording-started','ridetracker:recording-stopped','ridetracker:recording-gps-error','ridetracker:ride-saved','ridetracker:ride-validated','ridetracker:navigation-audit','ridetracker:plugin-connection','ridetracker:source-switch'];
  for(const name of watchedEvents)window.addEventListener(name,event=>{if(name==='ridetracker:navigation-audit')state.lastNavigationAudit=safeValue(event.detail);add('info','event',name,event.detail);});
  let lastGpsLog=0;
  window.addEventListener('ridetracker:gps-health',event=>{if(performance.now()-lastGpsLog<2000)return;lastGpsLog=performance.now();add('info','gps','health',event.detail);});

  function boot() {
    // Give all legacy layers time to install, then normalize stale state once.
    setTimeout(async()=>{
      const route=document.body.dataset.rtRoute || 'home';
      const shouldRecover=!isRecording() && (route==='home' || !route);
      state.bootRecovery=await closeKnownBlockers({forceHome:shouldRecover});
      add('info','boot','Boot recovery',state.bootRecovery);
      bootAudit(); ensureUi();
    },700);
    setTimeout(()=>{bootAudit();ensureUi();},2500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('pageshow',()=>setTimeout(async()=>{state.bootRecovery=await closeKnownBlockers({forceHome:!isRecording() && (document.body.dataset.rtRoute||'home')==='home'});bootAudit();},120));

  window.RideTrackerDiagnostics={enable,disable,open:()=>{enable();const panel=ensurePanel();panel.hidden=false;renderPanel();},export:exportReport,snapshot,safeBoot:()=>closeKnownBlockers({forceHome:true}),log:add,isEnabled:()=>state.enabled};
})();
