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
  await expect(page.locator('#rtAdminCenter61')).toContainText('rollback/pre-community-foundation-20260808');
  const release=await page.evaluate(()=>window.RideTrackerRelease.manifest());
  expect(release.baseline.commit).toBe('8485df203665f8e93558fcbcac72a890fc6e9c3b');
});

test('navigation remains usable after orientation changes', async ({ page }) => {
  await page.setViewportSize({width:844,height:390});
  await expect(page.locator('#rtCommunityBottomNav')).toBeVisible();
  await page.locator('#rtCommunityBottomNav [data-community-route="community"]').click();
  await expect(page.locator('#rtCommunityDiscover')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  const box=await page.locator('#rtCommunityBottomNav').boundingBox();
  expect(box).not.toBeNull();expect(box.y+box.height).toBeLessThanOrEqual(845);
  expect(await eventLoopLag(page)).toBeLessThan(500);
});
