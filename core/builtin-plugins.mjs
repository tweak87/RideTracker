export const BuiltinCapabilities = Object.freeze({
  MOTION: 'sensor.motion',
  GPS: 'sensor.gps',
  BAROMETER: 'sensor.barometer',
  HEART_RATE: 'sensor.heartRate',
  IMU: 'sensor.imu',
  GNSS: 'sensor.gnss',
  CAMERA: 'camera.video',
  MICROPHONE: 'audio.microphone',
});

const plugin = (id, name, capabilities, settingsSchema = {}, calibrationSchema = null) => ({
  id,
  name,
  version: '1.0.0',
  capabilities,
  settingsSchema,
  calibrationSchema,
});

export const builtinPlugins = Object.freeze([
  plugin('internal-sensors', 'Interne Smartphone-Sensoren', [BuiltinCapabilities.MOTION, BuiltinCapabilities.GPS, BuiltinCapabilities.BAROMETER], {
    sampleRateHz: { type: 'number', min: 20, max: 400, default: 100 },
    gpsAccuracy: { type: 'enum', values: ['balanced', 'navigation'], default: 'navigation' },
  }, {
    mode: { type: 'enum', values: ['manual', 'automatic'], default: 'manual' },
    forwardEdge: { type: 'enum', values: ['top', 'bottom', 'left', 'right'], default: 'top' },
    biasCorrection: { type: 'boolean', default: true },
  }),
  plugin('ble-heart-rate', 'Bluetooth Herzfrequenz', [BuiltinCapabilities.HEART_RATE], {
    autoReconnect: { type: 'boolean', default: true },
    staleAfterMs: { type: 'number', min: 1000, max: 15000, default: 3000 },
  }, {
    validateSignal: { type: 'boolean', default: true },
  }),
  plugin('external-imu', 'Externe IMU', [BuiltinCapabilities.IMU, BuiltinCapabilities.MOTION], {
    transport: { type: 'enum', values: ['bluetooth-le', 'usb', 'network'], default: 'bluetooth-le' },
    sampleRateHz: { type: 'number', min: 50, max: 1000, default: 200 },
    vibrationHighPassHz: { type: 'number', min: 1, max: 50, default: 8 },
  }, {
    zeroBias: { type: 'boolean', default: true },
    orientationMatrix: { type: 'matrix3', required: true },
  }),
  plugin('external-gnss', 'Externer GNSS-Empfänger', [BuiltinCapabilities.GNSS, BuiltinCapabilities.GPS], {
    transport: { type: 'enum', values: ['bluetooth-le', 'usb', 'network'], default: 'bluetooth-le' },
    minimumQuality: { type: 'number', min: 0, max: 1, default: 0.75 },
    maxAgeMs: { type: 'number', min: 100, max: 10000, default: 2000 },
    acceptRtk: { type: 'boolean', default: true },
  }, {
    referenceAltitude: { type: 'number', nullable: true },
    clockOffsetMs: { type: 'number', default: 0 },
  }),
  plugin('camera-source', 'Kameraquelle', [BuiltinCapabilities.CAMERA, BuiltinCapabilities.MICROPHONE], {
    sourceId: { type: 'string', nullable: true },
    fallbackSourceIds: { type: 'array', items: 'string', default: [] },
    resolution: { type: 'enum', values: ['720p', '1080p', '4k'], default: '1080p' },
    frameRate: { type: 'enum', values: [30, 60], default: 60 },
    audioEnabled: { type: 'boolean', default: true },
  }),
]);

export function registerBuiltinPlugins(host) {
  return builtinPlugins.map(definition => host.register({
    ...definition,
    capabilities: [...definition.capabilities],
    settingsSchema: structuredClone(definition.settingsSchema),
    calibrationSchema: definition.calibrationSchema ? structuredClone(definition.calibrationSchema) : null,
  }));
}

export function createPluginInstance(pluginId, overrides = {}) {
  const definition = builtinPlugins.find(value => value.id === pluginId);
  if (!definition) throw new Error(`Unknown built-in plugin: ${pluginId}`);
  return {
    pluginId,
    instanceId: overrides.instanceId || `${pluginId}-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
    enabled: overrides.enabled ?? true,
    settings: { ...defaultValues(definition.settingsSchema), ...(overrides.settings || {}) },
    calibration: definition.calibrationSchema ? { ...defaultValues(definition.calibrationSchema), ...(overrides.calibration || {}) } : null,
    metadata: { ...(overrides.metadata || {}) },
  };
}

function defaultValues(schema) {
  return Object.fromEntries(Object.entries(schema || {}).flatMap(([key, rule]) => Object.prototype.hasOwnProperty.call(rule, 'default') ? [[key, structuredClone(rule.default)]] : []));
}
