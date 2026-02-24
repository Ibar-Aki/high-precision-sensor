import { KalmanFilter1D } from './KalmanFilter1D.js';
import {
    isStaticDetected,
    pushMotionMetric,
    pushStaticSample,
    resetMotionWindow,
    resetStaticBuffer,
    toPositiveInt,
    updateMotionWindow
} from './HybridStaticUtils.js';

/**
 * センサーエンジン
 * 2軸（Pitch/Roll）のカルマンフィルタ + EMA + デッドゾーン処理を担当
 * 静止判定時はハイブリッド静止平均（Static Average）を適用する
 */
export class SensorEngine {
    constructor() {
        // カルマンフィルタ（ピッチ / ロール各1D）
        this.kfPitch = new KalmanFilter1D(0.001, 0.1);
        this.kfRoll = new KalmanFilter1D(0.001, 0.1);

        // EMA (Exponential Moving Average)
        this.emaAlpha = 0.08;
        this.emaPitch = 0;
        this.emaRoll = 0;
        this.emaInitialized = false;

        // キャリブレーション (ゼロ点補正値)
        this.calibPitch = 0;
        this.calibRoll = 0;

        // デッドゾーン (不感帯)
        this.deadzone = 0.005;

        // 出力値 (フィルタ済み)
        this.pitch = 0;
        this.roll = 0;

        // 生データ (デバッグ用)
        this.rawPitch = 0;
        this.rawRoll = 0;

        // 統計情報
        this.maxPitch = 0;
        this.maxRoll = 0;
        this.sampleCount = 0;

        // 前回値（デッドゾーン判定用）
        this._prevPitch = 0;
        this._prevRoll = 0;

        // ロック機能
        this.locked = false;

        // ハイブリッド静止平均パラメータ
        this.staticVarianceThreshold = 0.002;
        this.staticDurationFrame = 30;
        this.averagingSampleCount = 60;
        this.maxBufferSize = 2000;

        // ハイブリッド静止平均状態
        this.measurementMode = 'active'; // active | locking | measuring
        this.measurementVariance = Infinity;
        this.motionWindow = [];
        this.motionWindowStart = 0;
        this.motionWindowSum = 0;
        this.motionWindowSqSum = 0;
        this._prevKfPitch = null;
        this._prevKfRoll = null;
        this.staticPitchBuffer = [];
        this.staticRollBuffer = [];
        this.staticBufferStart = 0;
        this.staticPitchSum = 0;
        this.staticRollSum = 0;
        this.staticSampleCount = 0;

        // 2点キャリブレーション状態
        this.twoPointCalibrationTimeoutMs = 30000;
        this.twoPointCalibration = {
            step: 'idle', // idle | awaiting_first | awaiting_second
            firstPoint: null,
            startedAt: 0
        };

        // 永続化されたキャリブレーション値をロード
        this.loadCalibration();
    }

    /**
     * キャリブレーション値をロード
     */
    loadCalibration() {
        try {
            const data = localStorage.getItem('sensor_calibration_v1');
            if (data) {
                const parsed = JSON.parse(data);
                if (typeof parsed.calibPitch === 'number' && typeof parsed.calibRoll === 'number') {
                    this.calibPitch = parsed.calibPitch;
                    this.calibRoll = parsed.calibRoll;
                    console.log('Calibration loaded:', parsed);
                    return { ok: true, loaded: true };
                }
            }
            return { ok: true, loaded: false };
        } catch (e) {
            console.error('Failed to load calibration:', e);
            return { ok: false, reason: this._storageErrorReason(e) };
        }
    }

    /**
     * キャリブレーション値を保存
     */
    saveCalibration() {
        try {
            const data = {
                calibPitch: this.calibPitch,
                calibRoll: this.calibRoll
            };
            localStorage.setItem('sensor_calibration_v1', JSON.stringify(data));
            console.log('Calibration saved:', data);
            return { ok: true };
        } catch (e) {
            console.error('Failed to save calibration:', e);
            return { ok: false, reason: this._storageErrorReason(e) };
        }
    }

