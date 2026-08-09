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
    const devices = Array.isArray(registry) ? registry : (Array.isArray(registry.devices) ? registry.devices : []);
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

  const startRecording = detail => {
    if (core.recording.active) return core.recording.session;
    const overrides = { platform: 'web', configurationSnapshot: core.snapshot() };
    if (detail?.sessionId) overrides.id = detail.sessionId;
    return core.recording.start(createRideSession(overrides));
  };

  const stopRecording = () => core.recording.active ? core.recording.stop() : null;

  const onTelemetry = event => ingestRoutedTelemetry(event.detail || {});
  const onSourceSwitch = event => core.events.emit(Events.SOURCE_SWITCHED, { ...(event.detail || {}), platform: 'web' });
  const onCameraSources = () => syncCameras();
  const onRecordingStarted = event => startRecording(event.detail || {});
  const onRecordingStopped = () => stopRecording();

  target.addEventListener('ridetracker:routed-telemetry', onTelemetry);
  target.addEventListener('ridetracker:source-switch', onSourceSwitch);
  target.addEventListener('ridetracker:camera-sources', onCameraSources);
  target.addEventListener('ridetracker:recording-started', onRecordingStarted);
  target.addEventListener('ridetracker:recording-stopped', onRecordingStopped);

  const document = target.document;
  const startButton = document?.getElementById?.('start');
  const stopButton = document?.getElementById?.('stop');
  const onStartClick = () => target.setTimeout?.(() => {
    const stop = document?.getElementById?.('stop');
    if (stop && stop.disabled === false) startRecording({});
  }, 0);
  const onStopClick = () => stopRecording();
  startButton?.addEventListener('click', onStartClick, true);
  stopButton?.addEventListener('click', onStopClick, true);

  syncDevices();
  syncCameras();

  const api = {
    core,
    syncDevices,
    syncCameras,
    ingestRoutedTelemetry,
    startRecording,
    stopRecording,
    snapshot: () => core.snapshot(),
    detach() {
      target.removeEventListener('ridetracker:routed-telemetry', onTelemetry);
      target.removeEventListener('ridetracker:source-switch', onSourceSwitch);
      target.removeEventListener('ridetracker:camera-sources', onCameraSources);
      target.removeEventListener('ridetracker:recording-started', onRecordingStarted);
      target.removeEventListener('ridetracker:recording-stopped', onRecordingStopped);
      startButton?.removeEventListener('click', onStartClick, true);
      stopButton?.removeEventListener('click', onStopClick, true);
    },
  };

  target.RideTrackerCoreRuntime = api;
  const CoreEvent = target.CustomEvent || globalThis.CustomEvent;
  if (CoreEvent) target.dispatchEvent(new CoreEvent('ridetracker:core-ready', { detail: { coreVersion: core.snapshot().coreVersion } }));
  return api;
}

if (typeof window !== 'undefined' && !window.RideTrackerCoreRuntime) {
  attachWebRuntimeAdapter(window, window.localStorage);
}
