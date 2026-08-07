const runtimeState = new Map();
const connections = new Map();

const HEART_RATE_SERVICE = 'heart_rate';
const HEART_RATE_MEASUREMENT = 'heart_rate_measurement';
const RIDE_SERVICE = '7d1a0001-6f52-4a42-9d9f-524944455452';
const RIDE_TELEMETRY = '7d1a0002-6f52-4a42-9d9f-524944455452';

const definitions = [
  { id: 'internal-sensors', capabilities: ['motion.acceleration','motion.gyroscope','motion.orientation','location.position','location.speed','location.altitude','calibration.motion','calibration.location'] },
  { id: 'ble-heart-rate', capabilities: ['heart-rate.bpm','device.discovery','device.connection'] },
  { id: 'external-imu', capabilities: ['motion.acceleration','motion.gyroscope','motion.orientation','device.discovery','device.connection','calibration.motion'] },
  { id: 'external-gnss', capabilities: ['location.position','location.speed','location.altitude','device.discovery','device.connection','calibration.location'] },
  { id: 'camera-source', capabilities: ['camera.preview','camera.recording','calibration.camera'] },
  { id: 'media-export', capabilities: ['video.export','telemetry.export'] },
];

function capabilityAvailable(capability) {
  if (capability.startsWith('motion.')) return 'DeviceMotionEvent' in globalThis || 'DeviceOrientationEvent' in globalThis;
  if (capability.startsWith('location.')) return Boolean(globalThis.navigator?.geolocation);
  if (capability === 'heart-rate.bpm' || capability === 'device.discovery' || capability === 'device.connection') return Boolean(globalThis.navigator?.bluetooth?.requestDevice);
  if (capability.startsWith('camera.')) return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
  return true;
}

function classifyExternalPacket(packet = {}) {
  const pluginId = String(packet.pluginId || '');
  const deviceId = String(packet.deviceId || '').toLowerCase();
  if (pluginId === 'external-gnss' || deviceId.includes('gnss') || deviceId.includes('gps-receiver')) return 'external-gnss';
  if (pluginId === 'external-imu' || deviceId.includes('imu') || deviceId.includes('accelerometer') || deviceId.includes('gyro')) return 'external-imu';
  return null;
}

function cloneRuntime(runtime) {
  return runtime ? {
    ...runtime,
    capabilities: [...runtime.capabilities],
    availableCapabilities: [...runtime.availableCapabilities],
    sources: Array.isArray(runtime.sources) ? runtime.sources.map(source => ({ ...source })) : [],
    connection: runtime.connection ? { ...runtime.connection } : null,
  } : null;
}

