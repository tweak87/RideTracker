import { test, expect } from '@playwright/test';

async function eventLoopLag(page) {
  return page.evaluate(() => new Promise(resolve => {
    const started = performance.now();
    setTimeout(() => resolve(performance.now() - started), 0);
  }));
}

test.beforeEach(async ({ page }) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.__rideTrackerErrors=errors;
  await page.goto('/', {waitUntil:'networkidle'});
  await expect.poll(()=>page.evaluate(()=>Boolean(window.RideTrackerCommunity&&window.RideTrackerPreflight&&window.RideTrackerSupportCenter))).toBe(true);
});

test('five primary mobile destinations stay clickable and responsive', async ({ page }) => {
  const nav=page.locator('#rtCommunityBottomNav');await expect(nav).toBeVisible();await expect(nav.locator('button')).toHaveCount(5);
  for(const route of ['community','rides','profile','home','record']) {
    await nav.locator(`[data-community-route="${route}"]`).click();
    await expect.poll(()=>page.evaluate(()=>document.body.dataset.rtRoute)).toBe(route);
    expect(await eventLoopLag(page)).toBeLessThan(500);
  }
  await expect(page.locator('#rtCommunityPreflight')).toBeHidden();
  await expect(page.locator('#rtRecordingBanner')).toBeVisible();
  await expect(page.locator('#rtRecordingBanner .rt-recording-auto')).toContainText('Automatisch starten');
  expect(page.__rideTrackerErrors).toEqual([]);
});

test('all home tools open and safe boot restores the start page', async ({ page }) => {
  await page.evaluate(()=>window.RideTrackerCommunity.navigate('home'));
  const dashboard=page.locator('#rtInlineDashboard');await expect(dashboard).toBeVisible();
  for(const route of ['devices','hud','support','admin']) {
    await dashboard.locator(`[data-community-route="${route}"]`).click();
    expect(await eventLoopLag(page)).toBeLessThan(500);
    if(route==='support')await expect(page.locator('#rtSupportCenter61')).toBeVisible();
    if(route==='admin')await expect(page.locator('#rtAdminCenter61')).toBeVisible();
    const recovery=await page.evaluate(()=>window.RideTrackerDiagnostics.safeBoot());
    expect(recovery).toMatchObject({activeDialog:null,fullscreen:false});
    expect(recovery.rootPointerEvents).not.toBe('none');
    expect(recovery.homePointerEvents).not.toBe('none');
    await expect.poll(()=>page.evaluate(()=>window.RideTrackerDialogManager.active())).toBe(null);
    await expect(page.locator('#rtInlineDashboard')).toBeVisible();
  }
  expect(page.__rideTrackerErrors).toEqual([]);
});

test('support self-test and rollback documentation are available', async ({ page }) => {
  const selfTest=await page.evaluate(()=>window.RideTrackerSupportCenter.runSelfTest());
  expect(selfTest.results.map(result=>result.name)).toEqual(expect.arrayContaining(['Release-Manifest','Hauptnavigation','IndexedDB','Main-Thread','Aufnahmekette']));
  expect(selfTest.results.find(result=>result.name==='Main-Thread')?.state).not.toBe('fail');
  await page.evaluate(()=>window.RideTrackerAdminCenter.open());
  await expect(page.locator('#rtAdminCenter61')).toContainText('rollback/pre-park-map-weather-20260808');
  const release=await page.evaluate(()=>window.RideTrackerRelease.manifest());
  expect(release.baseline.commit).toBe('5a4f178947b144694543161e1f8a459ab19a07b5');
});

test('record route uses the automatic bottom dialog and keeps manual controls in settings', async ({page}) => {
  await page.locator('#rtCommunityBottomNav [data-community-route="record"]').click();
  const dialog=page.locator('#rtRecordingBanner');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.rt-recording-auto')).toContainText('Automatisch starten');
  await expect(dialog.locator('[data-record-video]')).toBeChecked();
  await expect(dialog.locator('[data-record-weather]')).toBeVisible();
  await expect(page.locator('main>.controls')).toBeHidden();
  await expect(page.locator('#rtCommunityPreflight .rt61-preflight-actions')).toBeHidden();
  await dialog.locator('.rt-recording-settings').click();
  await expect.poll(()=>page.evaluate(()=>document.body.dataset.rtRoute)).toBe('devices');
});

