(() => {
  'use strict';

  const state = { heartRate: null, hrDevice: null, hrSamples: [], note: '', comment: '', starting: false };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitUntil = async (predicate, timeoutMs = 60000, intervalMs = 150) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try { if (predicate()) return true; } catch (_) {}
      await sleep(intervalMs);
    }
    return false;
  };

  function css() {
    const s = document.createElement('style');
    s.textContent = `
      .rt-modal{position:fixed;inset:0;z-index:30000;background:#020812cc;display:grid;place-items:center;padding:18px}.rt-modal-card{width:min(480px,100%);background:#0d1a2c;border:1px solid #29435f;border-radius:20px;padding:20px;color:#f5f8fc;box-shadow:0 24px 80px #0008}.rt-modal-card h3{margin:0 0 8px}.rt-modal-actions{display:grid;gap:9px;margin-top:16px}.rt-modal-actions button{width:100%}
      details.rt-fold{border:1px solid #29435f;border-radius:16px;background:#0c192a;margin-top:10px;overflow:hidden}details.rt-fold>summary{cursor:pointer;padding:13px 15px;font-weight:800;list-style:none}details.rt-fold>summary::-webkit-details-marker{display:none}details.rt-fold>summary::after{content:'▾';float:right;color:#96aac1}details.rt-fold[open]>summary::after{transform:rotate(180deg)}details.rt-fold>.rt-fold-body{padding:0 12px 12px}
      .rt-notes textarea{width:100%;min-height:86px;resize:vertical;border:1px solid #29435f;border-radius:12px;background:#081321;color:#f5f8fc;padding:10px}.rt-note-grid{display:grid;gap:10px}.rt-hr-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rt-hr-value{font-size:28px;font-weight:850;font-variant-numeric:tabular-nums}.rt-replay-trace{width:100%;height:100px;border-radius:12px;background:#081321;margin-top:8px}
    `;
    document.head.appendChild(s);
  }

  function modalVideoChoice() {
    return new Promise(resolve => {
      const m = document.createElement('div');
      m.className = 'rt-modal';
      m.innerHTML = `<div class="rt-modal-card"><h3>Neue Fahrt starten</h3><p>Telefon in die endgültige Position bringen. Danach werden Kalibrierung, Sensoren und optional die Kamera gemeinsam gestartet.</p><div class="rt-modal-actions"><button class="primary" data-video="yes">Mit Video starten</button><button data-video="no">Ohne Video starten</button><button data-video="cancel">Abbrechen</button></div></div>`;
      m.onclick = e => { const choice = e.target?.dataset?.video; if (!choice) return; m.remove(); resolve(choice === 'cancel' ? null : choice === 'yes'); };
      document.body.appendChild(m);
    });
  }

  const isRunning = () => {
    const stop = document.getElementById('stop');
    const dot = document.getElementById('dot');
    const status = document.getElementById('status')?.textContent || '';
    return stop?.disabled === false || dot?.classList.contains('on') || /aufnahme läuft|recording|läuft/i.test(status);
  };

  async function clickWhenReady(id, timeoutMs) {
    const found = await waitUntil(() => {
      const element = document.getElementById(id);
      return element && !element.disabled;
    }, timeoutMs);
    if (!found) return false;
    document.getElementById(id).click();
    return true;
  }

  async function unifiedStart() {
    if (state.starting || isRunning()) return;
    const withVideo = await modalVideoChoice();
    if (withVideo == null) return;
    state.starting = true;
    try {
      const videoMode = document.getElementById('videoMode');
      const saysOn = /Ein|On|aktiv/i.test(videoMode?.textContent || '');
      if (videoMode && saysOn !== withVideo) videoMode.click();

      const init = document.getElementById('init');
      if (init && !init.disabled) init.click();

      // Permission dialogs on iOS can remain open for many seconds. Continue only
      // when the next real state transition is available.
      await clickWhenReady('arm', 90000);
      await clickWhenReady('start', 30000);

      const started = await waitUntil(isRunning, 12000);
      if (!started) {
        // Some browser builds enable START only after calibration settles.
        const start = document.getElementById('start');
        if (start && !start.disabled) start.click();
        await waitUntil(isRunning, 5000);
      }
      const stop = document.getElementById('stop');
      if (isRunning() && stop) stop.disabled = false;
    } finally {
      state.starting = false;
    }
  }

  function replaceUnifiedButtons() {
    document.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (/Kalibrieren\s*&\s*Fahrt starten/i.test(b.textContent)) {
        e.preventDefault(); e.stopImmediatePropagation(); unifiedStart();
      }
    }, true);
    const stop = document.getElementById('stop');
    if (stop) new MutationObserver(() => { if (isRunning()) stop.disabled = false; }).observe(document.body, { subtree:true, attributes:true, childList:true, characterData:true });
  }

  function foldExistingSections() {
    [['Native RideSession importieren',false],['Synchrones Video-Replay',false],['Qualitätsfilter',false],['Streckenprofil',false]].forEach(([label,open]) => {
      const node=[...document.querySelectorAll('article,.card,.chartbox')].find(n=>n.textContent.includes(label));
      if(!node||node.closest('details.rt-fold'))return;
      const d=document.createElement('details');d.className='rt-fold';d.open=open;
      const summary=document.createElement('summary');summary.textContent=label;
      const body=document.createElement('div');body.className='rt-fold-body';node.parentNode.insertBefore(d,node);body.appendChild(node);d.append(summary,body);
    });
  }

  function installNotesAndHeartRate(){
    const host=document.querySelector('main')||document.body;if(document.getElementById('rtNote'))return;
    const d=document.createElement('details');d.className='rt-fold rt-notes';d.open=true;
    d.innerHTML=`<summary>Notizen & externe Sensoren</summary><div class="rt-fold-body"><div class="rt-note-grid"><label>Private Notiz<textarea id="rtNote" placeholder="Sitzplatz, Wetter, Besonderheiten …"></textarea></label><label>Kommentar<textarea id="rtComment" placeholder="Kommentar für eine spätere Community-Freigabe …"></textarea></label><div class="rt-hr-row"><button id="rtHeartRate">Pulsuhr koppeln</button><span class="rt-hr-value" id="rtHeartRateValue">– bpm</span><span id="rtHeartRateStatus">Nicht verbunden</span></div></div></div>`;
    host.appendChild(d);document.getElementById('rtNote').addEventListener('input',e=>state.note=e.target.value);document.getElementById('rtComment').addEventListener('input',e=>state.comment=e.target.value);document.getElementById('rtHeartRate').onclick=connectHeartRate;document.getElementById('stop')?.addEventListener('click',persistMetadata,false);
  }

  async function connectHeartRate(){
    const status=document.getElementById('rtHeartRateStatus');if(!navigator.bluetooth){status.textContent='Web Bluetooth wird hier nicht unterstützt';return;}
    try{status.textContent='Gerät auswählen …';const device=await navigator.bluetooth.requestDevice({filters:[{services:['heart_rate']}],optionalServices:['battery_service']});const server=await device.gatt.connect();const service=await server.getPrimaryService('heart_rate');const characteristic=await service.getCharacteristic('heart_rate_measurement');await characteristic.startNotifications();characteristic.addEventListener('characteristicvaluechanged',e=>{const v=e.target.value,flags=v.getUint8(0),bpm=flags&1?v.getUint16(1,true):v.getUint8(1);state.heartRate=bpm;state.hrSamples.push({timestamp:performance.now()/1000,bpm});document.getElementById('rtHeartRateValue').textContent=`${bpm} bpm`;});state.hrDevice=device;status.textContent=device.name||'Verbunden';}catch(error){status.textContent=`Nicht verbunden: ${error.message}`;}
  }

  async function persistMetadata(){
    await sleep(450);try{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('RideTrackerLibrary',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const rides=await new Promise((resolve,reject)=>{const r=db.transaction('rides').objectStore('rides').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});const latest=rides.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];if(latest){latest.note=state.note;latest.comment=state.comment;latest.heartRateSamples=state.hrSamples.slice();latest.document=latest.document||{};latest.document.notes={private:state.note,comment:state.comment};latest.document.heartRate={source:state.hrDevice?.name||null,samples:state.hrSamples.slice()};await new Promise((resolve,reject)=>{const tx=db.transaction('rides','readwrite');tx.objectStore('rides').put(latest);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}db.close();}catch(error){console.warn('Metadaten konnten nicht gespeichert werden',error);}
  }

  function installReplayTrace(){
    const video=document.getElementById('rideSyncedVideo');if(!video||document.getElementById('rtReplayTrace'))return;const canvas=document.createElement('canvas');canvas.id='rtReplayTrace';canvas.className='rt-replay-trace';canvas.width=900;canvas.height=100;video.closest('.chartbox,.card,details,.rt-fold-body')?.appendChild(canvas);const draw=()=>{const source=window.__rideTrackerReplaySession,samples=source?.samples||[],ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!samples.length)return;const offset=Number(document.getElementById('rideVideoOffset')?.value||0),t=Math.max(0,video.currentTime-offset),visible=samples.filter(s=>Math.abs(Number(s.timestamp)-t)<=6);[['normalG',1],['lateralG',0],['longitudinalG',0]].forEach(([key,base])=>{ctx.beginPath();visible.forEach((s,i)=>{const x=i/Math.max(1,visible.length-1)*canvas.width,y=canvas.height/2-(Number(s[key]??base)-base)*22;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();});ctx.beginPath();ctx.moveTo(canvas.width/2,0);ctx.lineTo(canvas.width/2,canvas.height);ctx.stroke();};video.addEventListener('timeupdate',draw);video.addEventListener('seeked',draw);
  }

  css();replaceUnifiedButtons();setTimeout(()=>{foldExistingSections();installNotesAndHeartRate();installReplayTrace();},800);
})();
