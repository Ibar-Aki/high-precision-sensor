/**
 * 1D カルマンフィルタ
 * 状態変数 x に対する単純な1次元フィルタ
 */
export class KalmanFilter1D {
    constructor(q = 0.001, r = 0.1) {
        this.q = q; // プロセスノイズ (Process Noise Covariance)
        this.r = r; // 観測ノイズ (Measurement Noise Covariance)
        this.x = 0; // 推定値 (State Estimate)
        this.p = 1; // 推定誤差共分散 (Error Covariance)
        this.k = 0; // カルマンゲイン (Kalman Gain)
        this.initialized = false;
    }

    /**
     * 観測値による更新
     * @param {number} measurement センサーからの観測値
     * @returns {number} フィルタリング後の推定値
     */
    update(measurement) {
        if (!this.initialized) {
            this.x = measurement;
            this.initialized = true;
            return this.x;
        }

        // 予測ステップ (Time Update)
        // x = x; // 状態遷移モデル (変化なしと仮定)
        this.p = this.p + this.q;

        // 更新ステップ (Measurement Update)
        this.k = this.p / (this.p + this.r);
        this.x = this.x + this.k * (measurement - this.x);
        this.p = (1 - this.k) * this.p;

        return this.x;
    }

    reset() {
        this.x = 0;
        this.p = 1;
        this.k = 0;
        this.initialized = false;
    }

    setParams(q, r) {
        this.q = q;
        this.r = r;
    }
}
