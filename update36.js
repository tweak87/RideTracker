(() => {
  'use strict';
  const KEY='rideTracker.cameraSources.v1';
  const state={sources:[],primary:null,fallbacks:[]};

  function load(){
    try{Object.assign(state,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{}
  }
  function save(){localStorage.setItem(KEY,JSON.stringify(state))}
  async function refresh(){
    if(!navigator.mediaDevices?.enumerateDevices) return [];
    const devices=await navigator.mediaDevices.enumerateDevices();
    state.sources=devices.filter(d=>d.kind==='videoinput').map((d,index)=>({
      id:d.deviceId||`camera-${index}`,
      label:d.label||`Kamera ${index+1}`,
      transport:'mediaDevices',
      available:true,
      quality:1,
    }));
    if(!state.primary&&state.sources[0]) state.primary=state.sources[0].id;
    save();
    window.dispatchEvent(new CustomEvent('ridetracker:camera-sources',{detail:snapshot()}));
    return state.sources;
  }
  function addNetworkSource({id,label,url,quality=0.8}){
    if(!id||!url) throw new Error('id and url are required');
    const source={id,label:label||id,url,transport:'network',available:false,quality:Number(quality)||0};
    state.sources=state.sources.filter(x=>x.id!==id).concat(source);save();return source;
  }
  function select(primary,fallbacks=[]){state.primary=primary||null;state.fallbacks=[...new Set(fallbacks.filter(Boolean))];save()}
  function ordered(){return [state.primary,...state.fallbacks].filter(Boolean).map(id=>state.sources.find(s=>s.id===id)).filter(Boolean)}
  function snapshot(){return {sources:state.sources.slice(),primary:state.primary,fallbacks:state.fallbacks.slice(),ordered:ordered()}}
  async function constraints(){
    const source=ordered().find(s=>s.available!==false)||state.sources[0];
    if(!source) return {video:true,audio:true};
    if(source.transport==='mediaDevices') return {video:{deviceId:{exact:source.id}},audio:true};
    return {video:true,audio:true,externalUrl:source.url||null};
  }

  load();
  navigator.mediaDevices?.addEventListener?.('devicechange',()=>refresh().catch(()=>{}));
  window.RideTrackerCameraSources={refresh,addNetworkSource,select,ordered,snapshot,constraints};
})();