    /**
     * センサーデータの処理
     * @param {number} beta Pitch (前後傾斜)
     * @param {number} gamma Roll (左右傾斜)
     */
    process(beta, gamma) {
        if (this.locked) return false;
        if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return false;

        this.rawPitch = beta;
        this.rawRoll = gamma;
        this.sampleCount++;

        // 1. キャリブレーション補正
        // 生データからキャリブレーションオフセットを引くのではなく、
        // 蓄積されたオフセットを使用する (calibrateメソッド参照)
        // ここでは単純に引き算
        let correctedPitch = beta - this.calibPitch;
        let correctedRoll = gamma - this.calibRoll;

        // 2. カルマンフィルタ適用
        let kfP = this.kfPitch.update(correctedPitch);
        let kfR = this.kfRoll.update(correctedRoll);

        // 3. 動き分散を監視し、ハイブリッドモードを切り替える
        this._updateMotionWindow(kfP, kfR);
        const staticDetected = this._isStaticDetected();

        if (staticDetected) {
            // Active -> Static への遷移時は平均バッファを初期化
            if (this.measurementMode === 'active') {
                this._resetStaticBuffer();
            }

            // Static Mode: カルマン後値を積算平均
            this._pushStaticSample(kfP, kfR);
            this.measurementMode = this.staticSampleCount >= this._toPositiveInt(this.averagingSampleCount, 60)
                ? 'measuring'
                : 'locking';

            this.pitch = this.staticPitchSum / this.staticSampleCount;
            this.roll = this.staticRollSum / this.staticSampleCount;
        } else {
            // Static -> Active へ戻る際は静止平均状態をクリア
            if (this.measurementMode !== 'active') {
                this._resetStaticBuffer();
                this.measurementMode = 'active';
            }

            // Active Mode: 従来の EMA + Deadzone を維持
            if (!this.emaInitialized) {
                this.emaPitch = kfP;
                this.emaRoll = kfR;
                this.emaInitialized = true;
            } else {
                this.emaPitch = this.emaAlpha * kfP + (1 - this.emaAlpha) * this.emaPitch;
                this.emaRoll = this.emaAlpha * kfR + (1 - this.emaAlpha) * this.emaRoll;
            }

            let newPitch = this.emaPitch;
            let newRoll = this.emaRoll;

            if (Math.abs(newPitch - this._prevPitch) < this.deadzone) {
                newPitch = this._prevPitch;
            }
            if (Math.abs(newRoll - this._prevRoll) < this.deadzone) {
                newRoll = this._prevRoll;
            }

            this._prevPitch = newPitch;
            this._prevRoll = newRoll;
            this.pitch = newPitch;
            this.roll = newRoll;
        }

        // 統計更新
        if (Math.abs(this.pitch) > Math.abs(this.maxPitch)) this.maxPitch = this.pitch;
        if (Math.abs(this.roll) > Math.abs(this.maxRoll)) this.maxRoll = this.roll;
        return true;
    }

    calibrate() {
        this.cancelTwoPointCalibration();

        // 現在の生の値ではなく、フィルタ済みの安定した値をキャリブレーション基準とする
        // あるいは、現在の値をオフセットとして保存する
        // ここでは単純に「現在のフィルタ値」をゼロとするためのオフセットを計算する
        // ただし、既にオフセットがある場合は蓄積する

        // resetにより現在のpitchは0になるが、その前に今の傾きを記録する必要がある
        // calib = raw - target(0) 
        // 現在: pitch = raw - calib
        // 新しいcalib = raw = pitch + old_calib

        this.calibPitch += this.pitch;
        this.calibRoll += this.roll;

        // 永続化
        const saveResult = this.saveCalibration();

        // フィルタ状態をリセットして、新しいゼロ点から開始
        this._resetPostCalibrationState();
        return saveResult;
    }

    startTwoPointCalibration() {
        this.twoPointCalibration.step = 'awaiting_first';
        this.twoPointCalibration.firstPoint = null;
        this.twoPointCalibration.startedAt = 0;
        return { ok: true, step: this.twoPointCalibration.step };
    }

