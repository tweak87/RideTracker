import { test, expect } from '@playwright/test';

async function seedRide(page) {
  await page.evaluate(async () => {
    await window.RideTrackerDatabase.ready;
    const id='e2e-voltron-ride';
    const samples=[];
    for(let index=0;index<72;index+=1){
      const angle=index/71*Math.PI*2;
      samples.push({
        timestamp:index*100,
        latitude:48.268+Math.sin(angle)*0.0007,
        longitude:7.721+Math.cos(angle)*0.0009,
        relativeAltitudeM:Math.sin(angle*2)*15,
        speedKmh:45+Math.sin(angle)*32,
        normalG:1+Math.sin(angle*3)*1.4,
        lateralG:Math.cos(angle*2)*0.9,
        longitudinalG:Math.sin(angle)*0.6,
        totalG:1.2+Math.abs(Math.sin(angle*3))*1.8
      });
    }
    const meta={id,createdAt:'2026-08-08T10:00:00.000Z',title:'Voltron Testfahrt',park:'Europa-Park',track:'Voltron Nevera',visibility:'public',rating:5};
    localStorage.setItem('rideTracker.savedRides.v2',JSON.stringify([meta]));
    window.RideTrackerCommunity.store.upsertRide({id,title:meta.title,parkName:meta.park,rideName:meta.track,visibility:'public',createdAt:meta.createdAt});
    await window.RideTrackerDatabase.put(window.RideTrackerDatabase.stores.ridePackages,id,{
      id,createdAt:meta.createdAt,parkName:meta.park,rideName:meta.track,distanceMeters:740,durationSeconds:7.1,sampleCount:samples.length,
      thumbnail:{kind:'stock',dataUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="100%" height="100%" fill="%231c7599"/></svg>',attribution:'Testbild · Ride Artist · CC BY 4.0',sourceUrl:'https://commons.wikimedia.org/wiki/File:Test',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',provider:'Wikimedia Commons'},
      document:{samples,context:{parkName:meta.park,rideName:meta.track},community:{visibility:'public'},environment:{weather:{start:{condition:{label:'Leicht bewölkt'},temperatureC:24.2,wind:{speedKmh:14}}}}}
    });
  });
}

test.beforeEach(async ({page}) => {
  await page.goto('/',{waitUntil:'networkidle'});
  await expect.poll(()=>page.evaluate(()=>Boolean(window.RideTrackerCommunityHub&&window.RideTrackerTrack3D&&window.RideTrackerCommunityBackend))).toBe(true);
  await seedRide(page);
});

test('community hub exposes feed, catalogs, friends and local fallback', async ({page}) => {
  await page.locator('#rtCommunityBottomNav [data-community-route="community"]').click();
  const hub=page.locator('#rtCommunityHub62');await expect(hub).toBeVisible();
  await expect(hub.locator('.rt62-status')).toContainText('Lokal');
  for(const tab of ['feed','parks','tracks','rides','friends']){
    await hub.locator(`[data-rt62-tab="${tab}"]`).click();
    await expect(hub.locator(`[data-rt62-tab="${tab}"]`)).toHaveAttribute('data-active','true');
  }
  await expect(hub).toContainText('Für Freunde ist eine Anmeldung erforderlich');
});

test('park, track and ride miniatures lead to an interactive heatmap viewer', async ({page}) => {
  await page.evaluate(()=>window.RideTrackerCommunityHub.open());
  const hub=page.locator('#rtCommunityHub62');
  for(const tab of ['parks','tracks','rides']){
    await hub.locator(`[data-rt62-tab="${tab}"]`).click();
    await expect(hub.locator('.rt62-card img').first()).toBeVisible();
  }
  await expect(hub.locator('.rt62-image-credit').first()).toContainText('CC BY 4.0');
  await expect(hub.locator('.rt62-image-credit a').first()).toContainText('Quelle');
  await expect(hub.locator('.rt62-card').first()).toContainText('Wind 14 km/h');
  await hub.locator('[data-rt62-model]').first().click();
  const viewer=page.locator('#rtTrackViewer62');await expect(viewer).toBeVisible();
  await expect(viewer.locator('canvas')).toBeVisible();
  await viewer.locator('[data-metric]').selectOption('totalG');
  await expect(viewer.locator('[data-metric]')).toHaveValue('totalG');
  await expect(viewer.locator('[data-view]')).toHaveCount(4);
  await expect(viewer.locator('[data-inspector]')).toContainText('Punkt 1');
  await page.evaluate(()=>window.RideTrackerCommunityHub.viewer().selectPoint(32));
  await expect(viewer.locator('[data-inspector]')).toContainText('Punkt 33');
  await expect(viewer.locator('[data-inspector]')).toContainText('Tempo');
  const before=await page.evaluate(()=>window.RideTrackerCommunityHub.viewer().viewState());
  await viewer.locator('[data-view="top"]').click();
  const after=await page.evaluate(()=>window.RideTrackerCommunityHub.viewer().viewState());
  expect(after.pitch).not.toBe(before.pitch);
  const painted=await viewer.locator('canvas').evaluate(canvas=>canvas.toDataURL().length);
  expect(painted).toBeGreaterThan(1000);
});

test('ride library receives miniatures and 3D detail action', async ({page}) => {
  await page.evaluate(()=>window.RideTrackerRideLibrary.show());
  await expect(page.locator('#rtRideLibrary [data-park="Europa-Park"] .rt62-mini')).toBeVisible();
  await page.locator('#rtRideLibrary [data-park="Europa-Park"]').click();
  await expect(page.locator('#rtRideLibrary [data-track="Voltron Nevera"] .rt62-mini')).toBeVisible();
  await page.locator('#rtRideLibrary [data-track="Voltron Nevera"]').click();
  await expect(page.locator('#rtRideLibrary [data-ride-id="e2e-voltron-ride"] .rt62-mini')).toBeVisible();
  await page.locator('#rtRideLibrary [data-ride-id="e2e-voltron-ride"]').click();
  await expect(page.locator('#rtRideLibrary .rt62-detail-model')).toContainText('3D-Modell & Heatmaps öffnen');
});
