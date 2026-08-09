(() => {
  'use strict';
  const DEVICE_KEY='rideTracker.devices.v1';
  const byId=id=>document.getElementById(id);

  const style=document.createElement('style');
  style.id='rtExternalSensorConnections51Style';
  style.textContent=`
    #rtExternalSensorDialog{position:fixed;inset:0;z-index:2147483300;display:none;background:rgba(1,7,13,.88);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);padding:max(16px,env(safe-area-inset-top)) 14px max(20px,env(safe-area-inset-bottom));overflow:auto;color:#f5fbff}
    #rtExternalSensorDialog.open{display:block}.rt-connect-shell{max-width:720px;margin:auto;background:#07131f;border:1px solid #31536b;border-radius:20px;padding:16px}.rt-connect-head{display:flex;gap:10px;align-items:center}.rt-connect-head h2{margin:0;flex:1}.rt-connect-head button,.rt-connect-card button{border:1px solid #31536b;background:#102436;color:#fff;border-radius:11px;padding:10px 12px;font-weight:800}.rt-connect-card{margin-top:12px;border:1px solid #29435f;background:#0b1b29;border-radius:15px;padding:14px}.rt-connect-card h3{margin:0 0 5px}.rt-connect-card p{margin:4px 0;color:#96aac1;line-height:1.45}.rt-connect-status{display:flex;align-items:center;gap:8px;margin:10px 0;padding:9px;border-radius:10px;background:#07131f}.rt-connect-dot{width:9px;height:9px;border-radius:50%;background:#ff6680}.rt-connect-status.connected .rt-connect-dot{background:#5ee0a0}.rt-connect-status.searching .rt-connect-dot,.rt-connect-status.connecting .rt-connect-dot{background:#ffd166}.rt-connect-note{margin-top:12px;padding:10px;border:1px dashed #31536b;border-radius:11px;color:#96aac1;font-size:12px;line-height:1.5}
  `;
  document.head.appendChild(style);

  const dialog=document.createElement('section');
  dialog.id='rtExternalSensorDialog';
  dialog.innerHTML=`<div class="rt-connect-shell"><div class="rt-connect-head"><h2>Externen Sensor verbinden</h2><button type="button" data-connect-close>Schließen</button></div><p>RideTracker sucht nur nach Sensorprofilen, die zur Fahrttelemetrie passen.</p><article class="rt-connect-card" data-connect-plugin="ble-heart-rate"><h3>Pulsmesser / Uhr</h3><p>Standard-BLE-Herzfrequenz (GATT Heart Rate Service). Geeignet für Brustgurte und Uhren, die Herzfrequenz als BLE-Broadcast senden.</p><div class="rt-connect-status"><span class="rt-connect-dot"></span><span data-connect-status>Nicht verbunden</span></div><button type="button" data-connect-action="ble-heart-rate">Suchen & verbinden</button></article><article class="rt-connect-card" data-connect-plugin="external-imu"><h3>RideTracker Sensor / externe IMU / GNSS</h3><p>RideTracker-Telemetrieprofil für Beschleunigung, Drehrate, Geschwindigkeit, Position und Höhe.</p><div class="rt-connect-status"><span class="rt-connect-dot"></span><span data-connect-status>Nicht verbunden</span></div><button type="button" data-connect-action="external-imu">Suchen & verbinden</button></article><div class="rt-connect-note" data-browser-note></div></div>`;
  document.body.appendChild(dialog);

  function registry(){try{return JSON.parse(localStorage.getItem(DEVICE_KEY)||'{}')}catch{return {devices:[]}}}
  function saveRegistry(value){localStorage.setItem(DEVICE_KEY,JSON.stringify(value))}
  function markDevice(ids,connection){
    const value=registry();
    for(const id of ids){const device=(value.devices||[]).find(item=>item.id===id);if(!device)continue;device.enabled=connection?.status==='connected'||device.enabled;device.connection={status:connection?.status||'unknown',deviceId:connection?.deviceId||null,deviceName:connection?.deviceName||null,updatedAt:new Date().toISOString()};}
    saveRegistry(value);
  }
  function pluginIdsFor(pluginId){return pluginId==='ble-heart-rate'?['ble-heart']:['external-imu','external-gnss']}
  function runtime(pluginId){return window.RideTrackerWebPlugins?.get?.(pluginId)||null}
  function setCard(pluginId,connection){
    const card=dialog.querySelector(`[data-connect-plugin="${pluginId}"]`);if(!card)return;
    const status=card.querySelector('[data-connect-status]'),wrap=card.querySelector('.rt-connect-status'),button=card.querySelector('[data-connect-action]');
    const state=connection?.status||runtime(pluginId)?.connection?.status||'disconnected';wrap.className=`rt-connect-status ${state}`;
    const labels={searching:'Geräteauswahl geöffnet …',connecting:'Verbindung wird hergestellt …',connected:`Verbunden${connection?.deviceName?`: ${connection.deviceName}`:''}`,disconnected:'Nicht verbunden',failed:'Verbindung fehlgeschlagen'};
    status.textContent=labels[state]||state;button.textContent=state==='connected'?'Trennen':'Suchen & verbinden';button.dataset.connected=String(state==='connected');
  }
  function refresh(){
    const supported=Boolean(navigator.bluetooth?.requestDevice);
    dialog.querySelector('[data-browser-note]').textContent=supported?'Die eigentliche BLE-Geräteauswahl wird vom Betriebssystem/Browser angezeigt.':'Dieser Browser unterstützt keine Web-Bluetooth-Suche. Auf iPhone/iPad ist dafür die native RideTracker-App erforderlich. Pulsmesser/Uhren müssen außerdem einen Standard-BLE-Herzfrequenz-Broadcast anbieten.';
    for(const id of ['ble-heart-rate','external-imu'])setCard(id,runtime(id)?.connection);
    dialog.querySelectorAll('[data-connect-action]').forEach(button=>{button.disabled=!supported&&button.dataset.connected!=='true'});
  }
  function open(){dialog.classList.add('open');refresh()}
  function close(){dialog.classList.remove('open')}
  async function connect(pluginId,button){
    const plugins=window.RideTrackerWebPlugins;if(!plugins?.invoke)return alert('PluginHost ist noch nicht bereit.');
    if(button.dataset.connected==='true'){await plugins.invoke(pluginId,'disconnect');markDevice(pluginIdsFor(pluginId),{status:'disconnected'});refresh();return;}
    button.disabled=true;
    try{const result=await plugins.invoke(pluginId,'scanAndConnect');const connection=pluginId==='external-imu'?(result?.imu?.connection||runtime(pluginId)?.connection):(result?.connection||runtime(pluginId)?.connection);markDevice(pluginIdsFor(pluginId),connection);refresh();window.RideTrackerDeviceCenter?.open?.();}
    catch(error){setCard(pluginId,{status:'failed'});const status=dialog.querySelector(`[data-connect-plugin="${pluginId}"] [data-connect-status]`);if(status)status.textContent=`Fehler: ${error?.message||error}`;}
    finally{button.disabled=false;}
  }

  dialog.querySelector('[data-connect-close]').onclick=close;
  dialog.addEventListener('click',event=>{const button=event.target.closest('[data-connect-action]');if(button)void connect(button.dataset.connectAction,button);});
  window.addEventListener('ridetracker:plugin-connection',event=>{const id=event.detail?.pluginId;if(id==='ble-heart-rate'||id==='external-imu'||id==='external-gnss'){const cardId=id==='external-gnss'?'external-imu':id;setCard(cardId,event.detail.connection);markDevice(pluginIdsFor(cardId),event.detail.connection);}});
  window.addEventListener('ridetracker:web-plugins-ready',refresh);

  function attachButton(){
    const head=document.querySelector('#rtDeviceCenter .rt-device-head');if(!head||head.querySelector('[data-connect-external]'))return;
    const button=document.createElement('button');button.type='button';button.dataset.connectExternal='';button.textContent='Sensor verbinden';button.onclick=open;
    const add=head.querySelector('[data-device-add]');head.insertBefore(button,add||null);
  }
  new MutationObserver(attachButton).observe(document.body,{childList:true,subtree:true});attachButton();

  window.RideTrackerExternalSensorConnections={open,close,refresh};
})();