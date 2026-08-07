(() => {
  'use strict';
  const byId = id => document.getElementById(id);

  const style = document.createElement('style');
  style.id = 'rtFrontendFixes51Style';
  style.textContent = `
    #rtStandaloneHudEditor{width:100vw!important;height:100dvh!important;max-width:100vw!important;max-height:100dvh!important;box-sizing:border-box!important}
    #rtStandaloneHudEditor .rt-hud-top{min-width:0!important;max-width:100vw!important;box-sizing:border-box!important;flex-wrap:nowrap!important}
    #rtStandaloneHudEditor .rt-hud-body{width:100%!important;max-width:100vw!important;min-width:0!important;min-height:0!important;box-sizing:border-box!important;overflow:hidden!important}
    #rtStandaloneHudEditor .rt-hud-stage-wrap{min-width:0!important;max-width:100%!important;min-height:0!important;box-sizing:border-box!important;overflow:hidden!important;display:flex!important;align-items:center!important;justify-content:center!important}
    #rtStandaloneHudEditor .rt-hud-stage{flex:0 0 auto!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;box-sizing:border-box!important}
    #rtStandaloneHudEditor .rt-hud-sidebar{min-width:0!important;min-height:0!important;box-sizing:border-box!important}
    @media (orientation:portrait),(max-width:760px){
      #rtStandaloneHudEditor.open{grid-template-rows:auto minmax(0,1fr)!important}
      #rtStandaloneHudEditor .rt-hud-body{display:grid!important;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:minmax(190px,48%) minmax(0,52%)!important;gap:8px!important;padding:8px!important;height:100%!important}
      #rtStandaloneHudEditor .rt-hud-stage-wrap{grid-row:1!important;width:100%!important;height:100%!important}
      #rtStandaloneHudEditor .rt-hud-sidebar{grid-row:2!important;width:100%!important;height:100%!important;overflow:auto!important}
      #rtStandaloneHudEditor .rt-hud-top h2{font-size:16px!important;white-space:nowrap!important}
      #rtStandaloneHudEditor .rt-hud-top{gap:6px!important;padding-left:8px!important;padding-right:8px!important}
      #rtStandaloneHudEditor .rt-hud-top button,#rtStandaloneHudEditor .rt-hud-top select{padding:8px 9px!important;font-size:12px!important;min-width:0!important}
      #rtHudOrientationInfo{display:none!important}
    }
    @media (orientation:landscape) and (max-height:600px){
      #rtStandaloneHudEditor .rt-hud-body{display:grid!important;grid-template-columns:clamp(210px,30vw,310px) minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr)!important;gap:8px!important;padding:8px!important;height:100%!important}
      #rtStandaloneHudEditor .rt-hud-sidebar{grid-column:1!important;grid-row:1!important;height:100%!important;overflow:auto!important}
      #rtStandaloneHudEditor .rt-hud-stage-wrap{grid-column:2!important;grid-row:1!important;width:100%!important;height:100%!important}
      #rtStandaloneHudEditor .rt-hud-top{padding-top:max(6px,env(safe-area-inset-top))!important;padding-bottom:6px!important}
    }
    .rt-camera-diagnostic{margin-top:10px;border:1px solid #29435f;border-radius:12px;overflow:hidden;background:#02070d}
    .rt-camera-diagnostic video{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}
    .rt-camera-diagnostic-controls{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px}
    .rt-camera-diagnostic-controls span{font-size:12px;color:#96aac1}
    .rt-camera-diagnostic-controls button{padding:8px 10px!important}
  `;
  document.head.appendChild(style);

  function viewportSize() {
    const vv = window.visualViewport;
    return {
      width: Math.max(240, Math.floor(vv?.width || window.innerWidth || document.documentElement.clientWidth || 320)),
      height: Math.max(240, Math.floor(vv?.height || window.innerHeight || document.documentElement.clientHeight || 480))
    };
  }

  function fitHudStage51() {
    const root = byId('rtStandaloneHudEditor');
    const wrap = root?.querySelector('.rt-hud-stage-wrap');
    const stage = root?.querySelector('.rt-hud-stage');
    if (!root?.classList.contains('open') || !wrap || !stage) return;

    const mode = byId('rtHudMode')?.value || (matchMedia('(orientation:portrait)').matches ? 'portrait' : 'landscape');
    const ratio = mode === 'portrait' ? 9 / 16 : 16 / 9;
    const vp = viewportSize();
    const rootRect = root.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const padding = 12;

    // Never trust an overflowing grid measurement: clamp against the actual Safari visual viewport.
    const viewportLeft = Math.max(0, wrapRect.left - rootRect.left);
    const viewportTop = Math.max(0, wrapRect.top - rootRect.top);
    const maxByViewportW = Math.max(120, vp.width - viewportLeft - padding);
    const maxByViewportH = Math.max(120, vp.height - viewportTop - padding);
    const availableW = Math.max(120, Math.min(wrap.clientWidth || wrapRect.width, wrapRect.width, maxByViewportW) - 8);
    const availableH = Math.max(120, Math.min(wrap.clientHeight || wrapRect.height, wrapRect.height, maxByViewportH) - 8);

    let width = Math.min(availableW, availableH * ratio);
    let height = width / ratio;
    if (height > availableH) { height = availableH; width = height * ratio; }
    if (width > availableW) { width = availableW; height = width / ratio; }

    stage.style.setProperty('width', `${Math.max(100, Math.floor(width))}px`, 'important');
    stage.style.setProperty('height', `${Math.max(100, Math.floor(height))}px`, 'important');
    stage.style.setProperty('aspect-ratio', mode === 'portrait' ? '9 / 16' : '16 / 9', 'important');
    stage.style.setProperty('max-width', `${Math.floor(availableW)}px`, 'important');
    stage.style.setProperty('max-height', `${Math.floor(availableH)}px`, 'important');
  }

  let fitRaf = 0;
  function scheduleFit51() {
    cancelAnimationFrame(fitRaf);
    fitRaf = requestAnimationFrame(() => {
      fitHudStage51();
      setTimeout(fitHudStage51, 60);
      setTimeout(fitHudStage51, 180);
    });
  }

  window.addEventListener('resize', scheduleFit51, { passive:true });
  window.addEventListener('orientationchange', scheduleFit51, { passive:true });
  window.visualViewport?.addEventListener?.('resize', scheduleFit51, { passive:true });
  window.visualViewport?.addEventListener?.('scroll', scheduleFit51, { passive:true });
  screen.orientation?.addEventListener?.('change', scheduleFit51);
  document.addEventListener('change', event => { if (event.target?.id === 'rtHudMode') scheduleFit51(); }, true);

  const rootObserver = new MutationObserver(() => scheduleFit51());
  function observeHud51() {
    const root = byId('rtStandaloneHudEditor');
    if (!root || root.dataset.rt51Observed) return;
    root.dataset.rt51Observed = '1';
    rootObserver.observe(root, { attributes:true, attributeFilter:['class'], childList:true, subtree:true });
    scheduleFit51();
  }

  // Safari clears Event.currentTarget after await. Handle the permission button in capture phase
  // and keep a stable button reference, preventing the older async listener from running.
  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-motion-live]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled = true;
    button.textContent = 'Berechtigung wird geprüft …';
    let ok = true;
    try {
      if (typeof DeviceMotionEvent?.requestPermission === 'function') ok = (await DeviceMotionEvent.requestPermission()) === 'granted';
    } catch (_) { ok = false; }
    if (!button.isConnected) return;
    button.textContent = ok ? 'Sensor aktiv ✓' : 'Berechtigung erforderlich';
    button.disabled = ok;
  }, true);

  async function cameraStream() {
    const plugins = window.RideTrackerWebPlugins;
    if (!plugins?.invoke) return null;
    try {
      const existing = await plugins.invoke('camera-source', 'previewStream');
      if (existing?.getVideoTracks?.().some(track => track.readyState === 'live')) return existing;
    } catch (_) {}
    return null;
  }

  async function activateCameraDiagnostic(card, forcePermission = false) {
    const host = card?.querySelector('.rt-camera-diagnostic');
    const video = host?.querySelector('video');
    const button = host?.querySelector('[data-camera-live]');
    const status = host?.querySelector('[data-camera-status]');
    if (!host || !video) return;
    let stream = await cameraStream();
    if (!stream && forcePermission) {
      try { stream = await window.RideTrackerWebPlugins?.invoke?.('camera-source', 'ensurePreview'); }
      catch (error) { if (status) status.textContent = `Kamera nicht verfügbar: ${error?.message || error}`; }
    }
    if (stream) {
      if (video.srcObject !== stream) video.srcObject = stream;
      video.muted = true; video.autoplay = true; video.playsInline = true; video.setAttribute('playsinline','');
      try { await video.play(); } catch (_) {}
      if (status) status.textContent = 'Livebild aktiv';
      if (button) { button.textContent = 'Livebild aktiv ✓'; button.disabled = true; }
    } else {
      if (status) status.textContent = 'Kamera noch nicht aktiviert';
      if (button) { button.textContent = 'Livebild aktivieren'; button.disabled = false; }
    }
  }

  function enhanceCameraCard(card) {
    if (!card || card.dataset.rtCameraPreview51) return;
    card.dataset.rtCameraPreview51 = '1';
    const diagnostic = card.querySelector('.rt-sensor-diagnostic-v2') || card.querySelector('.rt-sensor-diagnostic');
    if (!diagnostic) { delete card.dataset.rtCameraPreview51; return; }
    diagnostic.querySelector('.rt-live-v2-chart, .rt-sensor-chart')?.style.setProperty('display','none','important');
    let host = diagnostic.querySelector('.rt-camera-diagnostic');
    if (!host) {
      host = document.createElement('div');
      host.className = 'rt-camera-diagnostic';
      host.innerHTML = '<video muted autoplay playsinline></video><div class="rt-camera-diagnostic-controls"><span data-camera-status>Kamera noch nicht aktiviert</span><button type="button" data-camera-live>Livebild aktivieren</button></div>';
      const purpose = diagnostic.querySelector('.rt-live-v2-purpose,.rt-sensor-purpose');
      purpose?.insertAdjacentElement('afterend', host);
      host.querySelector('[data-camera-live]').addEventListener('click', event => {
        event.preventDefault();
        const stableCard = event.currentTarget.closest('.rt-device');
        void activateCameraDiagnostic(stableCard, true);
      });
    }
    void activateCameraDiagnostic(card, false);
  }

  function syncCameraDiagnostics() {
    document.querySelectorAll('#rtDeviceCenter .rt-device[data-id="phone-camera"],#rtDeviceCenter .rt-device[data-id="external-camera"]').forEach(enhanceCameraCard);
    const state = window.RideTrackerWebPlugins?.get?.('camera-source');
    if (state) window.RideTrackerLiveSensorDiagnostics?.ingest?.('phone-camera', { preview:state.previewActive ? 1 : 0, recording:state.recordingActive ? 1 : 0 });
  }

  const bodyObserver = new MutationObserver(() => {
    requestAnimationFrame(() => {
      observeHud51();
      syncCameraDiagnostics();
    });
  });

  function install() {
    observeHud51();
    syncCameraDiagnostics();
    bodyObserver.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class','open'] });
    window.addEventListener('ridetracker:web-plugins-ready', syncCameraDiagnostics);
    window.addEventListener('ridetracker:camera-plugin-preview', syncCameraDiagnostics);
    window.addEventListener('ridetracker:recording-started', syncCameraDiagnostics);
    window.addEventListener('ridetracker:recording-stopped', syncCameraDiagnostics);
    setInterval(syncCameraDiagnostics, 750);
    window.RideTrackerHudStageFit = { ...(window.RideTrackerHudStageFit || {}), fit:fitHudStage51 };
    window.RideTrackerCameraDiagnostics = { refresh:syncCameraDiagnostics, activate:activateCameraDiagnostic };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true }); else install();
})();
