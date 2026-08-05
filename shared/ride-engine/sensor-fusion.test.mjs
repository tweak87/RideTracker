import assert from 'node:assert/strict';
import { AltitudeFusion, QualityScorer, RidePhaseDetector, SensorSourceRegistry } from './sensor-fusion.js';

const altitude = new AltitudeFusion({ barometerLowPassAlpha: 0.5, gpsCorrectionAlpha: 0.1 });
assert.equal(altitude.updateBarometer(100), 0);
assert.equal(altitude.updateBarometer(102), 1);
altitude.correctWithGps(1.5);
assert.ok(altitude.gpsBias > 0);

const phases = new RidePhaseDetector({ stationHoldS: 2 });
assert.equal(phases.update({ t: 0, speedMs: 0, totalG: 1 }).phase, 'idle');
assert.equal(phases.update({ t: 2.1, speedMs: 0, totalG: 1 }).phase, 'ready');
assert.equal(phases.update({ t: 3, speedMs: 5, climbRateMs: 0.5, totalG: 1.1 }).phase, 'lift');
assert.equal(phases.update({ t: 4, speedMs: 12, longitudinalG: 0.6, totalG: 1.2 }).phase, 'launch');
assert.equal(phases.update({ t: 5, speedMs: 10, longitudinalG: -0.5, totalG: 1.1 }).phase, 'brake');

const quality = new QualityScorer();
quality.motion = 500; quality.gpsAccepted = 8; quality.gpsRejected = 2; quality.calibrated = true; quality.barometer = true;
assert.ok(quality.score() >= 80);

const registry = new SensorSourceRegistry();
registry.register({ id: 'phone', label: 'Telefon', capabilities: ['imu'], start() {}, stop() {} });
assert.equal(registry.list()[0].id, 'phone');
console.log('Ride Engine 2.0 tests passed');
