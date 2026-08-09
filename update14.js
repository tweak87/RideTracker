(() => {
  'use strict';

  const PENDING_METADATA_KEY = 'rideTracker.pendingMetadata.v1';
  const state = { heartRate: null, hrDevice: null, hrSamples: [], note: '', comment: '' };

  function css() {
    const s = document.createElement('style');
    s.textContent = `
      details.rt-fold{border:1px solid #29435f;border-radius:16px;background:#0c192a;margin-top:10px;overflow:hidden}details.rt-fold>summary{cursor:pointer;padding:13px 15px;font-weight:800;list-style:none}details.rt-fold>summary::-webkit-details-marker{display:none}details.rt-fold>summary::after{content:'▾';float:right;color:#96aac1}details.rt-fold[open]>summary::after{transform:rotate(180deg)}details.rt-fold>.rt-fold-body{padding:0 12px 12px}
      .rt-notes textarea{width:100%;min-height:86px;resize:vertical;border:1px solid #29435f;border-radius:12px;background:#081321;color:#f5f8fc;padding:10px}.rt-note-grid{display:grid;gap:10px}.rt-hr-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rt-hr-value{font-size:28px;font-weight:850;font-variant-numeric:tabular-nums}.rt-replay-trace{width:100%;height:100px;border-radius:12px;background:#081321;margin-top:8px}
    `;
    document.head.appendChild(s);
  }

  function currentVideoEnabled() {
    return !/aus/i.test(document.getElementById('videoMode')?.textContent || '');
  }

  function replaceUnifiedButtons() {
    document.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !/Kalibrieren\s*&\s*Fahrt starten/i.test(button.textContent || '')) return;
      const actions = window.RideTrackerRecordingActions;
      if (!actions) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void (currentVideoEnabled() ? actions.startWithVideo?.() : actions.startWithoutVideo?.());
    }, true);
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

  function persistPendingMetadata() {
    const value = {
      note: state.note,
      comment: state.comment,
      heartRateSource: state.hrDevice?.name || null,
      heartRateSamples: state.hrSamples.slice(),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(PENDING_METADATA_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('ridetracker:ride-metadata-dirty', { detail: value }));
  }

  function installNotesAndHeartRate(){
    const host=document.querySelector('main')||document.body;if(document.getElementById('rtNote'))return;
    const d=document.createElement('details');d.className='rt-fold rt-notes';d.open=true;
    d.innerHTML=`<summary>Notizen & externe Sensoren</summary><div class="rt-fold-body"><div class="rt-note-grid"><label>Private Notiz<textarea id="rtNote" placeholder="Sitzplatz, Wetter, Besonderheiten …"></textarea></label><label>Kommentar<textarea id="rtComment" placeholder="Kommentar für eine spätere Community-Freigabe …"></textarea></label><div class="rt-hr-row"><button id="rtHeartRate">Pulsuhr koppeln</button><span class="rt-hr-value" id="rtHeartRateValue">– bpm</span><span id="rtHeartRateStatus">Nicht verbunden</span></div></div></div>`;
    host.appendChild(d);
    document.getElementById('rtNote').addEventListener('input',e=>{state.note=e.target.value;persistPendingMetadata();});
    document.getElementById('rtComment').addEventListener('input',e=>{state.comment=e.target.value;persistPendingMetadata();});
    document.getElementById('rtHeartRate').onclick=connectHeartRate;
    document.getElementById('stop')?.addEventListener('click',persistPendingMetadata,false);
  }

  async function connectHeartRate(){
    const status=document.getElementById('rtHeartRateStatus');if(!navigator.bluetooth){status.textContent='Web Bluetooth wird hier nicht unterstützt';return;}
    try{
      status.textContent='Gerät auswählen …';
      const device=await navigator.bluetooth.requestDevice({filters:[{services:['heart_rate']}],optionalServices:['battery_service']});
      const server=await device.gatt.connect();
      const service=await server.getPrimaryService('heart_rate');
      const characteristic=await service.getCharacteristic('heart_rate_measurement');
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged',e=>{
        const v=e.target.value,flags=v.getUint8(0),bpm=flags&1?v.getUint16(1,true):v.getUint8(1);
        state.heartRate=bpm;
        const sample={timestamp:performance.now()/1000,bpm};
        state.hrSamples.push(sample);
        document.getElementById('rtHeartRateValue').textContent=`${bpm} bpm`;
        window.dispatchEvent(new CustomEvent('ridetracker:heart-rate',{detail:{bpm,deviceId:'ble-heart',channelId:'heartRate',quality:1,timestamp:performance.now()}}));
      });
      state.hrDevice=device;
      status.textContent=device.name||'Verbunden';
      persistPendingMetadata();
    }catch(error){status.textContent=`Nicht verbunden: ${error.message}`;}
  }

  function installReplayTrace(){
    const video=document.getElementById('rideSyncedVideo');if(!video||document.getElementById('rtReplayTrace'))return;
    const canvas=document.createElement('canvas');canvas.id='rtReplayTrace';canvas.className='rt-replay-trace';canvas.width=900;canvas.height=100;video.closest('.chartbox,.card,details,.rt-fold-body')?.appendChild(canvas);
    const draw=()=>{const source=window.__rideTrackerReplaySession,samples=source?.samples||[],ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!samples.length)return;const offset=Number(document.getElementById('rideVideoOffset')?.value||0),t=Math.max(0,video.currentTime-offset),visible=samples.filter(s=>Math.abs(Number(s.timestamp)-t)<=6);[['normalG',1],['lateralG',0],['longitudinalG',0]].forEach(([key,base])=>{ctx.beginPath();visible.forEach((s,i)=>{const x=i/Math.max(1,visible.length-1)*canvas.width,y=canvas.height/2-(Number(s[key]??base)-base)*22;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();});ctx.beginPath();ctx.moveTo(canvas.width/2,0);ctx.lineTo(canvas.width/2,canvas.height);ctx.stroke();};
    video.addEventListener('timeupdate',draw);video.addEventListener('seeked',draw);
  }

  function clearPendingOnNewRide() {
    localStorage.removeItem(PENDING_METADATA_KEY);
    state.note=''; state.comment=''; state.hrSamples=[];
    const note=document.getElementById('rtNote'); if(note) note.value='';
    const comment=document.getElementById('rtComment'); if(comment) comment.value='';
  }

  css();
  replaceUnifiedButtons();
  window.addEventListener('ridetracker:new-ride-session', clearPendingOnNewRide);
  setTimeout(()=>{foldExistingSections();installNotesAndHeartRate();installReplayTrace();},800);
  window.RideTrackerPendingMetadata = { snapshot: () => ({note:state.note,comment:state.comment,heartRateSource:state.hrDevice?.name||null,heartRateSamples:state.hrSamples.slice()}), clear: clearPendingOnNewRide };
})();
