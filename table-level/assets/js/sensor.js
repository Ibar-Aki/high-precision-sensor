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
  }

  process(beta, gamma) {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) {
      return false;
    }

    this.sampleCount += 1;
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
}
