import assert from 'node:assert/strict';

await import('./gps-speed.js');

const gps = globalThis.RideTrackerGpsMath;
assert.ok(gps, 'RideTrackerGpsMath must be available');

assert.equal(gps.finite(null), false, 'null must not be interpreted as zero');
assert.equal(gps.finite(''), false, 'empty strings must not be interpreted as zero');
assert.equal(gps.finite(0), true, 'zero is a valid finite value');

const nativeEstimator = gps.createEstimator();
const native = nativeEstimator.update({
  latitude: 50,
  longitude: 8,
  horizontalAccuracyM: 3,
  gpsTimestampMs: 1_000,
  nativeSpeedMS: 12,
});
assert.equal(native.source, 'native');
assert.equal(native.speedMS, 12);

const derivedEstimator = gps.createEstimator();
derivedEstimator.update({
  latitude: 50,
  longitude: 8,
  horizontalAccuracyM: 3,
  gpsTimestampMs: 1_000,
  nativeSpeedMS: null,
});
const derived = derivedEstimator.update({
  latitude: 50.00012,
  longitude: 8,
  horizontalAccuracyM: 3,
  gpsTimestampMs: 2_000,
  nativeSpeedMS: null,
});
assert.equal(derived.source, 'derived');
assert.ok(derived.speedMS > 4 && derived.speedMS < 12, `unexpected derived speed: ${derived.speedMS}`);

const stationaryEstimator = gps.createEstimator();
stationaryEstimator.update({
  latitude: 50,
  longitude: 8,
  horizontalAccuracyM: 8,
  gpsTimestampMs: 1_000,
});
const stationary = stationaryEstimator.update({
  latitude: 50.000005,
  longitude: 8.000005,
  horizontalAccuracyM: 8,
  gpsTimestampMs: 2_000,
});
assert.equal(stationary.speedMS, 0, 'GPS jitter inside the accuracy radius must stay stationary');

const impossibleEstimator = gps.createEstimator();
impossibleEstimator.update({ latitude: 50, longitude: 8, horizontalAccuracyM: 3, gpsTimestampMs: 1_000 });
const impossible = impossibleEstimator.update({ latitude: 51, longitude: 8, horizontalAccuracyM: 3, gpsTimestampMs: 2_000 });
assert.equal(impossible.speedMS, 0, 'implausible GPS jumps must be rejected');

const merged = gps.mergeCanonicalGpsIntoSamples([
  { timestamp: 0, speedMS: 0, speedKmh: 0, gpsSource: 'phone-gps' },
  { timestamp: 1, speedMS: 0, speedKmh: 0, gpsSource: 'phone-gps' },
  { timestamp: 1, speedMS: 20, speedKmh: 72, speedSource: 'external-gnss' },
], [
  { timestamp: 0, latitude: 50, longitude: 8, speedMS: 0, speedKmh: 0, speedSource: 'stationary' },
  { timestamp: 1, latitude: 50.00012, longitude: 8, speedMS: 15, speedKmh: 54, speedSource: 'derived' },
]);
assert.equal(merged[1].speedMS, 15, 'canonical GPS speed must replace a stale phone-GPS zero');
assert.equal(merged[1].speedKmh, 54);
assert.equal(merged[1].speedSource, 'derived');
assert.equal(merged[2].speedMS, 20, 'external GNSS speed must retain priority');

const packageMaximum = gps.packageMaxSpeedKmh({
  maxSpeedKmh: 10,
  document: {
    samples: [{ speedMS: 12 }],
    gps: { points: [{ speedKmh: 54 }] },
  },
});
assert.equal(packageMaximum, 54, 'package maximum must include canonical GPS points');

console.log('Canonical GPS speed tests passed.');
