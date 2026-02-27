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
    this.kfPitch = new KalmanFilter1D(options.kalmanQ ?? 0.0005, options.kalmanR ?? 0.18);
    this.kfRoll = new KalmanFilter1D(options.kalmanQ ?? 0.0005, options.kalmanR ?? 0.18);

    this.emaAlpha = options.emaAlpha ?? 0.06;
    this.deadzone = options.deadzone ?? 0.005;

    this.staticVarianceThreshold = options.staticVarianceThreshold ?? 0.0025;
    this.staticDurationFrames = options.staticDurationFrames ?? 60;
    this.averagingSampleCount = options.averagingSampleCount ?? 150;
    this.staticEntryThresholdScale = 1.0;
    this.staticExitThresholdScale = 1.8;
    this.staticExitGraceFrames = 12;
    this.finalDisplayDeadband = 0.02;
    this.finalDisplayMaxStep = 0.01;

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
    this.livePitch = 0;
    this.liveRoll = 0;
    this.finalPitch = NaN;
    this.finalRoll = NaN;
    this.displayFinalPitch = NaN;
    this.displayFinalRoll = NaN;
    this.hasFinalMeasurement = false;
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
    this._staticExitCount = 0;

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
    this._updateLiveAngles(filteredPitch, filteredRoll);

    this._updateMotionWindow(filteredPitch, filteredRoll);
    const staticDetected = this._isStaticDetectedWithHysteresis();

    if (staticDetected) {
      if (this.measurementMode === 'active') {
        this._resetStaticBuffers();
      }

      this._pushStaticSample(filteredPitch, filteredRoll);
      this.measurementMode = this.staticSampleCount >= toPositiveInt(this.averagingSampleCount, 150)
        ? 'measuring'
        : 'locking';

      this.finalPitch = this.staticPitchSum / this.staticSampleCount;
      this.finalRoll = this.staticRollSum / this.staticSampleCount;
      this.displayFinalPitch = this._updateDisplayFinalValue(this.displayFinalPitch, this.finalPitch);
      this.displayFinalRoll = this._updateDisplayFinalValue(this.displayFinalRoll, this.finalRoll);
      this.hasFinalMeasurement = this.measurementMode === 'measuring';
      this.pitch = Number.isFinite(this.displayFinalPitch) ? this.displayFinalPitch : this.finalPitch;
      this.roll = Number.isFinite(this.displayFinalRoll) ? this.displayFinalRoll : this.finalRoll;
      return true;
    }

    if (this.measurementMode !== 'active') {
      this._resetStaticBuffers();
      this.measurementMode = 'active';
    }
    this.pitch = this.livePitch;
    this.roll = this.liveRoll;
    this.finalPitch = NaN;
    this.finalRoll = NaN;
    this.displayFinalPitch = NaN;
    this.displayFinalRoll = NaN;
    this.hasFinalMeasurement = false;
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
    this.livePitch = 0;
    this.liveRoll = 0;
    this.finalPitch = NaN;
    this.finalRoll = NaN;
    this.displayFinalPitch = NaN;
    this.displayFinalRoll = NaN;
    this.hasFinalMeasurement = false;
    this.rawPitch = 0;
    this.rawRoll = 0;
    this.sampleCount = 0;

    this.measurementMode = 'active';
    this.measurementVariance = Infinity;
    this._staticExitCount = 0;
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
      staticSamples: this.staticSampleCount,
      livePitch: this.livePitch,
      liveRoll: this.liveRoll,
      finalPitch: this.finalPitch,
      finalRoll: this.finalRoll,
      finalDisplayPitch: this.displayFinalPitch,
      finalDisplayRoll: this.displayFinalRoll,
      hasFinalMeasurement: this.hasFinalMeasurement
    };
  }

  getDeskAngles(source = 'current') {
    const pitchSource = source === 'live'
      ? this.livePitch
      : (source === 'final' ? this.displayFinalPitch : this.pitch);
    const rollSource = source === 'live'
      ? this.liveRoll
      : (source === 'final' ? this.displayFinalRoll : this.roll);
    if (!Number.isFinite(pitchSource) || !Number.isFinite(rollSource)) {
      return { pitchDeg: NaN, rollDeg: NaN };
    }

    let pitchDeg = pitchSource;
    let rollDeg = rollSource;

    if (this.phonePitchAxis === 'width') {
      pitchDeg = rollSource;
      rollDeg = pitchSource;
    }

    if (this.invertPitch) pitchDeg *= -1;
    if (this.invertRoll) rollDeg *= -1;

    return { pitchDeg, rollDeg };
  }

  _updateMotionWindow(filteredPitch, filteredRoll) {
    const windowSize = toPositiveInt(this.staticDurationFrames, 60);
    updateMotionWindow(this, filteredPitch, filteredRoll, windowSize);
  }

  _pushMotionMetric(metric) {
    const windowSize = toPositiveInt(this.staticDurationFrames, 60);
    pushMotionMetric(this, metric, windowSize);
  }

  _isStaticDetectedWithHysteresis() {
    const windowSize = toPositiveInt(this.staticDurationFrames, 60);
    const sampleCount = this.motionWindow.length - this.motionWindowStart;
    if (sampleCount < windowSize) {
      this._staticExitCount = 0;
      return false;
    }

    const baseThreshold = Number.isFinite(this.staticVarianceThreshold) && this.staticVarianceThreshold >= 0
      ? this.staticVarianceThreshold
      : 0.0025;
    const entryScale = Number.isFinite(this.staticEntryThresholdScale) && this.staticEntryThresholdScale > 0
      ? this.staticEntryThresholdScale
      : 1.0;
    const exitScale = Number.isFinite(this.staticExitThresholdScale) && this.staticExitThresholdScale > 0
      ? this.staticExitThresholdScale
      : 1.8;
    const entryThreshold = baseThreshold * entryScale;
    const exitThreshold = baseThreshold * exitScale;

    if (this.measurementMode === 'active') {
      this._staticExitCount = 0;
      return this._isMotionCalm(windowSize, entryThreshold);
    }

    if (this._isMotionCalm(windowSize, exitThreshold)) {
      this._staticExitCount = 0;
      return true;
    }

    this._staticExitCount += 1;
    const graceFrames = toPositiveInt(this.staticExitGraceFrames, 12);
    return this._staticExitCount < graceFrames;
  }

  _pushStaticSample(pitch, roll) {
    const max = 500;
    pushStaticSample(this, pitch, roll, max);
  }

  _updateLiveAngles(filteredPitch, filteredRoll) {
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

    this._prevPitch = nextPitch;
    this._prevRoll = nextRoll;
    this.livePitch = nextPitch;
    this.liveRoll = nextRoll;
  }

  _updateDisplayFinalValue(previous, target) {
    if (!Number.isFinite(target)) {
      return NaN;
    }
    if (!Number.isFinite(previous)) {
      return target;
    }

    const delta = target - previous;
    const deadband = Number.isFinite(this.finalDisplayDeadband) && this.finalDisplayDeadband >= 0
      ? this.finalDisplayDeadband
      : 0.02;
    if (Math.abs(delta) <= deadband) {
      return previous;
    }

    const maxStep = Number.isFinite(this.finalDisplayMaxStep) && this.finalDisplayMaxStep > 0
      ? this.finalDisplayMaxStep
      : 0.01;
    const step = Math.min(Math.abs(delta), maxStep);
    return previous + Math.sign(delta) * step;
  }

  _isMotionCalm(windowSize, varianceThreshold) {
    if (!isStaticDetected(this, windowSize, varianceThreshold)) {
      return false;
    }
    const sampleCount = this.motionWindow.length - this.motionWindowStart;
    if (sampleCount <= 0) {
      return false;
    }
    const meanMotion = this.motionWindowSum / sampleCount;
    const meanThreshold = Math.sqrt(Math.max(varianceThreshold, 0));
    return meanMotion <= meanThreshold;
  }

  _resetStaticBuffers() {
    resetStaticBuffer(this);
    this._staticExitCount = 0;
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
