/**
 * Shared 1D Kalman filter used by both apps.
 */
export class KalmanFilter1D {
  constructor(q = 0.001, r = 0.1) {
    this.q = q;
    this.r = r;
    this.x = 0;
    this.p = 1;
    this.k = 0;
    this.initialized = false;
  }

  update(measurement) {
    if (!Number.isFinite(measurement)) {
      return this.x;
    }

    if (!this.initialized) {
      this.x = measurement;
      this.initialized = true;
      return this.x;
    }

    this.p += this.q;
    this.k = this.p / (this.p + this.r);
    this.x = this.x + this.k * (measurement - this.x);
    this.p = (1 - this.k) * this.p;

    return this.x;
  }

  setParams(q, r) {
    if (Number.isFinite(q) && q > 0) {
      this.q = q;
    }
    if (Number.isFinite(r) && r > 0) {
      this.r = r;
    }
  }

  reset() {
    this.x = 0;
    this.p = 1;
    this.k = 0;
    this.initialized = false;
  }
}
