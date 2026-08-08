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
  await expect(page.locator('#rtCommunityPreflight')).toBeVisible();
  await expect(page.locator('#rtCommunityPreflight .rt61-check')).toHaveCount(7);
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
  await expect(page.locator('#rtAdminCenter61')).toContainText('rollback/pre-speed-compass-3d-20260808');
  const release=await page.evaluate(()=>window.RideTrackerRelease.manifest());
  expect(release.baseline.commit).toBe('9a0d225bd291f1c5c3b65cb4f507f898dcf5a83b');
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

test('compass is configurable and uses GPS course as fallback', async ({page}) => {
  const compass=await page.evaluate(()=>{
    window.dispatchEvent(new CustomEvent('ridetracker:canonical-gps',{detail:{latitude:50,longitude:8,speedMS:8,headingDeg:72,horizontalAccuracyM:5}}));
    return window.RideTrackerCompass.snapshot();
  });
  expect(compass.headingDeg).toBeCloseTo(72,1);
  expect(compass.source).toBe('gps-course');
  await page.evaluate(()=>window.RideTrackerStandaloneHudEditor.open());
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
