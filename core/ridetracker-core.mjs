export const CORE_VERSION = '2.0.0-alpha.1';

export class EventBus {
  #listeners = new Map();
  on(type, handler) {
    if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
    this.#listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }
  off(type, handler) { this.#listeners.get(type)?.delete(handler); }
  emit(type, payload = {}) {
    const event = Object.freeze({ type, timestampMs: performanceNow(), payload });
    for (const handler of this.#listeners.get(type) || []) handler(event);
    for (const handler of this.#listeners.get('*') || []) handler(event);
    return event;
  }
}

const performanceNow = () => globalThis.performance?.now?.() ?? Date.now();
const clone = value => structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));

export const Events = Object.freeze({
  RECORDING_STARTED: 'recording.started',
  RECORDING_STOPPED: 'recording.stopped',
  SENSOR_UPDATED: 'sensor.updated',
  CAMERA_CHANGED: 'camera.changed',
  HUD_LAYOUT_CHANGED: 'hud.layout.changed',
  RIDE_SAVED: 'ride.saved',
  RIDE_DELETED: 'ride.deleted',
  TELEMETRY_RECEIVED: 'telemetry.received',
  SOURCE_SWITCHED: 'source.switched',
  PLUGIN_REGISTERED: 'plugin.registered',
  DEVICE_CHANGED: 'device.changed',
});

export class PluginHost {
  constructor(eventBus = new EventBus()) { this.eventBus = eventBus; this.plugins = new Map(); }
  register(plugin) {
    validatePlugin(plugin);
    if (this.plugins.has(plugin.id)) throw new Error(`Plugin already registered: ${plugin.id}`);
    this.plugins.set(plugin.id, plugin);
    this.eventBus.emit(Events.PLUGIN_REGISTERED, { plugin: publicPlugin(plugin) });
    return plugin;
  }
  unregister(id) { return this.plugins.delete(id); }
  get(id) { return this.plugins.get(id) || null; }
  list(capability) {
    return [...this.plugins.values()].filter(p => !capability || p.capabilities.includes(capability)).map(publicPlugin);
  }
}

function validatePlugin(plugin) {
  if (!plugin || typeof plugin !== 'object') throw new TypeError('plugin must be an object');
  if (!plugin.id || !plugin.name || !plugin.version) throw new Error('plugin requires id, name and version');
  if (!Array.isArray(plugin.capabilities)) throw new Error('plugin.capabilities must be an array');
}
function publicPlugin(plugin) {
  return { id: plugin.id, name: plugin.name, version: plugin.version, capabilities: [...plugin.capabilities], settingsSchema: plugin.settingsSchema || null };
}

class RegistryManager {
  constructor(eventBus, changeEvent) { this.eventBus = eventBus; this.changeEvent = changeEvent; this.items = new Map(); }
  upsert(item) {
    if (!item?.id) throw new Error('item.id is required');
    this.items.set(item.id, clone(item));
    this.eventBus.emit(this.changeEvent, { item: clone(item) });
    return this.get(item.id);
  }
  remove(id) { const existed = this.items.delete(id); if (existed) this.eventBus.emit(this.changeEvent, { id, removed: true }); return existed; }
  get(id) { const item = this.items.get(id); return item ? clone(item) : null; }
  list() { return [...this.items.values()].map(clone); }
}

export class DeviceManager extends RegistryManager {
  constructor(eventBus) { super(eventBus, Events.DEVICE_CHANGED); }
}

export class SensorManager extends RegistryManager {
  constructor(eventBus) { super(eventBus, Events.SENSOR_UPDATED); this.latest = new Map(); }
  ingest(sample) {
    validateTelemetrySample(sample);
    this.latest.set(`${sample.deviceId}/${sample.channelId}`, clone(sample));
    this.eventBus.emit(Events.TELEMETRY_RECEIVED, { sample: clone(sample) });
    return sample;
  }
  latestFor(deviceId, channelId) { return clone(this.latest.get(`${deviceId}/${channelId}`) || null); }
}

export class CameraManager extends RegistryManager {
  constructor(eventBus) { super(eventBus, Events.CAMERA_CHANGED); this.primaryId = null; this.fallbackIds = []; }
  select(primaryId, fallbackIds = []) {
    this.primaryId = primaryId || null;
    this.fallbackIds = [...new Set(fallbackIds.filter(Boolean))];
    this.eventBus.emit(Events.CAMERA_CHANGED, { primaryId: this.primaryId, fallbackIds: [...this.fallbackIds] });
  }
  ordered() { return [this.primaryId, ...this.fallbackIds].filter(Boolean).map(id => this.get(id)).filter(Boolean); }
}

export class OverlayManager {
  constructor(eventBus) { this.eventBus = eventBus; this.layouts = new Map(); this.activeLayoutId = null; }
  saveLayout(layout) {
    if (!layout?.id || !Array.isArray(layout.widgets)) throw new Error('layout requires id and widgets');
    this.layouts.set(layout.id, clone(layout));
    this.eventBus.emit(Events.HUD_LAYOUT_CHANGED, { layout: clone(layout) });
  }
  activate(id) { if (!this.layouts.has(id)) throw new Error(`Unknown layout: ${id}`); this.activeLayoutId = id; this.eventBus.emit(Events.HUD_LAYOUT_CHANGED, { activeLayoutId: id }); }
  active() { return this.activeLayoutId ? clone(this.layouts.get(this.activeLayoutId)) : null; }
}

export class RecordingManager {
  constructor(eventBus) { this.eventBus = eventBus; this.active = false; this.session = null; }
  start(session = createRideSession()) {
    if (this.active) throw new Error('recording already active');
    this.active = true; this.session = clone(session); this.eventBus.emit(Events.RECORDING_STARTED, { session: clone(this.session) }); return clone(this.session);
  }
  stop() {
    if (!this.active) return this.session ? clone(this.session) : null;
    this.active = false; this.session.endedAt = new Date().toISOString(); this.eventBus.emit(Events.RECORDING_STOPPED, { session: clone(this.session) }); return clone(this.session);
  }
}

export class RidePackageManager {
  constructor(eventBus) { this.eventBus = eventBus; this.packages = new Map(); }
  save(pkg) { validateRidePackage(pkg); this.packages.set(pkg.id, clone(pkg)); this.eventBus.emit(Events.RIDE_SAVED, { id: pkg.id }); return this.get(pkg.id); }
  get(id) { const value = this.packages.get(id); return value ? clone(value) : null; }
  delete(id) { const removed = this.packages.delete(id); if (removed) this.eventBus.emit(Events.RIDE_DELETED, { id }); return removed; }
}

export class RideTrackerCore {
  constructor() {
    this.events = new EventBus();
    this.plugins = new PluginHost(this.events);
    this.devices = new DeviceManager(this.events);
    this.sensors = new SensorManager(this.events);
    this.cameras = new CameraManager(this.events);
    this.overlay = new OverlayManager(this.events);
    this.recording = new RecordingManager(this.events);
    this.ridePackages = new RidePackageManager(this.events);
  }
  snapshot() {
    return {
      coreVersion: CORE_VERSION,
      capturedAt: new Date().toISOString(),
      plugins: this.plugins.list(),
      devices: this.devices.list(),
      cameras: { primaryId: this.cameras.primaryId, fallbackIds: [...this.cameras.fallbackIds], sources: this.cameras.list() },
      hud: this.overlay.active(),
    };
  }
}

export function createTelemetrySample(overrides = {}) {
  return {
    timestampMs: 0,
    deviceId: 'unknown-device',
    channelId: 'unknown-channel',
    metric: 'unknown',
    value: null,
    unit: null,
    quality: 1,
    valid: true,
    ...overrides,
  };
}

export function validateTelemetrySample(sample) {
  if (!sample?.deviceId || !sample?.channelId || !sample?.metric) throw new Error('telemetry sample requires deviceId, channelId and metric');
  if (!Number.isFinite(Number(sample.timestampMs))) throw new Error('telemetry sample timestampMs must be finite');
  if (!Number.isFinite(Number(sample.quality)) || sample.quality < 0 || sample.quality > 1) throw new Error('telemetry sample quality must be 0..1');
  return true;
}

export function createRideSession(overrides = {}) {
  const id = globalThis.crypto?.randomUUID?.() || `ride-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    schemaVersion: '3.0.0-alpha.1',
    id,
    startedAt: new Date().toISOString(),
    endedAt: null,
    platform: 'unknown',
    telemetry: [],
    events: [],
    media: [],
    notes: { privateNote: '', communityComment: '' },
    rating: 0,
    configurationSnapshot: null,
    ...overrides,
  };
}

export function createRidePackage(session, overrides = {}) {
  if (!session?.id) throw new Error('session.id is required');
  return {
    schemaVersion: '3.0.0-alpha.1',
    id: session.id,
    session: clone(session),
    assets: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function validateRidePackage(pkg) {
  if (!pkg?.id || !pkg?.schemaVersion || !pkg?.session?.id) throw new Error('invalid RidePackage');
  return true;
}
