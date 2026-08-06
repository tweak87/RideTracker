(() => {
  'use strict';
  const DEVICE_KEY='rideTracker.devices.v1';
  const LOG_KEY='rideTracker.sourceSwitchLog.v1';
  const latest=new Map();
  const active=new Map();
  const switches=[];

  function registry(){
    try{return JSON.parse(localStorage.getItem(DEVICE_KEY)||'{}')}catch{return {metricBindings:[]}}
  }
  function sourceId(deviceId,channelId){return `${deviceId}/${channelId}`}
  function ingest(metric,deviceId,channelId,value,quality=1,timestamp=performance.now()){
    latest.set(sourceId(deviceId,channelId),{metric,value,quality,timestamp,deviceId,channelId});
    const resolved=resolve(metric,timestamp);
    window.dispatchEvent(new CustomEvent('ridetracker:routed-telemetry',{detail:resolved}));
    return resolved;
  }
  function resolve(metric,now=performance.now()){
    const binding=(registry().metricBindings||[]).find(x=>x.metric===metric)||{};
    const order=[binding.primarySource,...(binding.fallbackSources||[])].filter(Boolean);
    if(!order.length){
      for(const [id,sample] of latest) if(sample.metric===metric) order.push(id);
    }
    const minimumQuality=Number(binding.minimumQuality??0);
    const maxAgeMs=Number(binding.maxAgeMs??Infinity);
    let chosen=null;
    for(const id of order){
      const sample=latest.get(id);
      if(!sample||sample.metric!==metric) continue;
      const ageMs=Math.max(0,now-sample.timestamp);
      if(sample.quality<minimumQuality||ageMs>maxAgeMs) continue;
      chosen={...sample,sourceId:id,ageMs,interpolation:binding.interpolation||'hold'};
      break;
    }
    const next=chosen?.sourceId||null;
    if(active.get(metric)!==next){
      const event={timestampMs:Math.round(now),metric,from:active.get(metric)||null,to:next,reason:chosen?'selected':'no-valid-source'};
      active.set(metric,next);switches.push(event);
      localStorage.setItem(LOG_KEY,JSON.stringify(switches.slice(-1000)));
      window.dispatchEvent(new CustomEvent('ridetracker:source-switch',{detail:event}));
    }
    return chosen?{metric,valid:true,...chosen}:{metric,valid:false,value:null,sourceId:null,ageMs:null};
  }

  window.addEventListener('ridetracker:heart-rate',event=>{
    const d=event.detail||{};
    ingest('heartRateBpm','ble-heart','heartRate',Number(d.bpm),1,performance.now());
  });
  window.addEventListener('ridetracker:internal-telemetry',event=>{
    const d=event.detail||{};
    if(Number.isFinite(d.speedKmh)) ingest('speedKmh','phone-gps','speed',d.speedKmh,Number(d.quality??1),Number(d.timestampMs??performance.now()));
    if(Number.isFinite(d.gForce)) ingest('gForce','phone-motion','motion',d.gForce,Number(d.quality??1),Number(d.timestampMs??performance.now()));
  });

  window.RideTrackerRecordingSourceRouter={ingest,resolve,latest:()=>Object.fromEntries(latest),switchLog:()=>switches.slice()};
})();
