export class MonotonicClock {
  constructor(now = () => performance.now() / 1000) {
    this.now = now;
    this.origin = this.now();
  }
  seconds() { return Math.max(0, this.now() - this.origin); }
}

export class AltitudeFusion {
  constructor({ barometerLowPassAlpha = 0.18, gpsCorrectionAlpha = 0.005 } = {}) {
    this.barometerLowPassAlpha = barometerLowPassAlpha;
    this.gpsCorrectionAlpha = gpsCorrectionAlpha;
    this.reset();
  }
  reset() { this.relativeM = null; this.barometerZero = null; this.gpsBias = 0; }
  updateBarometer(relativeM) {
    if (!Number.isFinite(relativeM)) return this.relativeM;
    if (this.barometerZero === null) this.barometerZero = relativeM;
    const value = relativeM - this.barometerZero + this.gpsBias;
    this.relativeM = this.relativeM === null ? value : this.relativeM + this.barometerLowPassAlpha * (value - this.relativeM);
    return this.relativeM;
  }
  correctWithGps(relativeGpsM) {
    if (!Number.isFinite(relativeGpsM) || this.relativeM === null) return this.relativeM;
    const error = relativeGpsM - this.relativeM;
    this.gpsBias += this.gpsCorrectionAlpha * error;
    return this.relativeM;
  }
}

export class RidePhaseDetector {
  constructor(config = {}) {
    this.config = {
      launchLongitudinalG: 0.35,
      brakeLongitudinalG: -0.3,
      liftMaxSpeedMs: 8,
      liftMinClimbRateMs: 0.25,
      stationSpeedMs: 0.8,
      stationHoldS: 4,
      ...config,
    };
    this.reset();
  }
  reset() { this.phase = 'idle'; this.stationarySince = null; this.events = []; }
  update(sample) {
    const { t, speedMs = 0, longitudinalG = 0, climbRateMs = 0, totalG = 1 } = sample;
    let next = this.phase;
    if (longitudinalG >= this.config.launchLongitudinalG && speedMs > 2) next = 'launch';
    else if (climbRateMs >= this.config.liftMinClimbRateMs && speedMs <= this.config.liftMaxSpeedMs) next = 'lift';
    else if (longitudinalG <= this.config.brakeLongitudinalG && speedMs > 2) next = 'brake';
    else if (speedMs > this.config.stationSpeedMs || Math.abs(totalG - 1) > 0.18) next = 'ride';
    else {
      this.stationarySince ??= t;
      if (t - this.stationarySince >= this.config.stationHoldS) next = this.phase === 'idle' ? 'ready' : 'station';
    }
    if (speedMs > this.config.stationSpeedMs) this.stationarySince = null;
    if (next !== this.phase) {
      this.events.push({ t, type: next, from: this.phase });
      this.phase = next;
    }
    return { phase: this.phase, events: this.events };
  }
}

export class QualityScorer {
  constructor() { this.reset(); }
  reset() { this.motion = 0; this.gpsAccepted = 0; this.gpsRejected = 0; this.gaps = 0; this.calibrated = false; this.barometer = false; }
  score() {
    const gpsTotal = this.gpsAccepted + this.gpsRejected;
    const gpsRatio = gpsTotal ? this.gpsAccepted / gpsTotal : 0;
    const motionScore = Math.min(1, this.motion / 500);
    const gapPenalty = Math.min(0.3, this.gaps * 0.02);
    const value = 100 * (0.30 * motionScore + 0.30 * gpsRatio + 0.20 * Number(this.calibrated) + 0.10 * Number(this.barometer) + 0.10) - 100 * gapPenalty;
    return Math.max(0, Math.min(100, Math.round(value)));
  }
}

export class SensorSourceRegistry {
  constructor() { this.sources = new Map(); }
  register(source) {
    if (!source?.id || typeof source.start !== 'function' || typeof source.stop !== 'function') throw new TypeError('Invalid sensor source');
    this.sources.set(source.id, source);
  }
  list() { return [...this.sources.values()].map(({ id, label, capabilities = [] }) => ({ id, label, capabilities })); }
}
