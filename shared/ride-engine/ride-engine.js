export class RideEngine {
  constructor(config = {}) {
    this.config = {
      gravityMs2: 9.80665,
      positiveGThreshold: 1.0,
      airtimeThreshold: 0.3,
      gps: {
        maxHorizontalAccuracyM: 40,
        stationarySpeedMs: 0.8,
        minimumAcceptedMovementM: 1.5,
        maxImpliedSpeedMs: 90,
        accuracyMultiplier: 0.55,
      },
      ...config,
    };
    this.reset();
  }

  reset() {
    this.calibration = null;
    this.lastLocation = null;
    this.distanceM = 0;
    this.positiveGSum = 0;
    this.positiveGCount = 0;
    this.acceptedLocations = 0;
    this.rejectedLocations = 0;
  }

  setCalibration({ up, lateral, forward, source = 'manual' }) {
    this.calibration = { up, lateral, forward, source };
  }

  processMotion(sample) {
    const vector = [sample.x, sample.y, sample.z];
    const project = axis => axis ? vector.reduce((sum, value, index) => sum + value * axis[index], 0) : null;
    const normal = project(this.calibration?.up) ?? sample.z;
    const lateral = project(this.calibration?.lateral) ?? sample.x;
    const longitudinal = project(this.calibration?.forward) ?? sample.y;
    const total = Math.hypot(normal, lateral, longitudinal);

    if (normal > this.config.positiveGThreshold) {
      this.positiveGSum += normal;
      this.positiveGCount += 1;
    }

    return {
      ...sample,
      normal,
      lateral,
      longitudinal,
      total,
      positiveGAverage: this.positiveGCount ? this.positiveGSum / this.positiveGCount : null,
      airtime: normal < this.config.airtimeThreshold,
    };
  }

  processLocation(point) {
    const gps = this.config.gps;
    if (!Number.isFinite(point.accuracy) || point.accuracy > gps.maxHorizontalAccuracyM) {
      this.rejectedLocations += 1;
      return { accepted: false, reason: 'accuracy' };
    }

    if (!this.lastLocation) {
      this.lastLocation = point;
      this.acceptedLocations += 1;
      return { accepted: true, segmentDistanceM: 0, totalDistanceM: 0 };
    }

    const dt = Math.max(0.001, point.t - this.lastLocation.t);
    const distance = haversine(this.lastLocation, point);
    const impliedSpeed = distance / dt;
    const reportedSpeed = Number.isFinite(point.speed) ? Math.max(0, point.speed) : null;
    const uncertainty = Math.max(point.accuracy, this.lastLocation.accuracy) * gps.accuracyMultiplier;

    const stationary = reportedSpeed !== null && reportedSpeed < gps.stationarySpeedMs && distance <= uncertainty;
    const tooSmall = distance < gps.minimumAcceptedMovementM && dt < 2;
    const impossible = impliedSpeed > gps.maxImpliedSpeedMs;

    if (stationary || tooSmall || impossible) {
      this.rejectedLocations += 1;
      return { accepted: false, reason: stationary ? 'stationary' : tooSmall ? 'minimum-movement' : 'implied-speed' };
    }

    this.distanceM += distance;
    this.lastLocation = point;
    this.acceptedLocations += 1;
    return { accepted: true, segmentDistanceM: distance, totalDistanceM: this.distanceM };
  }

  summary() {
    return {
      distanceM: this.distanceM,
      positiveGAverage: this.positiveGCount ? this.positiveGSum / this.positiveGCount : null,
      positiveGSamples: this.positiveGCount,
      acceptedLocations: this.acceptedLocations,
      rejectedLocations: this.rejectedLocations,
    };
  }
}

function haversine(a, b) {
  const radius = 6371000;
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLon = (b.lon - a.lon) * radians;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(q));
}