function decodeHeartRate(value) {
  if (!value || value.byteLength < 2) return null;
  const flags = value.getUint8(0);
  return flags & 1 ? value.getUint16(1, true) : value.getUint8(1);
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
      previewActive: false,
      recordingActive: false,
      lastPreviewAt: null,
      sources: [],
      connection: null,
    });
  }

  const emitPluginTelemetry = detail => {
    target.dispatchEvent(new CustomEvent('ridetracker:plugin-telemetry', { detail }));
  };

  function setConnection(pluginId, patch) {
    const runtime = runtimeState.get(pluginId);
    if (!runtime) return;
    runtime.connection = { ...(runtime.connection || {}), ...patch, updatedAt: Date.now() };
    target.dispatchEvent(new CustomEvent('ridetracker:plugin-connection', { detail: { pluginId, connection: { ...runtime.connection } } }));
  }

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
    const runtimePluginId = classifyExternalPacket(packet);
    if (!runtimePluginId) return;
    const deviceId = String(packet.deviceId || runtimePluginId);
    const timestampMs = Number(packet.timestampMs ?? performance.now());
    for (const channel of Array.isArray(packet.channels) ? packet.channels : []) {
      if (!channel || typeof channel.metric !== 'string' || !Number.isFinite(Number(channel.value))) continue;
      emitPluginTelemetry({
        pluginId: runtimePluginId,
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

  async function connectHeartRate() {
    if (!target.navigator?.bluetooth?.requestDevice) throw new Error('Bluetooth-Suche wird von diesem Browser nicht unterstützt.');
    setConnection('ble-heart-rate', { status: 'searching' });
    const device = await target.navigator.bluetooth.requestDevice({ filters: [{ services: [HEART_RATE_SERVICE] }], optionalServices: ['battery_service'] });
    setConnection('ble-heart-rate', { status: 'connecting', deviceId: device.id, deviceName: device.name || 'BLE-Pulssensor' });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(HEART_RATE_SERVICE);
    const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
    await characteristic.startNotifications();
    const onValue = event => {
      const bpm = decodeHeartRate(event.target.value);
      if (!Number.isFinite(bpm)) return;
      target.dispatchEvent(new CustomEvent('ridetracker:heart-rate', { detail: { bpm, deviceId: device.id, deviceName: device.name || 'BLE-Pulssensor', quality: 1, timestampMs: performance.now() } }));
    };
    characteristic.addEventListener('characteristicvaluechanged', onValue);
    const cleanup = () => characteristic.removeEventListener('characteristicvaluechanged', onValue);
    connections.set('ble-heart-rate', { device, server, cleanup });
    device.addEventListener('gattserverdisconnected', () => { cleanup(); connections.delete('ble-heart-rate'); setConnection('ble-heart-rate', { status: 'disconnected' }); }, { once: true });
    setConnection('ble-heart-rate', { status: 'connected', deviceId: device.id, deviceName: device.name || 'BLE-Pulssensor' });
    return cloneRuntime(runtimeState.get('ble-heart-rate'));
  }

  function accessoryPackets(sample, device) {
    const timestampMs = performance.now();
    const quality = Math.max(0, Math.min(1, Number(sample.quality ?? 1)));
    const imu = [];
    const accel = [sample.accelerationX, sample.accelerationY, sample.accelerationZ].map(Number);
    const gyro = [sample.rotationX, sample.rotationY, sample.rotationZ].map(Number);
    if (accel.some(Number.isFinite)) {
      accel.forEach((value, index) => { if (Number.isFinite(value)) imu.push({ channelId: ['x','y','z'][index], metric: `acceleration${['X','Y','Z'][index]}`, value, unit: 'm/s²', quality }); });
      const finite = accel.filter(Number.isFinite); if (finite.length) imu.push({ channelId: 'acceleration', metric: 'acceleration', value: Math.hypot(...finite), unit: 'm/s²', quality });
    }
    if (gyro.some(Number.isFinite)) {
      gyro.forEach((value, index) => { if (Number.isFinite(value)) imu.push({ channelId: ['rx','ry','rz'][index], metric: `gyroscope${['X','Y','Z'][index]}`, value, unit: 'rad/s', quality }); });
      const finite = gyro.filter(Number.isFinite); if (finite.length) imu.push({ channelId: 'gyroscope', metric: 'gyroscope', value: Math.hypot(...finite), unit: 'rad/s', quality });
    }
    if (imu.length) target.dispatchEvent(new CustomEvent('ridetracker:external-telemetry', { detail: { pluginId: 'external-imu', deviceId: `external-imu-${device.id}`, timestampMs, quality, channels: imu } }));

    const gnss = [];
    const fields = [
      ['latitude','latitude','deg'],['longitude','longitude','deg'],['altitude','altitude','m'],['horizontalAccuracy','horizontalAccuracy','m']
    ];
    for (const [field, metric, unit] of fields) { const value = Number(sample[field]); if (Number.isFinite(value)) gnss.push({ channelId: metric, metric, value, unit, quality }); }
    const speedMS = Number(sample.speedMS); if (Number.isFinite(speedMS)) gnss.push({ channelId: 'speed', metric: 'speedKmh', value: speedMS * 3.6, unit: 'km/h', quality });
    if (gnss.length) target.dispatchEvent(new CustomEvent('ridetracker:external-telemetry', { detail: { pluginId: 'external-gnss', deviceId: `external-gnss-${device.id}`, timestampMs, quality, channels: gnss } }));
  }

  async function connectAccessory() {
    if (!target.navigator?.bluetooth?.requestDevice) throw new Error('Bluetooth-Suche wird von diesem Browser nicht unterstützt.');
    for (const id of ['external-imu','external-gnss']) setConnection(id, { status: 'searching' });
    const device = await target.navigator.bluetooth.requestDevice({ filters: [{ services: [RIDE_SERVICE] }], optionalServices: [RIDE_SERVICE] });
    for (const id of ['external-imu','external-gnss']) setConnection(id, { status: 'connecting', deviceId: device.id, deviceName: device.name || 'RideTracker Sensor' });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(RIDE_SERVICE);
    const characteristic = await service.getCharacteristic(RIDE_TELEMETRY);
    await characteristic.startNotifications();
    const decoder = new TextDecoder();
    const onValue = event => {
      try { const sample = JSON.parse(decoder.decode(event.target.value.buffer)); accessoryPackets(sample, device); } catch (_) {}
    };
    characteristic.addEventListener('characteristicvaluechanged', onValue);
    const cleanup = () => characteristic.removeEventListener('characteristicvaluechanged', onValue);
    connections.set('ride-accessory', { device, server, cleanup });
    device.addEventListener('gattserverdisconnected', () => { cleanup(); connections.delete('ride-accessory'); for (const id of ['external-imu','external-gnss']) setConnection(id, { status: 'disconnected' }); }, { once: true });
    for (const id of ['external-imu','external-gnss']) setConnection(id, { status: 'connected', deviceId: device.id, deviceName: device.name || 'RideTracker Sensor' });
    return { imu: cloneRuntime(runtimeState.get('external-imu')), gnss: cloneRuntime(runtimeState.get('external-gnss')) };
  }

  function disconnect(pluginId) {
    const key = pluginId === 'ble-heart-rate' ? 'ble-heart-rate' : 'ride-accessory';
    const connection = connections.get(key);
    try { connection?.cleanup?.(); connection?.device?.gatt?.disconnect?.(); } catch (_) {}
    connections.delete(key);
    if (key === 'ride-accessory') for (const id of ['external-imu','external-gnss']) setConnection(id, { status: 'disconnected' });
    else setConnection('ble-heart-rate', { status: 'disconnected' });
    return true;
  }

  const previewElement = () => target.document?.getElementById?.('preview') || null;
  const livePreviewStream = () => {
    const stream = previewElement()?.srcObject;
    return stream && typeof stream.getVideoTracks === 'function' && stream.getVideoTracks().some(track => track.readyState === 'live') ? stream : null;
  };

  const syncCamera = () => {
    const runtime = runtimeState.get('camera-source');
    if (!runtime) return;
    const snapshot = target.RideTrackerCameraSources?.snapshot?.();
    runtime.sources = Array.isArray(snapshot?.sources) ? snapshot.sources.map(source => ({ id: source.id, available: source.available !== false })) : [];
    runtime.previewActive = Boolean(livePreviewStream());
  };

  async function ensureCameraPreview(payload = {}) {
    const runtime = runtimeState.get('camera-source');
    if (!runtime) throw new Error('camera-source plugin runtime is not registered');
    const existing = livePreviewStream();
    if (existing) { runtime.previewActive = true; return existing; }
    if (!target.navigator?.mediaDevices?.getUserMedia) throw new Error('camera.preview capability is unavailable');
    const selected = target.RideTrackerCameraSources?.constraints?.();
    const constraints = payload.constraints || selected || { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
    const normalized = Object.prototype.hasOwnProperty.call(constraints, 'video') ? constraints : { video: constraints, audio: false };
    const stream = await target.navigator.mediaDevices.getUserMedia(normalized);
    const preview = previewElement();
    if (preview) {
      preview.srcObject = stream; preview.muted = true; preview.autoplay = true; preview.playsInline = true; preview.setAttribute('playsinline', ''); preview.removeAttribute('controls');
      try { await preview.play(); } catch (_) {}
    }
    target.RideTrackerCameraSources?.syncFromStream?.(stream);
    runtime.previewActive = true; runtime.lastPreviewAt = performance.now();
    target.dispatchEvent(new CustomEvent('ridetracker:camera-plugin-preview', { detail: { pluginId: 'camera-source', stream } }));
    return stream;
  }

  function currentExportVideo() { const blob = target.RideTrackerPostRecording?.blob?.(); return blob instanceof Blob ? blob : null; }
  function currentExportTelemetry() {
    const telemetry = target.RideTrackerPostRecording?.telemetry?.() || { samples: [] };
    return { schemaVersion: '1.0.0', exportedAt: new Date().toISOString(), rideId: target.RideTrackerRideLibrary?.activeRideId?.() || null, source: 'RideTrackerWeb', samples: Array.isArray(telemetry.samples) ? telemetry.samples : [] };
  }

  const markRecordingStarted = () => { const runtime = runtimeState.get('camera-source'); if (runtime) { runtime.recordingActive = true; runtime.previewActive = Boolean(livePreviewStream()); } };
  const markRecordingStopped = () => { const runtime = runtimeState.get('camera-source'); if (runtime) { runtime.recordingActive = false; runtime.previewActive = Boolean(livePreviewStream()); } };

  target.addEventListener('ridetracker:heart-rate', onHeartRate);
  target.addEventListener('ridetracker:external-telemetry', onExternalTelemetry);
  target.addEventListener('ridetracker:plugin-telemetry', markTelemetry);
  target.addEventListener('ridetracker:routed-telemetry', markTelemetry);
  target.addEventListener('ridetracker:camera-sources', syncCamera);
  target.addEventListener('ridetracker:recording-started', markRecordingStarted);
  target.addEventListener('ridetracker:recording-stopped', markRecordingStopped);
  syncCamera();

  const api = {
    list: () => [...runtimeState.values()].map(cloneRuntime),
    get: id => cloneRuntime(runtimeState.get(id)),
    byCapability: capability => api.list().filter(runtime => runtime.capabilities.includes(capability)),
    async invoke(pluginId, operation, payload = {}) {
      if (pluginId === 'camera-source') {
        if (operation === 'ensurePreview') return ensureCameraPreview(payload);
        if (operation === 'previewStream') return livePreviewStream();
        if (operation === 'state') return api.get('camera-source');
        throw new Error(`Unsupported camera-source operation: ${operation}`);
      }
      if (pluginId === 'ble-heart-rate') {
        if (operation === 'connect' || operation === 'scanAndConnect') return connectHeartRate();
        if (operation === 'disconnect') return disconnect(pluginId);
        if (operation === 'state') return api.get(pluginId);
      }
      if (pluginId === 'external-imu' || pluginId === 'external-gnss') {
        if (operation === 'connect' || operation === 'scanAndConnect') return connectAccessory();
        if (operation === 'disconnect') return disconnect(pluginId);
        if (operation === 'state') return api.get(pluginId);
      }
      if (pluginId === 'media-export') {
        if (operation === 'rawVideo') return currentExportVideo();
        if (operation === 'telemetry') return currentExportTelemetry();
        if (operation === 'state') return { ...api.get('media-export'), hasVideo: Boolean(currentExportVideo()), telemetrySamples: currentExportTelemetry().samples.length };
        throw new Error(`Unsupported media-export operation: ${operation}`);
      }
      throw new Error(`Unsupported web plugin runtime operation for ${pluginId}: ${operation}`);
    },
    refresh() { for (const runtime of runtimeState.values()) runtime.availableCapabilities = runtime.capabilities.filter(capabilityAvailable); syncCamera(); return api.list(); },
    detach() {
      target.removeEventListener('ridetracker:heart-rate', onHeartRate);
      target.removeEventListener('ridetracker:external-telemetry', onExternalTelemetry);
      target.removeEventListener('ridetracker:plugin-telemetry', markTelemetry);
      target.removeEventListener('ridetracker:routed-telemetry', markTelemetry);
      target.removeEventListener('ridetracker:camera-sources', syncCamera);
      target.removeEventListener('ridetracker:recording-started', markRecordingStarted);
      target.removeEventListener('ridetracker:recording-stopped', markRecordingStopped);
      for (const id of [...connections.keys()]) disconnect(id === 'ble-heart-rate' ? id : 'external-imu');
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
