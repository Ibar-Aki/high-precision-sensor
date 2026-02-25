import { KalmanFilter1D } from './kalman.js';
import {
  isStaticDetected,
  pushMotionMetric,
  pushStaticSample,
  resetMotionWindow,
  resetStaticBuffer,
  toPositiveInt,
  updateMotionWindow
} from './hybrid-static-utils.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class TableLevelSensor {
  constructor(options = {}) {
    this.kfPitch = new KalmanFilter1D(options.kalmanQ ?? 0.001, options.kalmanR ?? 0.1);
    this.kfRoll = new KalmanFilter1D(options.kalmanQ ?? 0.001, options.kalmanR ?? 0.1);

    this.emaAlpha = options.emaAlpha ?? 0.08;
    this.deadzone = options.deadzone ?? 0.005;

    this.staticVarianceThreshold = options.staticVarianceThreshold ?? 0.002;
    this.staticDurationFrames = options.staticDurationFrames ?? 30;
    this.averagingSampleCount = options.averagingSampleCount ?? 40;

    this.phonePitchAxis = options.phonePitchAxis ?? 'depth';
    this.invertPitch = Boolean(options.invertPitch);
    this.invertRoll = Boolean(options.invertRoll);
    this.calibPitch = 0;
    this.calibRoll = 0;
    this.twoPointCalibrationTimeoutMs = 30000;
    this.twoPointCalibration = {
      step: 'idle',
      firstPoint: null,
      startedAt: 0
    };

    this.rawPitch = 0;
    this.rawRoll = 0;
    this.pitch = 0;
    this.roll = 0;
    this.sampleCount = 0;

    this._emaInitialized = false;
    this.emaPitch = 0;
    this.emaRoll = 0;
    this._prevPitch = 0;
    this._prevRoll = 0;

    this._prevKfPitch = null;
    this._prevKfRoll = null;

    this.measurementMode = 'active';
    this.measurementVariance = Infinity;

    this.motionWindow = [];
    this.motionWindowStart = 0;
    this.motionWindowSum = 0;
    this.motionWindowSqSum = 0;

    this.staticPitchBuffer = [];
    this.staticRollBuffer = [];
    this.staticBufferStart = 0;
    this.staticPitchSum = 0;
    this.staticRollSum = 0;
    this.staticSampleCount = 0;

    this.loadCalibration();
  }

  process(beta, gamma) {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) {
      return false;
    }

    this.sampleCount += 1;
    this.rawPitch = beta;
    this.rawRoll = gamma;

    const filteredPitch = this.kfPitch.update(beta) - this.calibPitch;
    const filteredRoll = this.kfRoll.update(gamma) - this.calibRoll;

    this._updateMotionWindow(filteredPitch, filteredRoll);
    const staticDetected = this._isStaticDetected();

    if (staticDetected) {
      if (this.measurementMode === 'active') {
        this._resetStaticBuffers();
      }

      this._pushStaticSample(filteredPitch, filteredRoll);
      this.measurementMode = this.staticSampleCount >= toPositiveInt(this.averagingSampleCount, 40)
        ? 'measuring'
        : 'locking';

      this.pitch = this.staticPitchSum / this.staticSampleCount;
      this.roll = this.staticRollSum / this.staticSampleCount;
      this.emaPitch = this.pitch;
      this.emaRoll = this.roll;
      this._prevPitch = this.pitch;
      this._prevRoll = this.roll;
      return true;
    }

    if (this.measurementMode !== 'active') {
      this._resetStaticBuffers();
      this.measurementMode = 'active';
    }

    if (!this._emaInitialized) {
      this.emaPitch = filteredPitch;
      this.emaRoll = filteredRoll;
      this._emaInitialized = true;
    } else {
      this.emaPitch = this.emaAlpha * filteredPitch + (1 - this.emaAlpha) * this.emaPitch;
      this.emaRoll = this.emaAlpha * filteredRoll + (1 - this.emaAlpha) * this.emaRoll;
    }

    let nextPitch = this.emaPitch;
    let nextRoll = this.emaRoll;

    if (Math.abs(nextPitch - this._prevPitch) < this.deadzone) {
      nextPitch = this._prevPitch;
    }
    if (Math.abs(nextRoll - this._prevRoll) < this.deadzone) {
      nextRoll = this._prevRoll;
    }

    this.pitch = nextPitch;
    this.roll = nextRoll;
    this._prevPitch = nextPitch;
    this._prevRoll = nextRoll;
    return true;
  }

  setAxisConfig({ phonePitchAxis, invertPitch, invertRoll }) {
    if (phonePitchAxis === 'depth' || phonePitchAxis === 'width') {
      this.phonePitchAxis = phonePitchAxis;
    }
    if (typeof invertPitch === 'boolean') {
      this.invertPitch = invertPitch;
    }
    if (typeof invertRoll === 'boolean') {
      this.invertRoll = invertRoll;
    }
  }

  loadCalibration() {
    if (typeof localStorage === 'undefined') {
      return { ok: false, reason: 'storage_unavailable' };
    }
    try {
      const raw = localStorage.getItem('table_level_sensor_calibration_v1');
      if (!raw) return { ok: true, loaded: false };
      const parsed = JSON.parse(raw);
      if (Number.isFinite(parsed?.calibPitch) && Number.isFinite(parsed?.calibRoll)) {
        this.calibPitch = parsed.calibPitch;
        this.calibRoll = parsed.calibRoll;
        return { ok: true, loaded: true };
      }
      return { ok: true, loaded: false };
    } catch (error) {
      return { ok: false, reason: this._storageErrorReason(error) };
    }
  }

  saveCalibration() {
    if (typeof localStorage === 'undefined') {
      return { ok: false, reason: 'storage_unavailable' };
    }
    try {
      localStorage.setItem('table_level_sensor_calibration_v1', JSON.stringify({
        calibPitch: this.calibPitch,
        calibRoll: this.calibRoll
      }));
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: this._storageErrorReason(error) };
    }
  }

  calibrateOnePoint() {
    if (!this._canCaptureCalibrationPoint()) {
      return { ok: false, reason: 'no_sample' };
    }
    const offsetPitch = this.pitch;
    const offsetRoll = this.roll;
    this.calibPitch += offsetPitch;
    this.calibRoll += offsetRoll;
    const saveResult = this.saveCalibration();
    this.resetMeasurementState();
    this.cancelTwoPointCalibration();
    return {
      ok: saveResult.ok,
      reason: saveResult.reason,
      adjustment: {
        pitch: offsetPitch,
        roll: offsetRoll
      }
    };
  }

  startTwoPointCalibration() {
    this.twoPointCalibration.step = 'awaiting_first';
    this.twoPointCalibration.firstPoint = null;
    this.twoPointCalibration.startedAt = 0;
    return { ok: true, step: this.twoPointCalibration.step };
  }

  captureTwoPointCalibrationPoint() {
    const step = this.twoPointCalibration.step;
    if (step === 'idle') {
      return { ok: false, reason: 'not_started' };
    }
    if (step === 'awaiting_second' && this._isTwoPointCalibrationExpired()) {
      this.cancelTwoPointCalibration();
      return { ok: false, reason: 'timeout' };
    }
    if (!this._canCaptureCalibrationPoint()) {
      return { ok: false, reason: 'no_sample' };
    }

    if (step === 'awaiting_first') {
      this.twoPointCalibration.firstPoint = {
        pitch: this.pitch,
        roll: this.roll
      };
      this.twoPointCalibration.step = 'awaiting_second';
      this.twoPointCalibration.startedAt = Date.now();
      return { ok: true, step: 'awaiting_second' };
    }

    if (step === 'awaiting_second') {
      const first = this.twoPointCalibration.firstPoint;
      const secondPitch = this.pitch;
      const secondRoll = this.roll;
      const offsetPitch = (first.pitch + secondPitch) / 2;
      const offsetRoll = (first.roll + secondRoll) / 2;

      this.calibPitch += offsetPitch;
      this.calibRoll += offsetRoll;
      const saveResult = this.saveCalibration();
      this.resetMeasurementState();
      this.cancelTwoPointCalibration();

      return {
        ok: saveResult.ok,
        reason: saveResult.reason,
        done: true,
        step: 'completed',
        adjustment: {
          pitch: offsetPitch,
          roll: offsetRoll
        }
      };
    }

    return { ok: false, reason: 'invalid_state' };
  }

  cancelTwoPointCalibration() {
    this.twoPointCalibration.step = 'idle';
    this.twoPointCalibration.firstPoint = null;
    this.twoPointCalibration.startedAt = 0;
    return { ok: true };
  }

  getTwoPointCalibrationState() {
    const step = this.twoPointCalibration.step;
    const startedAt = this.twoPointCalibration.startedAt;
    const elapsedMs = startedAt > 0 ? Math.max(0, Date.now() - startedAt) : 0;
    const remainingMs = startedAt > 0
      ? Math.max(0, this.twoPointCalibrationTimeoutMs - elapsedMs)
      : this.twoPointCalibrationTimeoutMs;
    return {
      step,
      hasFirstPoint: Boolean(this.twoPointCalibration.firstPoint),
      elapsedMs,
      remainingMs,
      timeoutMs: this.twoPointCalibrationTimeoutMs
    };
  }

  setFilterParams({ emaAlpha, kalmanQ, kalmanR, staticVarianceThreshold, staticDurationFrames, averagingSampleCount }) {
    if (Number.isFinite(emaAlpha)) {
      this.emaAlpha = clamp(emaAlpha, 0.01, 0.5);
    }
    if (Number.isFinite(kalmanQ) && Number.isFinite(kalmanR)) {
      this.kfPitch.setParams(kalmanQ, kalmanR);
      this.kfRoll.setParams(kalmanQ, kalmanR);
    }
    if (Number.isFinite(staticVarianceThreshold)) {
      this.staticVarianceThreshold = clamp(staticVarianceThreshold, 0.0001, 0.05);
    }
    if (Number.isFinite(staticDurationFrames)) {
      this.staticDurationFrames = toPositiveInt(staticDurationFrames, this.staticDurationFrames);
    }
    if (Number.isFinite(averagingSampleCount)) {
      this.averagingSampleCount = toPositiveInt(averagingSampleCount, this.averagingSampleCount);
    }
  }

  resetMeasurementState() {
    this.kfPitch.reset();
    this.kfRoll.reset();
    this._emaInitialized = false;
    this.emaPitch = 0;
    this.emaRoll = 0;
    this._prevPitch = 0;
    this._prevRoll = 0;
    this.pitch = 0;
    this.roll = 0;
    this.rawPitch = 0;
    this.rawRoll = 0;
    this.sampleCount = 0;

    this.measurementMode = 'active';
    this.measurementVariance = Infinity;
    resetMotionWindow(this);
    this._resetStaticBuffers();
  }

  getMeasurementMode() {
    return this.measurementMode;
  }

  getSampleCount() {
    return this.sampleCount;
  }

  getMeasurementInfo() {
    return {
      mode: this.measurementMode,
      variance: this.measurementVariance,
      staticSamples: this.staticSampleCount
    };
  }

  getDeskAngles() {
    let pitchDeg = this.pitch;
    let rollDeg = this.roll;

    if (this.phonePitchAxis === 'width') {
      pitchDeg = this.roll;
      rollDeg = this.pitch;
    }

    if (this.invertPitch) pitchDeg *= -1;
    if (this.invertRoll) rollDeg *= -1;

    return { pitchDeg, rollDeg };
  }

  _updateMotionWindow(filteredPitch, filteredRoll) {
    const windowSize = toPositiveInt(this.staticDurationFrames, 30);
    updateMotionWindow(this, filteredPitch, filteredRoll, windowSize);
  }

  _pushMotionMetric(metric) {
    const windowSize = toPositiveInt(this.staticDurationFrames, 30);
    pushMotionMetric(this, metric, windowSize);
  }

  _isStaticDetected() {
    const windowSize = toPositiveInt(this.staticDurationFrames, 30);
    return isStaticDetected(this, windowSize, this.staticVarianceThreshold);
  }

  _pushStaticSample(pitch, roll) {
    const max = 500;
    pushStaticSample(this, pitch, roll, max);
  }

  _resetStaticBuffers() {
    resetStaticBuffer(this);
  }

  _isTwoPointCalibrationExpired() {
    const startedAt = this.twoPointCalibration.startedAt;
    if (startedAt <= 0) return false;
    return Date.now() - startedAt > this.twoPointCalibrationTimeoutMs;
  }

  _canCaptureCalibrationPoint() {
    return this.sampleCount > 0 && Number.isFinite(this.pitch) && Number.isFinite(this.roll);
  }

  _storageErrorReason(error) {
    if (error && error.name === 'QuotaExceededError') {
      return 'quota_exceeded';
    }
    return 'storage_unavailable';
  }
}