test('park map opens only after the ride and optional weather stays consent based', async ({page}) => {
  const transparentPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XyQ+WQAAAABJRU5ErkJggg==','base64');
  await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:200,contentType:'image/png',body:transparentPng}));
  await page.route('https://api.open-meteo.com/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    latitude:48.27,longitude:7.72,elevation:170,timezone:'Europe/Berlin',current_units:{temperature_2m:'°C',wind_speed_10m:'km/h'},
    current:{time:'2026-08-08T12:00',temperature_2m:24.2,relative_humidity_2m:52,apparent_temperature:25.1,precipitation:0,rain:0,weather_code:1,cloud_cover:22,surface_pressure:1008,wind_speed_10m:14,wind_direction_10m:230,wind_gusts_10m:27}
  })}));
  await page.locator('#rtCommunityBottomNav [data-community-route="record"]').click();
  await expect(page.locator('#rtRideContext64')).toBeHidden();
  await page.evaluate(()=>{
    window.RideTrackerGpsCapture.points=()=>[
      {timestamp:0,latitude:48.268,longitude:7.721,horizontalAccuracyM:5},
      {timestamp:1,latitude:48.2681,longitude:7.7211,horizontalAccuracyM:5},
    ];
    window.RideTrackerGpsCapture.last=()=>({latitude:48.2681,longitude:7.7211,horizontalAccuracyM:5});
    window.RideTrackerReferenceEngine.nearbyParks=async()=>[
      {provider:'osm',id:'park-1',name:'Europa-Park',latitude:48.267,longitude:7.72},
      {provider:'osm',id:'park-2',name:'Testpark',latitude:48.31,longitude:7.75},
    ];
    window.RideTrackerReferenceEngine.attractionsForPark=async park=>[
      {provider:'osm',id:`${park.id}-ride`,name:`Bahn in ${park.name}`,latitude:park.latitude,longitude:park.longitude},
    ];
    window.RideTrackerReferenceEngine.reverseCountry=async()=>({code:'DE'});
    window.dispatchEvent(new CustomEvent('ridetracker:recording-stopped'));
  });
  await expect(page.locator('#rtRideDraft61')).toBeVisible();
  await expect(page.locator('#rtRideContext64')).toBeVisible();
  await expect(page.locator('#rtRideContext64')).toContainText('Erst jetzt wird die aufgezeichnete Route ausgewertet');
  await expect(page.locator('#rtRideContext64 [data-weather]')).not.toBeChecked();
  await expect(page.locator('#rtRideContext64 [data-status]')).toContainText('Fahrt beendet');
  await page.locator('#rtRideContext64 [data-load]').click();
  await expect(page.locator('#rtRideContext64 [data-parks] button')).toHaveCount(2);
  await expect(page.locator('#rtRideContext64 .rt64-marker.park')).toHaveCount(2);
  await expect(page.locator('#rtRideContext64 [data-attractions]')).toContainText('Bahn in Europa-Park');
  await page.locator('#rtRideContext64 [data-weather]').check();
  const context=await page.evaluate(async()=>{await window.RideTrackerRideContext.captureWeather('start');return window.RideTrackerRideContext.selection();});
  expect(context.weather.start.temperatureC).toBe(24.2);
  expect(context.weather.start.wind.gustKmh).toBe(27);
  await page.evaluate(()=>window.RideTrackerRideContext.openFaq());
  const faq=page.locator('#rtSensorFaq64');await expect(faq).toBeVisible();
  await expect(faq).toContainText('9,80665 m/s²');
  await expect(faq).toContainText('Funktionieren G-Kräfte ohne GPS?');
  expect(page.__rideTrackerErrors).toEqual([]);
});