    captureTwoPointCalibrationPoint() {
        const state = this.twoPointCalibration.step;
        if (state === 'idle') {
            return { ok: false, reason: 'not_started' };
        }
        if (state === 'awaiting_second' && this._isTwoPointCalibrationExpired()) {
            this.cancelTwoPointCalibration();
            return { ok: false, reason: 'timeout' };
        }
        if (!this._isCalibrationCaptureStable()) {
            return { ok: false, reason: 'not_stable' };
        }

        if (state === 'awaiting_first') {
            this.twoPointCalibration.firstPoint = {
                pitch: this.pitch,
                roll: this.roll
            };
            this.twoPointCalibration.step = 'awaiting_second';
            this.twoPointCalibration.startedAt = Date.now();
            return { ok: true, step: 'awaiting_second' };
        }

        if (state === 'awaiting_second') {
            const first = this.twoPointCalibration.firstPoint;
            const secondPitch = this.pitch;
            const secondRoll = this.roll;
            const offsetPitch = (first.pitch + secondPitch) / 2;
            const offsetRoll = (first.roll + secondRoll) / 2;

            this.calibPitch += offsetPitch;
            this.calibRoll += offsetRoll;

            const saveResult = this.saveCalibration();
            this._resetPostCalibrationState();
            this.cancelTwoPointCalibration();

            return {
                ok: saveResult.ok,
                step: 'completed',
                done: true,
                reason: saveResult.reason,
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

    resetStats() {
        this.maxPitch = 0;
        this.maxRoll = 0;
        this.sampleCount = 0;
    }

    setKalmanParams(q, r) {
        this.kfPitch.setParams(q, r);
        this.kfRoll.setParams(q, r);
    }

    getTotalAngle() {
        return Math.sqrt(this.pitch * this.pitch + this.roll * this.roll);
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

    _isCalibrationCaptureStable() {
        return this.measurementMode === 'locking' || this.measurementMode === 'measuring';
    }

    _isTwoPointCalibrationExpired() {
        const startedAt = this.twoPointCalibration.startedAt;
        if (startedAt <= 0) return false;
        return Date.now() - startedAt > this.twoPointCalibrationTimeoutMs;
    }

    _resetPostCalibrationState() {
        this.kfPitch.reset();
        this.kfRoll.reset();
        this.emaInitialized = false;
        this.pitch = 0;
        this.roll = 0;
        this._prevPitch = 0;
        this._prevRoll = 0;
        resetMotionWindow(this);
        this.measurementMode = 'active';
        this._resetStaticBuffer();
    }

    _updateMotionWindow(kfPitch, kfRoll) {
        const windowSize = this._toPositiveInt(this.staticDurationFrame, 30);
        updateMotionWindow(this, kfPitch, kfRoll, windowSize);
    }

    _pushMotionMetric(metric) {
        const windowSize = this._toPositiveInt(this.staticDurationFrame, 30);
        pushMotionMetric(this, metric, windowSize);
    }

    _isStaticDetected() {
        const windowSize = this._toPositiveInt(this.staticDurationFrame, 30);
        const threshold = Number.isFinite(this.staticVarianceThreshold) && this.staticVarianceThreshold >= 0
            ? this.staticVarianceThreshold
            : 0.002;
        return isStaticDetected(this, windowSize, threshold);
    }

    _pushStaticSample(kfPitch, kfRoll) {
        const maxSize = this._toPositiveInt(this.maxBufferSize, 2000);
        pushStaticSample(this, kfPitch, kfRoll, maxSize);
    }

    _resetStaticBuffer() {
        resetStaticBuffer(this);
    }

    _compactMotionWindowIfNeeded() {
        if (this.motionWindowStart < 256 || this.motionWindowStart * 2 < this.motionWindow.length) {
            return;
        }
        this.motionWindow = this.motionWindow.slice(this.motionWindowStart);
        this.motionWindowStart = 0;
    }

    _compactStaticBuffersIfNeeded() {
        if (this.staticBufferStart < 256 || this.staticBufferStart * 2 < this.staticPitchBuffer.length) {
            return;
        }
        this.staticPitchBuffer = this.staticPitchBuffer.slice(this.staticBufferStart);
        this.staticRollBuffer = this.staticRollBuffer.slice(this.staticBufferStart);
        this.staticBufferStart = 0;
    }

    _toPositiveInt(value, fallback) {
        return toPositiveInt(value, fallback);
    }

    _storageErrorReason(error) {
        if (error && error.name === 'QuotaExceededError') {
            return 'quota_exceeded';
        }
        return 'storage_unavailable';
    }
}
