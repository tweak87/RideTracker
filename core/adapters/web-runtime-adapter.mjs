import {
  RideTrackerCore,
  Events,
  createTelemetrySample,
  createRideSession,
} from '../ridetracker-core.mjs';
import { registerBuiltinPlugins } from '../builtin-plugins.mjs';

const DEVICE_KEY = 'rideTracker.devices.v1';
const CAMERA_KEY = 'rideTracker.cameraSources.v1';

const readJson = (storage, key, fallback) => {
  try { return JSON.parse(storage?.getItem?.(key) || '') || fallback; }
  catch { return fallback; }
};

export function attachWebRuntimeAdapter(target = globalThis.window, storage = globalThis.localStorage) {
  if (!target?.addEventListener) throw new Error('Web runtime adapter requires an EventTarget-like window');

  const core = new RideTrackerCore();
  registerBuiltinPlugins(core.plugins);

  const syncDevices = () => {
    const registry = readJson(storage, DEVICE_KEY, {});
    const devices = Array.isArray(registry.devices) ? registry.devices : [];
    for (const device of devices) {
      if (!device?.id) continue;
      core.devices.upsert({ ...device, platform: 'web' });
    }
    return devices.length;
  };

  const syncCameras = () => {
    const cameraState = target.RideTrackerCameraSources?.snapshot?.() || readJson(storage, CAMERA_KEY, {});
    const sources = Array.isArray(cameraState.sources) ? cameraState.sources : [];
    for (const source of sources) {
      if (!source?.id) continue;
      core.cameras.upsert({ ...source, platform: 'web' });
    }
    core.cameras.select(cameraState.primary || cameraState.primaryId || null, cameraState.fallbacks || cameraState.fallbackIds || []);
    return sources.length;
  };

  const ingestRoutedTelemetry = detail => {
    if (!detail?.valid || !detail.metric || !detail.sourceId) return null;
    const [deviceId, ...channelParts] = String(detail.sourceId).split('/');
    const channelId = channelParts.join('/') || detail.metric;
    const sample = createTelemetrySample({
      timestampMs: Number(detail.timestamp ?? detail.timestampMs ?? globalThis.performance?.now?.() ?? Date.now()),
      deviceId: deviceId || 'web-device',
      channelId,
      metric: detail.metric,
      value: detail.value,
      unit: detail.unit ?? null,
      quality: Math.max(0, Math.min(1, Number(detail.quality ?? 1))),
      valid: true,
      sourceId: detail.sourceId,
      platform: 'web',
    });
    core.sensors.ingest(sample);
    return sample;
  };

  const onTelemetry = event => ingestRoutedTelemetry(event.detail || {});
  const onSourceSwitch = event => core.events.emit(Events.SOURCE_SWITCHED, { ...(event.detail || {}), platform: 'web' });
  const onCameraSources = () => syncCameras();
  const onRecordingStarted = event => {
    if (core.recording.active) return;
    core.recording.start(createRideSession({
      id: event.detail?.sessionId || undefined,
      platform: 'web',
      configurationSnapshot: core.snapshot(),
    }));
  };
  const onRecordingStopped = () => { if (core.recording.active) core.recording.stop(); };

  target.addEventListener('ridetracker:routed-telemetry', onTelemetry);
  target.addEventListener('ridetracker:source-switch', onSourceSwitch);
  target.addEventListener('ridetracker:camera-sources', onCameraSources);
  target.addEventListener('ridetracker:recording-started', onRecordingStarted);
  target.addEventListener('ridetracker:recording-stopped', onRecordingStopped);

  syncDevices();
  syncCameras();

  const api = {
    core,
    syncDevices,
    syncCameras,
    ingestRoutedTelemetry,
    snapshot: () => core.snapshot(),
    detach() {
      target.removeEventListener('ridetracker:routed-telemetry', onTelemetry);
      target.removeEventListener('ridetracker:source-switch', onSourceSwitch);
      target.removeEventListener('ridetracker:camera-sources', onCameraSources);
      target.removeEventListener('ridetracker:recording-started', onRecordingStarted);
      target.removeEventListener('ridetracker:recording-stopped', onRecordingStopped);
    },
  };

  target.RideTrackerCoreRuntime = api;
  target.dispatchEvent(new CustomEvent('ridetracker:core-ready', { detail: { coreVersion: core.snapshot().coreVersion } }));
  return api;
}

if (typeof window !== 'undefined' && !window.RideTrackerCoreRuntime) {
  attachWebRuntimeAdapter(window, window.localStorage);
}
