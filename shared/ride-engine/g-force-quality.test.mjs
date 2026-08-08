import assert from 'node:assert/strict';

await import('./g-force-quality.js');

const quality = globalThis.RideTrackerGForceQuality;
assert.ok(quality);

const metrics = quality.forceMetrics({normal:1, lateral:0.3, longitudinal:0.4});
assert.equal(metrics.horizontalG, 0.5);
assert.ok(Math.abs(metrics.totalG - Math.sqrt(1.25)) < 1e-12);
assert.ok(Math.abs(metrics.lateralMS2 - 2.941995) < 1e-9);

const stable = Array.from({length:30}, (_, index) => ({
  x:(index % 2 ? 1 : -1) * 0.002,
  y:0,
  z:1,
}));
const compatible = quality.calibrationCompatibility({up:[0,0,1]}, stable);
assert.equal(compatible.ready, true);
assert.equal(compatible.compatible, true);

const changed = quality.calibrationCompatibility({up:[0,0,1]}, Array.from({length:30}, () => ({x:0.5,y:0,z:0.8660254})));
assert.equal(changed.compatible, false);
assert.equal(changed.reason, 'orientation-changed');
assert.ok(changed.angleDeg > 29 && changed.angleDeg < 31);

const moving = quality.calibrationCompatibility({up:[0,0,1]}, Array.from({length:30}, (_, index) => ({x:index % 2 ? 0.25:-0.25,y:0,z:1})));
assert.equal(moving.compatible, false);
assert.equal(moving.reason, 'device-moving');

console.log('G-force quality tests passed.');