test('navigation remains usable after orientation changes', async ({ page }) => {
  await page.setViewportSize({width:844,height:390});
  await expect(page.locator('#rtCommunityBottomNav')).toBeVisible();
  await page.locator('#rtCommunityBottomNav [data-community-route="community"]').click();
  await expect(page.locator('#rtCommunityHub62')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  const box=await page.locator('#rtCommunityBottomNav').boundingBox();
  expect(box).not.toBeNull();expect(box.y+box.height).toBeLessThanOrEqual(845);
  expect(await eventLoopLag(page)).toBeLessThan(500);
});

test('poor iOS GPS fixes derive movement instead of forcing zero', async ({page}) => {
  const result=await page.evaluate(()=>{
    window.dispatchEvent(new CustomEvent('ridetracker:new-ride-session'));
    const values=[];
    for(let index=0;index<4;index+=1){
      const point={timestamp:index,latitude:50+index*.00018,longitude:8,horizontalAccuracyM:97,gpsTimestampMs:1000+index*1000,nativeSpeedMS:0,speedMS:0,speedKmh:0,source:'phone-gps'};
      window.dispatchEvent(new CustomEvent('ridetracker:recording-gps',{detail:point}));values.push({speedKmh:point.speedKmh,source:point.speedSource});
    }
    return{values,snapshot:window.RideTrackerGpsHealth.snapshot()};
  });
  expect(result.values[0].speedKmh).toBeNull();
  expect(result.snapshot.speedKmh).toBeGreaterThan(25);
  expect(result.snapshot.source).toContain('derived');
});

test('ICE GPS repairs repeated timestamps and never claims uncertain zero speed', async ({page}) => {
  const moving=await page.evaluate(()=>{
    window.dispatchEvent(new CustomEvent('ridetracker:new-ride-session'));
    const values=[];
    for(let index=0;index<5;index+=1){
      const point={timestamp:index,latitude:50+index*.00022,longitude:8,horizontalAccuracyM:35,gpsTimestampMs:1000,gpsReceivedAtMs:1000+index*1000,nativeSpeedMS:0,source:'phone-gps'};
      window.dispatchEvent(new CustomEvent('ridetracker:recording-gps',{detail:point}));values.push(point);
    }
    return{last:values.at(-1),snapshot:window.RideTrackerGpsHealth.snapshot()};
  });
  expect(moving.snapshot.speedKmh).toBeGreaterThan(35);
  expect(moving.last.gpsTimestampRepaired).toBe(true);
  expect(moving.snapshot.timestampRepairs).toBeGreaterThanOrEqual(4);

  const shielded=await page.evaluate(()=>{
    window.dispatchEvent(new CustomEvent('ridetracker:new-ride-session'));
    for(let index=0;index<5;index+=1)window.dispatchEvent(new CustomEvent('ridetracker:recording-gps',{detail:{timestamp:index,latitude:50,longitude:8,horizontalAccuracyM:97,gpsTimestampMs:1000+index*1000,nativeSpeedMS:0,source:'phone-gps'}}));
    return window.RideTrackerGpsHealth.snapshot();
  });
  expect(shielded.speedKmh).toBeNull();
  expect(shielded.source).toBe('position-uncertain');
  await expect(page.locator('#rtGpsHealth58')).toContainText('Position unzuverlässig');
});

test('G-force diagnostics expose lateral force and orientation-independent horizontal resultant', async ({page}) => {
  const result=await page.evaluate(()=>({
    metrics:window.RideTrackerGForceQuality.forceMetrics({normal:1,lateral:.3,longitudinal:.4}),
    diagnostics:Boolean(window.RideTrackerGForceDiagnostics),
  }));
  expect(result.diagnostics).toBe(true);
  expect(result.metrics.horizontalG).toBeCloseTo(.5,6);
  expect(result.metrics.lateralMS2).toBeCloseTo(2.941995,6);
  await expect(page.locator('#rtGForceDiagnostics65')).toContainText('Horizontal gesamt');
  await expect(page.locator('#rtGForceDiagnostics65')).toContainText('3-Sekunden-Schweif');
  await expect(page.locator('#rtGForceDetailCanvas65')).toBeVisible();
  expect(await page.evaluate(()=>Boolean(window.RideTrackerGForceVisualizer?.createTrail))).toBe(true);
});

test('recording preparation enters app fullscreen and keeps the configured HUD visible', async ({page}) => {
  await page.locator('#rtCommunityBottomNav [data-community-route="record"]').click();
  const state=await page.evaluate(async()=>{
    window.RideTrackerRecordingFullscreen.beginPreparation();
    const stop=document.getElementById('stop');stop.disabled=false;
    window.dispatchEvent(new CustomEvent('ridetracker:recording-started'));
    await new Promise(resolve=>setTimeout(resolve,350));
    const canvas=document.getElementById('rtConfiguredLiveHud');
    return{wrap:document.getElementById('videoWrap').classList.contains('rt-app-fullscreen'),body:document.body.classList.contains('rt-app-fullscreen-active'),hud:canvas?getComputedStyle(canvas).display:null,trail:Boolean(window.RideTrackerGForceVisualizer)};
  });
  expect(state).toEqual({wrap:true,body:true,hud:'block',trail:true});
  await page.evaluate(()=>{document.getElementById('stop').disabled=true;window.dispatchEvent(new CustomEvent('ridetracker:recording-stopped'));return window.RideTrackerRecordingFullscreen.exit();});
});

test('compass is configurable and uses GPS course as fallback', async ({page}) => {
  const compass=await page.evaluate(()=>{
    window.dispatchEvent(new CustomEvent('ridetracker:canonical-gps',{detail:{latitude:50,longitude:8,speedMS:8,headingDeg:72,horizontalAccuracyM:5}}));
    return window.RideTrackerCompass.snapshot();
  });
  expect(compass.headingDeg).toBeCloseTo(72,1);
  expect(compass.source).toBe('gps-course');
  await page.evaluate(()=>window.RideTrackerStandaloneHudEditor.open());
  await expect.poll(()=>page.evaluate(()=>document.body.dataset.rtRoute)).toBe('hud');
  await page.waitForTimeout(900);
  await expect(page.locator('#rtStandaloneHudEditor [data-control="compass"]')).toBeVisible();
  await expect(page.locator('#rtStandaloneHudEditor .rt-hud-item[data-key="compass"]')).toBeVisible();
});

test('runtime error handling is deduplicated and never blocks controls', async ({page}) => {
  const result=await page.evaluate(()=>{
    const before=window.RideTrackerRuntimeErrors.snapshot().count;
    const fire=()=>window.dispatchEvent(new ErrorEvent('error',{message:'synthetic stack guard',filename:'test.js',lineno:7,colno:3,error:new RangeError('synthetic stack guard')}));
    fire();fire();
    const banner=document.getElementById('rtRuntimeErrorBanner');
    return{before,after:window.RideTrackerRuntimeErrors.snapshot().count,pointerEvents:getComputedStyle(banner).pointerEvents,text:banner.textContent};
  });
  expect(result.after-result.before).toBe(1);
  expect(result.pointerEvents).toBe('none');
  expect(result.text).toContain('protokolliert');
  expect(await eventLoopLag(page)).toBeLessThan(500);
});
