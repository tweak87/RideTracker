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

const unavailableEstimator = gps.createEstimator();
const unavailable = unavailableEstimator.update({
  latitude: 50,
  longitude: 8,
  horizontalAccuracyM: 97,
  gpsTimestampMs: 1_000,
  nativeSpeedMS: null,
});
assert.equal(unavailable.speedMS, null, 'an unresolved first fix must not be displayed as 0 km/h');
assert.equal(unavailable.source, 'unavailable');

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

const lockedStationaryEstimator = gps.createEstimator();
const stationaryLatitude = 50;
const jitterSequence = [0, 0.000004, -0.000003, 0.00009, 0.000002, -0.000004, 0.000003];
const lockedResults = jitterSequence.map((offset, index) => lockedStationaryEstimator.update({
  latitude: stationaryLatitude + offset,
  longitude: 8,
  horizontalAccuracyM: 8,
  gpsTimestampMs: 1_000 + index * 1_000,
  nativeSpeedMS: index ? 0 : null,
}));
assert.ok(lockedResults.slice(2).every(result => result.speedMS === 0), 'one displaced stationary fix must never create a speed spike');
assert.equal(lockedResults.at(-1).stationaryLocked, true, 'stable fixes must engage the stationary lock');

const launchAfterStopEstimator = gps.createEstimator();
for (let index = 0; index < 4; index += 1) launchAfterStopEstimator.update({
  latitude: 50,
  longitude: 8,
  horizontalAccuracyM: 4,
  gpsTimestampMs: 1_000 + index * 1_000,
  nativeSpeedMS: 0,
});
launchAfterStopEstimator.update({latitude:50.00005,longitude:8,horizontalAccuracyM:4,gpsTimestampMs:5_000,nativeSpeedMS:6});
const launched = launchAfterStopEstimator.update({latitude:50.00014,longitude:8,horizontalAccuracyM:4,gpsTimestampMs:6_000,nativeSpeedMS:10});
assert.ok(launched.speedMS > 3, 'two strong native fixes must release the stationary lock');

const derivedLaunchEstimator = gps.createEstimator();
for (let index = 0; index < 4; index += 1) derivedLaunchEstimator.update({
  latitude: 50,
  longitude: 8,
  horizontalAccuracyM: 3,
  gpsTimestampMs: 1_000 + index * 1_000,
  nativeSpeedMS: null,
});
derivedLaunchEstimator.update({latitude:50.00008,longitude:8,horizontalAccuracyM:3,gpsTimestampMs:5_000,nativeSpeedMS:null});
const derivedLaunch = derivedLaunchEstimator.update({latitude:50.00018,longitude:8,horizontalAccuracyM:3,gpsTimestampMs:6_000,nativeSpeedMS:null});
assert.ok(derivedLaunch.speedMS > 2, 'two directionally consistent geometry fixes must release the stationary lock');

const impossibleEstimator = gps.createEstimator();
impossibleEstimator.update({ latitude: 50, longitude: 8, horizontalAccuracyM: 3, gpsTimestampMs: 1_000 });
const impossible = impossibleEstimator.update({ latitude: 51, longitude: 8, horizontalAccuracyM: 3, gpsTimestampMs: 2_000 });
assert.equal(impossible.speedMS, null, 'implausible GPS jumps must be rejected without inventing a zero');

const poorAccuracyEstimator = gps.createEstimator();
for (let index = 0; index < 4; index += 1) {
  poorAccuracyEstimator.update({
    latitude: 50 + index * 0.00018,
    longitude: 8,
    horizontalAccuracyM: 97,
    gpsTimestampMs: 1_000 + index * 1_000,
    nativeSpeedMS: 0,
  });
}
const poorAccuracy = poorAccuracyEstimator.snapshot();
assert.ok(poorAccuracy.smoothedSpeedMS > 8, `sustained movement with a poor iOS fix must not stay at zero: ${poorAccuracy.smoothedSpeedMS}`);

assert.ok(Math.abs(gps.bearingDegrees({latitude:50,longitude:8},{latitude:50.001,longitude:8})) < 0.1);

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
