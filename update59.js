(() => {
  'use strict';

  const STORAGE_KEY='rideTracker.sensorChannels.v1';
  const registry=new Map();
  const finite=value=>Number.isFinite(Number(value));
  const key=(pluginId,deviceId)=>`${pluginId}::${deviceId||pluginId}`;

  function inferWidget(metric){
    const m=String(metric||'').toLowerCase();
    if(/heart|bpm|pulse/.test(m))return 'pulse';
    if(/speed|velocity/.test(m))return 'speed';
    if(/altitude|height|elevation/.test(m))return 'altitude';
    if(/accel|gyro|rotation|orientation|gforce|lateral|normal|longitudinal/.test(m))return 'gValues';
    if(/temperature/.test(m))return 'temperature';
    if(/pressure|baro/.test(m))return 'pressure';
    return 'generic';
  }

  function persist(){
    const data=[...registry.values()].map(device=>({
      pluginId:device.pluginId,
      deviceId:device.deviceId,
      deviceName:device.deviceName||null,
      updatedAt:new Date().toISOString(),
      channels:[...device.channels.values()].map(channel=>({...channel,times:undefined})),
    }));
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}catch(_){}
  }

  function channelDescriptor(channel){
    const times=channel.times||[];
    let sampleRateHz=null;
    if(times.length>=3){
      const duration=(times.at(-1)-times[0])/1000;
      if(duration>0)sampleRateHz=(times.length-1)/duration;
    }
    return {
      metric:channel.metric,
      channelId:channel.channelId,
      unit:channel.unit||'',
      lastValue:channel.lastValue,
      min:channel.min,
      max:channel.max,
      sampleCount:channel.sampleCount,
      sampleRateHz:sampleRateHz==null?null:Number(sampleRateHz.toFixed(1)),
      widgetSuggestion:channel.widgetSuggestion,
      lastSeenMs:channel.lastSeenMs,
    };
  }

  function snapshotDevice(device){
    return {
      pluginId:device.pluginId,
      deviceId:device.deviceId,
      deviceName:device.deviceName||null,
      channels:[...device.channels.values()].map(channelDescriptor),
    };
  }

  function observe(event){
    const d=event.detail||{};
    const pluginId=String(d.pluginId||'');
    if(!pluginId||!finite(d.value))return;
    const deviceId=String(d.deviceId||pluginId);
    const id=key(pluginId,deviceId);
    let device=registry.get(id);
    if(!device){device={pluginId,deviceId,deviceName:d.deviceName||null,channels:new Map()};registry.set(id,device);}
    if(d.deviceName)device.deviceName=d.deviceName;
    const metric=String(d.metric||d.channelId||'value');
    const channelId=String(d.channelId||metric);
    let channel=device.channels.get(channelId);
    if(!channel){
      channel={metric,channelId,unit:String(d.unit||''),lastValue:Number(d.value),min:Number(d.value),max:Number(d.value),sampleCount:0,times:[],widgetSuggestion:inferWidget(metric),lastSeenMs:performance.now()};
      device.channels.set(channelId,channel);
    }
    const value=Number(d.value);
    channel.metric=metric;
    channel.unit=String(d.unit||channel.unit||'');
    channel.lastValue=value;
    channel.min=Math.min(channel.min,value);
    channel.max=Math.max(channel.max,value);
    channel.sampleCount+=1;
    channel.lastSeenMs=performance.now();
    channel.times.push(channel.lastSeenMs);
    if(channel.times.length>40)channel.times.splice(0,channel.times.length-40);
    const snapshot=snapshotDevice(device);
    window.dispatchEvent(new CustomEvent('ridetracker:sensor-channels-updated',{detail:snapshot}));
    renderConnectionCard(snapshot);
    if(channel.sampleCount===1||channel.sampleCount%20===0)persist();
  }

  function renderConnectionCard(snapshot){
    const plugin=snapshot.pluginId==='external-gnss'?'external-imu':snapshot.pluginId;
    const card=document.querySelector(`#rtExternalSensorDialog [data-connect-plugin="${plugin}"]`);
    if(!card)return;
    let host=card.querySelector('[data-channel-discovery59]');
    if(!host){host=document.createElement('div');host.dataset.channelDiscovery59='';host.style.cssText='margin-top:10px;padding:9px;border:1px solid #29435f;border-radius:10px;background:#07131f;color:#96aac1;font-size:12px;line-height:1.45';card.appendChild(host);}
    if(!snapshot.channels.length){host.textContent='Verbunden. Verfügbare Messwerte werden ermittelt …';return;}
    host.innerHTML=`<strong style="color:#f5fbff">Erkannte Sensorwerte</strong>${snapshot.channels.map(channel=>`<div style="display:flex;justify-content:space-between;gap:8px;margin-top:5px"><span>${channel.metric}${channel.unit?` · ${channel.unit}`:''}</span><span>${finite(channel.lastValue)?Number(channel.lastValue).toFixed(Math.abs(channel.lastValue)<100?1:0):'–'}${channel.sampleRateHz?` · ${channel.sampleRateHz} Hz`:''}</span></div>`).join('')}<div style="margin-top:7px">RideTracker verwendet diese Kanäle für Live-Diagnose und schlägt daraus automatisch HUD-Widgets vor. Die Auswahl kann anschließend manuell geändert werden.</div>`;
  }

  function onConnection(event){
    const d=event.detail||{};
    if(d.connection?.status!=='connected'||!d.pluginId)return;
    const plugin=d.pluginId==='external-gnss'?'external-imu':d.pluginId;
    const card=document.querySelector(`#rtExternalSensorDialog [data-connect-plugin="${plugin}"]`);
    if(!card)return;
    let host=card.querySelector('[data-channel-discovery59]');
    if(!host){host=document.createElement('div');host.dataset.channelDiscovery59='';host.style.cssText='margin-top:10px;padding:9px;border:1px solid #29435f;border-radius:10px;background:#07131f;color:#96aac1;font-size:12px';card.appendChild(host);}
    host.textContent='Verbunden. Verfügbare Messwerte werden ermittelt …';
  }

  window.addEventListener('ridetracker:plugin-telemetry',observe);
  window.addEventListener('ridetracker:plugin-connection',onConnection);
  window.RideTrackerSensorChannelRegistry={
    snapshot:()=>[...registry.values()].map(snapshotDevice),
    forPlugin:pluginId=>[...registry.values()].filter(device=>device.pluginId===pluginId).map(snapshotDevice),
    inferWidget,
  };
})();
