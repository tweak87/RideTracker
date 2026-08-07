const runtimeState = new Map();

const definitions = [
  { id: 'internal-sensors', capabilities: ['motion.acceleration','motion.gyroscope','motion.orientation','location.position','location.speed','location.altitude','calibration.motion','calibration.location'] },
  { id: 'ble-heart-rate', capabilities: ['heart-rate.bpm'] },
  { id: 'external-imu', capabilities: ['motion.acceleration','motion.gyroscope','motion.orientation','calibration.motion'] },
  { id: 'external-gnss', capabilities: ['location.position','location.speed','location.altitude','calibration.location'] },
  { id: 'camera-source', capabilities: ['camera.preview','camera.recording','calibration.camera'] },
];

function capabilityAvailable(capability) {
  if (capability.startsWith('motion.')) return 'DeviceMotionEvent' in globalThis || 'DeviceOrientationEvent' in globalThis;
  if (capability.startsWith('location.')) return Boolean(globalThis.navigator?.geolocation);
  if (capability === 'heart-rate.bpm') return Boolean(globalThis.navigator?.bluetooth);
  if (capability.startsWith('camera.')) return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
  return true;
}

function isExternalGnssPacket(packet = {}) {
  const pluginId = String(packet.pluginId || '');
  const deviceId = String(packet.deviceId || '').toLowerCase();
  return pluginId === 'external-gnss' || deviceId.includes('gnss') || deviceId.includes('gps-receiver');
}

function attach(target = globalThis.window) {
  const coreRuntime = target?.RideTrackerCoreRuntime;
  if (!coreRuntime?.core) return null;

  for (const definition of definitions) {
    const plugin = coreRuntime.core.plugins.get(definition.id);
    if (!plugin) continue;
    runtimeState.set(definition.id, {
      pluginId: definition.id,
      capabilities: [...definition.capabilities],
      availableCapabilities: definition.capabilities.filter(capabilityAvailable),
      active: true,
      lastTelemetryAt: null,
    });
  }

  const emitPluginTelemetry = detail => {
    target.dispatchEvent(new CustomEvent('ridetracker:plugin-telemetry', { detail }));
  };

  const onHeartRate = event => {
    const bpm = Number(event.detail?.bpm);
    if (!Number.isFinite(bpm) || bpm <= 0) return;
    const timestampMs = Number(event.detail?.timestampMs ?? performance.now());
    emitPluginTelemetry({
      pluginId: 'ble-heart-rate',
      deviceId: String(event.detail?.deviceId || 'ble-heart'),
      channelId: 'heartRate',
      metric: 'heartRateBpm',
      value: bpm,
      quality: Math.max(0, Math.min(1, Number(event.detail?.quality ?? 1))),
      timestampMs,
      unit: 'bpm',
    });
  };

  const onExternalTelemetry = event => {
    const packet = event.detail || {};
    if (!isExternalGnssPacket(packet)) return;
    const deviceId = String(packet.deviceId || 'external-gnss');
    const timestampMs = Number(packet.timestampMs ?? performance.now());
    for (const channel of Array.isArray(packet.channels) ? packet.channels : []) {
      if (!channel || typeof channel.metric !== 'string' || !Number.isFinite(Number(channel.value))) continue;
      emitPluginTelemetry({
        pluginId: 'external-gnss',
        deviceId,
        channelId: String(channel.channelId || channel.metric),
        metric: channel.metric,
        value: Number(channel.value),
        quality: Math.max(0, Math.min(1, Number(channel.quality ?? packet.quality ?? 1))),
        timestampMs,
        unit: channel.unit ?? null,
      });
    }
  };

  const markTelemetry = event => {
    const detail = event.detail || {};
    const sourceId = String(detail.sourceId || '');
    let pluginId = String(detail.pluginId || 'internal-sensors');
    if (!detail.pluginId) {
      if (sourceId.startsWith('ble-heart')) pluginId = 'ble-heart-rate';
      else if (sourceId.startsWith('external-imu')) pluginId = 'external-imu';
      else if (sourceId.startsWith('external-gnss')) pluginId = 'external-gnss';
    }
    const runtime = runtimeState.get(pluginId);
    if (runtime) runtime.lastTelemetryAt = Number(detail.timestamp ?? detail.timestampMs ?? performance.now());
  };

  const syncCamera = () => {
    const runtime = runtimeState.get('camera-source');
    if (!runtime) return;
    const snapshot = target.RideTrackerCameraSources?.snapshot?.();
    runtime.sources = Array.isArray(snapshot?.sources) ? snapshot.sources.map(source => ({ id: source.id, available: source.available !== false })) : [];
  };

  target.addEventListener('ridetracker:heart-rate', onHeartRate);
  target.addEventListener('ridetracker:external-telemetry', onExternalTelemetry);
  target.addEventListener('ridetracker:plugin-telemetry', markTelemetry);
  target.addEventListener('ridetracker:routed-telemetry', markTelemetry);
  target.addEventListener('ridetracker:camera-sources', syncCamera);
  syncCamera();

  const api = {
    list: () => [...runtimeState.values()].map(runtime => ({ ...runtime, capabilities: [...runtime.capabilities], availableCapabilities: [...runtime.availableCapabilities] })),
    get: id => {
      const runtime = runtimeState.get(id);
      return runtime ? { ...runtime, capabilities: [...runtime.capabilities], availableCapabilities: [...runtime.availableCapabilities] } : null;
    },
    byCapability: capability => api.list().filter(runtime => runtime.capabilities.includes(capability)),
    refresh() {
      for (const runtime of runtimeState.values()) runtime.availableCapabilities = runtime.capabilities.filter(capabilityAvailable);
      syncCamera();
      return api.list();
    },
    detach() {
      target.removeEventListener('ridetracker:heart-rate', onHeartRate);
      target.removeEventListener('ridetracker:external-telemetry', onExternalTelemetry);
      target.removeEventListener('ridetracker:plugin-telemetry', markTelemetry);
      target.removeEventListener('ridetracker:routed-telemetry', markTelemetry);
      target.removeEventListener('ridetracker:camera-sources', syncCamera);
      runtimeState.clear();
    },
  };

  target.RideTrackerWebPlugins = api;
  target.dispatchEvent(new CustomEvent('ridetracker:web-plugins-ready', { detail: { plugins: api.list() } }));
  return api;
}

if (typeof window !== 'undefined') {
  if (window.RideTrackerCoreRuntime) attach(window);
  else window.addEventListener('ridetracker:core-ready', () => attach(window), { once: true });
}

export { attach as attachWebPluginRuntimes };
