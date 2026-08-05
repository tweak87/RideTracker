import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RideEngine } from './ride-engine.js';

const fixture = JSON.parse(await readFile(new URL('../test-data/engine-fixture.json', import.meta.url), 'utf8'));
const engine = new RideEngine();
engine.setCalibration(fixture.calibration);

let airtimeSamples = 0;
for (const sample of fixture.motion) {
  const result = engine.processMotion(sample);
  if (result.airtime) airtimeSamples += 1;
}

for (const point of fixture.locations) engine.processLocation(point);

const summary = engine.summary();
assert.equal(summary.positiveGSamples, fixture.expected.positiveGSamples);
assert.equal(summary.positiveGAverage, fixture.expected.positiveGAverage);
assert.equal(airtimeSamples, fixture.expected.airtimeSamples);
assert.equal(summary.acceptedLocations, fixture.expected.acceptedLocations);
assert.equal(summary.rejectedLocations, fixture.expected.rejectedLocations);
assert.ok(summary.distanceM >= fixture.expected.distanceMinM);
assert.ok(summary.distanceM <= fixture.expected.distanceMaxM);

console.log('Ride Engine fixture passed:', summary);
