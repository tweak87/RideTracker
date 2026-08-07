import assert from 'node:assert/strict';
import {
  EventBus, Events, PluginHost, RideTrackerCore,
  createTelemetrySample, createRideSession, createRidePackage,
  validateRidePackage,
} from './ridetracker-core.mjs';
import { builtinPlugins, BuiltinCapabilities, registerBuiltinPlugins, createPluginInstance } from './builtin-plugins.mjs';

const bus = new EventBus();
let seen = null;
bus.on('x', event => { seen = event; });
bus.emit('x', { ok: true });
assert.equal(seen.payload.ok, true);

const plugins = new PluginHost(bus);
plugins.register({ id: 'ble-heart', name: 'BLE Heart Rate', version: '1.0.0', capabilities: [BuiltinCapabilities.HEART_RATE_BPM] });
assert.equal(plugins.list(BuiltinCapabilities.HEART_RATE_BPM).length, 1);
assert.throws(() => plugins.register({ id: 'ble-heart', name: 'duplicate', version: '1', capabilities: [] }));

const core = new RideTrackerCore();
const observed = [];
core.events.on('*', event => observed.push(event.type));
core.devices.upsert({ id: 'phone', name: 'Smartphone', type: 'internal', enabled: true });
core.cameras.upsert({ id: 'rear', name: 'Rear camera', available: true });
core.cameras.select('rear');
core.overlay.saveLayout({ id: 'landscape', orientation: 'landscape', widgets: [] });
core.overlay.activate('landscape');
registerBuiltinPlugins(core.plugins);
assert.equal(core.plugins.list().length, builtinPlugins.length);
assert.equal(core.plugins.list(BuiltinCapabilities.HEART_RATE_BPM).some(p => p.id === 'ble-heart-rate'), true);
assert.equal(core.plugins.list(BuiltinCapabilities.CAMERA_RECORDING).some(p => p.id === 'camera-source'), true);
assert.equal(core.plugins.list(BuiltinCapabilities.LOCATION_SPEED).some(p => p.id === 'external-gnss'), true);
assert.equal(core.plugins.list(BuiltinCapabilities.MOTION_ACCELERATION).some(p => p.id === 'external-imu'), true);

const imuInstance = createPluginInstance('external-imu');
assert.equal(imuInstance.settings.sampleRateHz, 200);
assert.equal(imuInstance.settings.transport, 'bluetooth-le');
assert.equal(imuInstance.calibration.zeroBias, true);

const sample = createTelemetrySample({ timestampMs: 123.4, deviceId: 'phone', channelId: 'gps-speed', metric: 'speedKmh', value: 87.2, unit: 'km/h', quality: 0.93 });
core.sensors.ingest(sample);
assert.equal(core.sensors.latestFor('phone', 'gps-speed').value, 87.2);

const session = core.recording.start(createRideSession({ platform: 'test' }));
assert.equal(core.recording.active, true);
const stopped = core.recording.stop();
assert.equal(stopped.id, session.id);
assert.equal(core.recording.active, false);

const snap = core.snapshot();
assert.equal(snap.coreVersion.startsWith('2.'), true);
assert.equal(snap.devices.length, 1);
assert.equal(snap.cameras.primaryId, 'rear');
assert.equal(snap.hud.id, 'landscape');
assert.equal(snap.plugins.length, builtinPlugins.length);

const pkg = createRidePackage({ ...stopped, configurationSnapshot: snap });
assert.equal(validateRidePackage(pkg), true);
core.ridePackages.save(pkg);
assert.equal(core.ridePackages.get(pkg.id).session.configurationSnapshot.cameras.primaryId, 'rear');
assert.equal(observed.includes(Events.TELEMETRY_RECEIVED), true);
assert.equal(observed.includes(Events.RECORDING_STARTED), true);
assert.equal(observed.includes(Events.RIDE_SAVED), true);

console.log('RideTracker Core contract tests passed');
