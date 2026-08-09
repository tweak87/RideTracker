export const RIDE_SESSION_SCHEMA_VERSION = '2.0.0';

export function validateRideSession(document) {
  const errors = [];
  if (!document || typeof document !== 'object') errors.push('Session ist kein JSON-Objekt.');
  if (document?.schemaVersion !== RIDE_SESSION_SCHEMA_VERSION) {
    errors.push(`Nicht unterstützte schemaVersion: ${document?.schemaVersion ?? 'fehlt'}`);
  }
  if (!Array.isArray(document?.samples)) errors.push('samples fehlt oder ist kein Array.');
  if (!Array.isArray(document?.events)) errors.push('events fehlt oder ist kein Array.');
  if (!document?.summary || typeof document.summary !== 'object') errors.push('summary fehlt.');
  return { valid: errors.length === 0, errors };
}

export function normalizeRideSession(document) {
  const validation = validateRideSession(document);
  if (!validation.valid) throw new Error(validation.errors.join(' '));

  const samples = document.samples
    .filter((sample) => Number.isFinite(Number(sample.timestamp)))
    .map((sample) => ({
      ...sample,
      timestamp: Number(sample.timestamp),
      speedMS: nullableNumber(sample.speedMS ?? sample.speed),
      latitude: nullableNumber(sample.latitude),
      longitude: nullableNumber(sample.longitude),
      relativeAltitudeM: nullableNumber(sample.relativeAltitudeM ?? sample.relativeAltitude),
      totalG: nullableNumber(sample.totalG),
      normalG: nullableNumber(sample.normalG),
      lateralG: nullableNumber(sample.lateralG),
      longitudinalG: nullableNumber(sample.longitudinalG),
      qualityScore: Number.isFinite(Number(sample.qualityScore)) ? Number(sample.qualityScore) : null,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const events = document.events
    .filter((event) => Number.isFinite(Number(event.timestamp)) && typeof event.type === 'string')
    .map((event) => ({ timestamp: Number(event.timestamp), type: event.type }))
    .sort((a, b) => a.timestamp - b.timestamp);

  return {
    ...document,
    samples,
    events,
    durationSeconds: Number(document.summary?.durationSeconds ?? samples.at(-1)?.timestamp ?? 0),
  };
}

export async function readRideSessionFile(file) {
  const text = await file.text();
  return normalizeRideSession(JSON.parse(text));
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
