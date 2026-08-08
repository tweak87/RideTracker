(() => {
  'use strict';

  const state={headingDeg:null,accuracyDeg:null,source:'unavailable',updatedAt:0,permission:'unknown',gpsHeadingDeg:null,lastGpsPoint:null};
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const normalize=value=>((Number(value)%360)+360)%360;
  const circularDelta=(from,to)=>((normalize(to)-normalize(from)+540)%360)-180;
  const cardinal=heading=>['N','NO','O','SO','S','SW','W','NW'][Math.round(normalize(heading)/45)%8];

  function emit(headingDeg,source,accuracyDeg=null){
    if(!finite(headingDeg))return false;
    const next=normalize(headingDeg);
    state.headingDeg=state.headingDeg===null?next:normalize(state.headingDeg+circularDelta(state.headingDeg,next)*0.28);
    state.accuracyDeg=finite(accuracyDeg)?Math.max(0,Number(accuracyDeg)):null;
    state.source=source;
    state.updatedAt=performance.now();
    window.dispatchEvent(new CustomEvent('ridetracker:compass',{detail:snapshot()}));
    return true;
  }

  function orientation(event){
    if(finite(event.webkitCompassHeading)){
      emit(event.webkitCompassHeading,'ios-compass',event.webkitCompassAccuracy);
      return;
    }
    if(event.absolute===true&&finite(event.alpha))emit(360-Number(event.alpha),'device-orientation',null);
  }

  function gpsCourse(event){
    const point=event.detail||{};
    const speedMS=finite(point.speedMS)?Number(point.speedMS):null;
    let heading=finite(point.headingDeg)?Number(point.headingDeg):null;
    if(heading===null&&state.lastGpsPoint&&finite(point.latitude)&&finite(point.longitude)){
      const distance=window.RideTrackerGpsMath?.distanceMeters?.(state.lastGpsPoint,point)||0;
      if(distance>=Math.max(4,Math.min(18,Number(point.horizontalAccuracyM)||8)*0.35))heading=window.RideTrackerGpsMath?.bearingDegrees?.(state.lastGpsPoint,point);
    }
    if(finite(point.latitude)&&finite(point.longitude))state.lastGpsPoint={...point};
    if(speedMS!==null&&speedMS>=1.5&&finite(heading)){
      state.gpsHeadingDeg=normalize(heading);
      // The magnetic/device compass remains primary while it is fresh. GPS course is the
      // reliable fallback in vehicles with magnetic interference.
      if(performance.now()-state.updatedAt>3500||!['ios-compass','device-orientation'].includes(state.source))emit(heading,'gps-course',point.horizontalAccuracyM);
    }
  }

  async function requestPermission(){
    try{
      if(typeof globalThis.DeviceOrientationEvent?.requestPermission==='function'){
        state.permission=await globalThis.DeviceOrientationEvent.requestPermission();
        return state.permission==='granted';
      }
      state.permission='granted';
      return true;
    }catch(error){
      state.permission='denied';
      window.RideTrackerSupportCenter?.log?.('warn','compass','Kompassfreigabe fehlgeschlagen',{message:error?.message||String(error)});
      return false;
    }
  }

  function snapshot(){return{headingDeg:state.headingDeg,cardinal:finite(state.headingDeg)?cardinal(state.headingDeg):'–',accuracyDeg:state.accuracyDeg,source:state.source,permission:state.permission,ageMs:state.updatedAt?performance.now()-state.updatedAt:null,gpsHeadingDeg:state.gpsHeadingDeg};}

  window.addEventListener('deviceorientationabsolute',orientation,{passive:true});
  window.addEventListener('deviceorientation',orientation,{passive:true});
  window.addEventListener('ridetracker:canonical-gps',gpsCourse);
  document.getElementById('init')?.addEventListener('click',()=>{void requestPermission();},{capture:true});
  window.RideTrackerCompass={requestPermission,snapshot,cardinal,normalize};
  window.RideTrackerSupportCenter?.log?.('info','compass','Kompass-Widget installiert',{orientationApi:'DeviceOrientationEvent'in window,gpsFallback:true});
})();
