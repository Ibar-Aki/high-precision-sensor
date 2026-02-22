import { KalmanFilter1D } from './kalman.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toPositiveInt(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : fallback;
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

    this.rawPitch = 0;
    this.rawRoll = 0;
    this.pitch = 0;
    this.roll = 0;

    this._emaInitialized = false;
    this._prevPitch = 0;
    this._prevRoll = 0;

    this._prevFilteredPitch = null;
    this._prevFilteredRoll = null;

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
  }

  process(beta, gamma) {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) {
      return false;
    }

    this.rawPitch = beta;
    this.rawRoll = gamma;

    const filteredPitch = this.kfPitch.update(beta);
    const filteredRoll = this.kfRoll.update(gamma);

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
      this._prevPitch = this.pitch;
      this._prevRoll = this.roll;
      return true;
    }

    if (this.measurementMode !== 'active') {
      this._resetStaticBuffers();
      this.measurementMode = 'active';
    }

    let emaPitch = filteredPitch;
    let emaRoll = filteredRoll;

    if (!this._emaInitialized) {
      this._emaInitialized = true;
    } else {
      emaPitch = this.emaAlpha * filteredPitch + (1 - this.emaAlpha) * this.pitch;
      emaRoll = this.emaAlpha * filteredRoll + (1 - this.emaAlpha) * this.roll;
    }

    if (Math.abs(emaPitch - this._prevPitch) < this.deadzone) {
      emaPitch = this._prevPitch;
    }
    if (Math.abs(emaRoll - this._prevRoll) < this.deadzone) {
      emaRoll = this._prevRoll;
    }

    this.pitch = emaPitch;
    this.roll = emaRoll;
    this._prevPitch = emaPitch;
    this._prevRoll = emaRoll;
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
    this.measurementMode = 'active';
    this.measurementVariance = Infinity;
    this.motionWindow = [];
    this.motionWindowStart = 0;
    this.motionWindowSum = 0;
    this.motionWindowSqSum = 0;
    this._prevFilteredPitch = null;
    this._prevFilteredRoll = null;
    this._resetStaticBuffers();
  }

  getMeasurementMode() {
    return this.measurementMode;
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
    if (this._prevFilteredPitch === null || this._prevFilteredRoll === null) {
      this._prevFilteredPitch = filteredPitch;
      this._prevFilteredRoll = filteredRoll;
      this._pushMotionMetric(0);
      return;
    }

    const dp = filteredPitch - this._prevFilteredPitch;
    const dr = filteredRoll - this._prevFilteredRoll;
    this._prevFilteredPitch = filteredPitch;
    this._prevFilteredRoll = filteredRoll;
    this._pushMotionMetric(Math.sqrt(dp * dp + dr * dr));
  }

  _pushMotionMetric(metric) {
    const windowSize = toPositiveInt(this.staticDurationFrames, 30);
    const v = Number.isFinite(metric) ? metric : 0;

    this.motionWindow.push(v);
    this.motionWindowSum += v;
    this.motionWindowSqSum += v * v;

    while (this.motionWindow.length - this.motionWindowStart > windowSize) {
      const dropped = this.motionWindow[this.motionWindowStart];
      this.motionWindowStart += 1;
      this.motionWindowSum -= dropped;
      this.motionWindowSqSum -= dropped * dropped;
    }

    if (this.motionWindowStart > 256 && this.motionWindowStart * 2 >= this.motionWindow.length) {
      this.motionWindow = this.motionWindow.slice(this.motionWindowStart);
      this.motionWindowStart = 0;
    }

    const sampleCount = this.motionWindow.length - this.motionWindowStart;
    if (sampleCount <= 0) {
      this.measurementVariance = Infinity;
      return;
    }

    const mean = this.motionWindowSum / sampleCount;
    const variance = this.motionWindowSqSum / sampleCount - mean * mean;
    this.measurementVariance = variance > 0 ? variance : 0;
  }

  _isStaticDetected() {
    const windowSize = toPositiveInt(this.staticDurationFrames, 30);
    const sampleCount = this.motionWindow.length - this.motionWindowStart;
    if (sampleCount < windowSize) {
      return false;
    }

    return this.measurementVariance <= this.staticVarianceThreshold;
  }

  _pushStaticSample(pitch, roll) {
    this.staticPitchBuffer.push(pitch);
    this.staticRollBuffer.push(roll);
    this.staticPitchSum += pitch;
    this.staticRollSum += roll;

    const max = 500;
    while (this.staticPitchBuffer.length - this.staticBufferStart > max) {
      this.staticPitchSum -= this.staticPitchBuffer[this.staticBufferStart];
      this.staticRollSum -= this.staticRollBuffer[this.staticBufferStart];
      this.staticBufferStart += 1;
    }

    if (this.staticBufferStart > 256 && this.staticBufferStart * 2 >= this.staticPitchBuffer.length) {
      this.staticPitchBuffer = this.staticPitchBuffer.slice(this.staticBufferStart);
      this.staticRollBuffer = this.staticRollBuffer.slice(this.staticBufferStart);
      this.staticBufferStart = 0;
    }

    this.staticSampleCount = this.staticPitchBuffer.length - this.staticBufferStart;
  }

  _resetStaticBuffers() {
    this.staticPitchBuffer = [];
    this.staticRollBuffer = [];
    this.staticBufferStart = 0;
    this.staticPitchSum = 0;
    this.staticRollSum = 0;
    this.staticSampleCount = 0;
  }
}
