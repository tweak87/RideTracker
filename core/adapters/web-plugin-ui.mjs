const target = globalThis.window;
if (target) {
  const byId = id => document.getElementById(id);
  const histories = new Map();
  const latest = new Map();
  let diagnosticsRegistry = null;

  const style = document.createElement('style');
  style.id = 'rtPluginUi48Style';
  style.textContent = `
    .rt-map-view{position:fixed!important;left:0!important;right:0!important;top:calc(max(env(safe-area-inset-top),12px) + 58px)!important;bottom:0!important;z-index:2050000!important;background:#07111f!important;overflow:auto!important;padding:14px 12px max(30px,env(safe-area-inset-bottom))!important;color:#f5fbff!important;display:block!important}
    .rt-sensor-diagnostic{margin-top:12px;padding:12px;border:1px solid #29435f;border-radius:14px;background:#07131f}.rt-sensor-purpose{color:#96aac1;font-size:13px;line-height:1.45;margin:6px 0 10px}.rt-sensor-live-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.rt-sensor-live-head strong{font-size:13px}.rt-sensor-live-status{font-size:11px;color:#5fd0ff}.rt-sensor-chart{display:block;width:100%;height:150px;border-radius:10px;background:#040b12;margin-top:8px}.rt-sensor-values{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.rt-sensor-value{padding:6px 8px;border:1px solid #29435f;border-radius:9px;font-size:12px}.rt-sensor-value b{color:#5fd0ff}.rt-sensor-hint{margin-top:8px;color:#758ba3;font-size:11px}
    .rt-export-progress{height:9px;border-radius:999px;background:#07111f;overflow:hidden;margin:12px 0}.rt-export-progress>i{display:block;height:100%;width:0;background:#5fd0ff;transition:width .15s linear}.rt-export-status{color:#96aac1;font-size:13px}
  `;
  document.head.appendChild(style);

  async function loadRegistry() {
    if (diagnosticsRegistry) return diagnosticsRegistry;
    try {
      const response = await fetch('shared/core/plugin-diagnostics.json', { cache: 'no-store' });
      diagnosticsRegistry = response.ok ? await response.json() : { devices: {} };
    } catch (_) { diagnosticsRegistry = { devices: {} }; }
    return diagnosticsRegistry;
  }

  const pushHistory = (deviceId, values) => {
    const now = performance.now();
    const record = { t: now, ...values };
    latest.set(deviceId, record);
    const list = histories.get(deviceId) || [];
    list.push(record);
    while (list.length > 180 || (list[0] && now - list[0].t > 30000)) list.shift();
    histories.set(deviceId, list);
  };

  function readNumber(id, fallback = NaN) {
    const text = byId(id)?.textContent || '';
    const match = String(text).replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : fallback;
  }

  function pollInternalSensors() {
    pushHistory('phone-motion', {
      lateralG: readNumber('latVal', 0),
      verticalG: readNumber('normalVal', 1),
      longitudinalG: readNumber('hudLong', 0),
      vibration: readNumber('vibrationValue', 0)
    });
    pushHistory('phone-gps', { speedKmh: readNumber('speed', 0) });
    pushHistory('ble-heart', { heartRateBpm: readNumber('heartRateValue', NaN) });
    const camera = target.RideTrackerWebPlugins?.get?.('camera-source');
    if (camera) pushHistory('phone-camera', { preview: camera.previewActive ? 1 : 0, recording: camera.recordingActive ? 1 : 0 });
  }
  setInterval(pollInternalSensors, 250);

  function mapPluginDevice(detail = {}) {
    const plugin = String(detail.pluginId || '');
    const source = String(detail.sourceId || detail.deviceId || '').toLowerCase();
    if (plugin === 'ble-heart-rate' || source.includes('ble-heart')) return 'ble-heart';
    if (plugin === 'external-imu' || source.includes('external-imu')) return 'external-imu';
    if (plugin === 'external-gnss' || source.includes('external-gnss')) return 'external-gnss';
    return null;
  }

  function consumeTelemetry(event) {
    const detail = event.detail || {};
    const deviceId = mapPluginDevice(detail);
    if (!deviceId) return;
    const metric = String(detail.metric || detail.channelId || 'value');
    const value = Number(detail.value);
    if (!Number.isFinite(value)) return;
    const prev = latest.get(deviceId) || {};
    pushHistory(deviceId, { ...prev, [metric]: value });
  }
  target.addEventListener('ridetracker:plugin-telemetry', consumeTelemetry);
  target.addEventListener('ridetracker:routed-telemetry', consumeTelemetry);

  function drawChart(canvas, deviceId, descriptor) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(280, rect.width), h = 150;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h); ctx.fillStyle='#040b12';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=1;
    for(let i=1;i<4;i++){const y=i*h/4;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    const list = histories.get(deviceId) || [];
    const keys = (descriptor?.channels || []).map(x => x.metric).filter(Boolean).slice(0,3);
    if (!keys.length || list.length < 2) { ctx.fillStyle='#758ba3';ctx.font='12px system-ui';ctx.fillText('Warte auf Messwerte …',12,24);return; }
    const values = list.flatMap(row => keys.map(key => Number(row[key])).filter(Number.isFinite));
    let min = Math.min(...values), max = Math.max(...values); if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    if (Math.abs(max-min)<1e-6){min-=1;max+=1;} const span=max-min;
    const colors=['#00e5ff','#ffaa20','#ff334e'];
    keys.forEach((key,ki)=>{ctx.beginPath();let drew=false;list.forEach((row,i)=>{const v=Number(row[key]);if(!Number.isFinite(v))return;const x=i/Math.max(1,list.length-1)*(w-10)+5;const y=h-8-(v-min)/span*(h-20);drew?ctx.lineTo(x,y):ctx.moveTo(x,y);drew=true;});ctx.strokeStyle=colors[ki];ctx.lineWidth=2;ctx.stroke();});
  }

  async function enrichDeviceCards() {
    const registry = await loadRegistry();
    document.querySelectorAll('#rtDeviceCenter .rt-device[data-id]').forEach(card => {
      if (card.querySelector('.rt-sensor-diagnostic')) return;
      const id = card.dataset.id;
      const descriptor = registry.devices?.[id] || registry.devices?.custom || { purpose:'Live-Diagnose des ausgewählten Geräts.', channels:[] };
      const block = document.createElement('section'); block.className='rt-sensor-diagnostic';
      block.innerHTML=`<div class="rt-sensor-live-head"><strong>Live-Diagnose</strong><span class="rt-sensor-live-status">wartet auf Daten</span></div><div class="rt-sensor-purpose">${descriptor.purpose || ''}</div><canvas class="rt-sensor-chart"></canvas><div class="rt-sensor-values"></div><div class="rt-sensor-hint">${descriptor.hint || 'Die Darstellung aktualisiert sich nur, wenn der Sensor aktiviert und verfügbar ist.'}</div>`;
      card.appendChild(block);
      const render = () => {
        if (!card.isConnected) return;
        const canvas = block.querySelector('canvas'); if (card.open) drawChart(canvas,id,descriptor);
        const current = latest.get(id) || {};
        const values = block.querySelector('.rt-sensor-values');
        const entries=(descriptor.channels||[]).map(ch=>[ch.label||ch.metric,current[ch.metric],ch.unit||'']).filter(([,v])=>Number.isFinite(Number(v)));
        values.innerHTML=entries.length?entries.map(([label,v,unit])=>`<span class="rt-sensor-value">${label}: <b>${Number(v).toFixed(Math.abs(Number(v))<10?2:0)} ${unit}</b></span>`).join(''):'<span class="rt-sensor-value">Noch keine Messwerte</span>';
        block.querySelector('.rt-sensor-live-status').textContent=entries.length?'live':'wartet auf Daten';
        requestAnimationFrame(()=>setTimeout(render,250));
      };
      render();
    });
  }
  new MutationObserver(enrichDeviceCards).observe(document.body,{childList:true,subtree:true});
  target.addEventListener('ridetracker:web-plugins-ready', enrichDeviceCards);
  setTimeout(enrichDeviceCards,500);

  function patchMapView() {
    const map = document.querySelector('.rt-map-view');
    if (!map) return;
    map.hidden = false;
    map.style.setProperty('display','block','important');
    map.scrollTop = 0;
  }
  new MutationObserver(patchMapView).observe(document.body,{childList:true,subtree:true});

  function downloadBlob(blob, filename) {
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);
  }

  function exportCanvasType() {
    for (const type of ['video/mp4','video/webm;codecs=vp9,opus','video/webm']) if (MediaRecorder.isTypeSupported?.(type)) return type;
    return '';
  }

  async function renderVideoWithHud() {
    const plugins = target.RideTrackerWebPlugins;
    const raw = await plugins?.invoke?.('media-export','rawVideo');
    const telemetry = await plugins?.invoke?.('media-export','telemetry');
    if (!(raw instanceof Blob)) throw new Error('Keine fertige Videoaufnahme vorhanden.');
    if (!HTMLCanvasElement.prototype.captureStream || !target.MediaRecorder) throw new Error('Dieser Browser unterstützt den gerenderten Videoexport nicht.');

    const dialog = byId('rtExportDialog');
    const card = dialog?.querySelector('.rt-export-card');
    if (card) card.innerHTML='<h2>Video mit Sensordaten wird erstellt</h2><p>HUD und Messwerte werden zeitgenau in das Video gerendert.</p><div class="rt-export-progress"><i></i></div><div class="rt-export-status">Vorbereitung …</div>';
    const bar = card?.querySelector('.rt-export-progress i'); const status = card?.querySelector('.rt-export-status');

    const sourceUrl = URL.createObjectURL(raw);
    const video = document.createElement('video'); video.src=sourceUrl;video.muted=true;video.playsInline=true;video.preload='auto';
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('Video konnte für den Export nicht geladen werden.'));});
    const maxWidth=1920, scale=Math.min(1,maxWidth/Math.max(1,video.videoWidth));
    const width=Math.max(2,Math.round(video.videoWidth*scale/2)*2),height=Math.max(2,Math.round(video.videoHeight*scale/2)*2);
    const exportHost=document.createElement('div');exportHost.style.cssText=`position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;overflow:hidden;background:#000`;document.body.appendChild(exportHost);exportHost.appendChild(video);
    video.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain';
    target.RideTrackerHudReplay?.attach?.(video,telemetry,{host:exportHost});
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const hud=byId('rtConfiguredLiveHud');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
    const stream=canvas.captureStream(30);
    const sourceCapture=video.captureStream?.() || video.mozCaptureStream?.();
    sourceCapture?.getAudioTracks?.().forEach(track=>stream.addTrack(track));
    const type=exportCanvasType();const recorder=new MediaRecorder(stream,type?{mimeType:type}:undefined);const chunks=[];
    recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
    const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('Export fehlgeschlagen'));});
    let raf=0;const draw=()=>{ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);ctx.drawImage(video,0,0,width,height);if(hud?.isConnected)ctx.drawImage(hud,0,0,width,height);if(bar&&video.duration)bar.style.width=`${Math.min(100,video.currentTime/video.duration*100)}%`;if(status)status.textContent=`${Math.round(video.currentTime)} / ${Math.round(video.duration)} s`;if(!video.ended)raf=requestAnimationFrame(draw)};
    recorder.start(1000);raf=requestAnimationFrame(draw);await video.play();await new Promise(resolve=>video.addEventListener('ended',resolve,{once:true}));cancelAnimationFrame(raf);draw();recorder.stop();await stopped;
    const result=new Blob(chunks,{type:recorder.mimeType||type||'video/webm'});
    target.RideTrackerHudReplay?.detach?.();exportHost.remove();URL.revokeObjectURL(sourceUrl);
    const visibleReplay=byId('replay');if(visibleReplay && !visibleReplay.classList.contains('hidden')) target.RideTrackerHudReplay?.attach?.(visibleReplay,telemetry,{host:byId('videoWrap')});
    return result;
  }

  async function interceptEmbeddedExport(event) {
    const button=event.target.closest?.('#rtExportWithTelemetry');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();button.disabled=true;
    try {
      const blob=await renderVideoWithHud();
      const ext=blob.type.includes('mp4')?'mp4':'webm';const stamp=new Date().toISOString().replace(/[:.]/g,'-');
      downloadBlob(blob,`RideTracker-${stamp}-mit-Sensordaten.${ext}`);
      const dialog=byId('rtExportDialog');if(dialog)dialog.hidden=true;
    } catch(error) {
      alert(`Export nicht möglich: ${error?.message||error}`);
      const dialog=byId('rtExportDialog');if(dialog)dialog.remove();
    } finally { button.disabled=false; }
  }
  document.addEventListener('click',interceptEmbeddedExport,true);

  target.RideTrackerSensorDiagnostics={history:id=>[...(histories.get(id)||[])],latest:id=>latest.get(id)||null,registry:()=>diagnosticsRegistry};
  target.RideTrackerRenderedExport={render:renderVideoWithHud};
}
