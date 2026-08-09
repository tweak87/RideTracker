(() => {
  'use strict';
  const KEY='rideTracker.cameraSources.v1';
  const state={sources:[],primary:null,fallbacks:[],facing:null};

  function load(){
    try{Object.assign(state,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{}
  }
  function save(){localStorage.setItem(KEY,JSON.stringify(state))}
  function emit(){window.dispatchEvent(new CustomEvent('ridetracker:camera-sources',{detail:snapshot()}))}
  function mediaSourceById(id){return state.sources.find(source=>source.id===id&&source.transport==='mediaDevices')||null}
  function syncFromStream(stream){
    const track=stream?.getVideoTracks?.()[0];
    const settings=track?.getSettings?.()||{};
    if(settings.deviceId&&mediaSourceById(settings.deviceId)) state.primary=settings.deviceId;
    if(settings.facingMode) state.facing=settings.facingMode;
    save();emit();
    return snapshot();
  }
  async function refresh(){
    if(!navigator.mediaDevices?.enumerateDevices) return [];
    const devices=await navigator.mediaDevices.enumerateDevices();
    const mediaSources=devices.filter(d=>d.kind==='videoinput').map((d,index)=>({
      id:d.deviceId||`camera-${index}`,
      label:d.label||`Kamera ${index+1}`,
      transport:'mediaDevices',
      available:true,
      quality:1,
    }));
    const networkSources=state.sources.filter(source=>source.transport==='network');
    state.sources=[...mediaSources,...networkSources];
    if(state.primary&&!state.sources.some(source=>source.id===state.primary)) state.primary=null;
    if(!state.primary&&mediaSources[0]) state.primary=mediaSources[0].id;
    save();emit();
    return state.sources;
  }
  function addNetworkSource({id,label,url,quality=0.8}){
    if(!id||!url) throw new Error('id and url are required');
    const source={id,label:label||id,url,transport:'network',available:false,quality:Number(quality)||0};
    state.sources=state.sources.filter(x=>x.id!==id).concat(source);save();emit();return source;
  }
  function select(primary,fallbacks=[]){state.primary=primary||null;state.fallbacks=[...new Set(fallbacks.filter(Boolean))];save();emit();return snapshot()}
  function ordered(){return [state.primary,...state.fallbacks].filter(Boolean).map(id=>state.sources.find(s=>s.id===id)).filter(Boolean)}
  function snapshot(){return {sources:state.sources.slice(),primary:state.primary,fallbacks:state.fallbacks.slice(),facing:state.facing,ordered:ordered()}}
  function selectedMediaSource(){return ordered().find(source=>source.transport==='mediaDevices'&&source.available!==false)||state.sources.find(source=>source.transport==='mediaDevices')}
  function constraints(){
    const source=selectedMediaSource();
    if(!source) return {video:true,audio:false};
    return {video:{deviceId:{exact:source.id}},audio:false};
  }

  load();
  navigator.mediaDevices?.addEventListener?.('devicechange',()=>refresh().catch(()=>{}));

  const mediaDevices=navigator.mediaDevices;
  if(mediaDevices?.getUserMedia&&!mediaDevices.__rideTrackerCameraWrapped){
    const original=mediaDevices.getUserMedia.bind(mediaDevices);
    mediaDevices.getUserMedia=async requested=>{
      const input=requested&&typeof requested==='object'?{...requested}:{video:true};
      if(input.video){
        const source=selectedMediaSource();
        const video=input.video===true?{}:{...(input.video||{})};
        // A facingMode request is an explicit front/rear request. Never overwrite it
        // with the previously selected deviceId, otherwise Safari cannot switch back.
        if(source&&!video.deviceId&&!video.facingMode) video.deviceId={exact:source.id};
        input.video=video;
      }
      try{
        const stream=await original(input);
        if(input.video) syncFromStream(stream);
        return stream;
      }catch(error){
        if(input.video&&input.video.deviceId){
          const fallback={...input,video:{...input.video}};
          delete fallback.video.deviceId;
          const stream=await original(fallback);
          syncFromStream(stream);
          return stream;
        }
        throw error;
      }
    };
    Object.defineProperty(mediaDevices,'__rideTrackerCameraWrapped',{value:true});
  }

  window.RideTrackerCameraSources={refresh,addNetworkSource,select,ordered,snapshot,constraints,syncFromStream};
  refresh().catch(()=>{});
})();