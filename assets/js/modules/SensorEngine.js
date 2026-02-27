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
        this.kfPitch = new KalmanFilter1D(0.0005, 0.18);
        this.kfRoll = new KalmanFilter1D(0.0005, 0.18);

        // EMA (Exponential Moving Average)
        this.emaAlpha = 0.06;
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
        this.livePitch = 0;
        this.liveRoll = 0;
        this.finalPitch = NaN;
        this.finalRoll = NaN;
        this.displayFinalPitch = NaN;
        this.displayFinalRoll = NaN;
        this.hasFinalMeasurement = false;

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
        this.staticVarianceThreshold = 0.0025;
        this.staticDurationFrame = 60;
        this.averagingSampleCount = 150;
        this.maxBufferSize = 2000;
        this.staticEntryThresholdScale = 1.0;
        this.staticExitThresholdScale = 1.8;
        this.staticExitGraceFrames = 12;
        this.finalDisplayDeadband = 0.02;
        this.finalDisplayMaxStep = 0.01;

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
        this._staticExitCount = 0;

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

        // 3. LIVE値は常にEMA + Deadzoneで更新する
        this._updateLiveAngles(kfP, kfR);

        // 4. 動き分散を監視し、ハイブリッドモードを切り替える
        this._updateMotionWindow(kfP, kfR);
        const staticDetected = this._isStaticDetectedWithHysteresis();

        if (staticDetected) {
            // Active -> Static への遷移時は平均バッファを初期化
            if (this.measurementMode === 'active') {
                this._resetStaticBuffer();
            }

            // Static Mode: カルマン後値を積算平均
            this._pushStaticSample(kfP, kfR);
            this.measurementMode = this.staticSampleCount >= this._toPositiveInt(this.averagingSampleCount, 150)
                ? 'measuring'
                : 'locking';

            this.finalPitch = this.staticPitchSum / this.staticSampleCount;
            this.finalRoll = this.staticRollSum / this.staticSampleCount;
            this.displayFinalPitch = this._updateDisplayFinalValue(this.displayFinalPitch, this.finalPitch);
            this.displayFinalRoll = this._updateDisplayFinalValue(this.displayFinalRoll, this.finalRoll);
            this.hasFinalMeasurement = this.measurementMode === 'measuring';
            this.pitch = Number.isFinite(this.displayFinalPitch) ? this.displayFinalPitch : this.finalPitch;
            this.roll = Number.isFinite(this.displayFinalRoll) ? this.displayFinalRoll : this.finalRoll;
        } else {
            // Static -> Active へ戻る際は静止平均状態をクリア
            if (this.measurementMode !== 'active') {
                this._resetStaticBuffer();
                this.measurementMode = 'active';
            }
            this.finalPitch = NaN;
            this.finalRoll = NaN;
            this.displayFinalPitch = NaN;
            this.displayFinalRoll = NaN;
            this.hasFinalMeasurement = false;
            this.pitch = this.livePitch;
            this.roll = this.liveRoll;
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

    getLiveAngles() {
        return {
            pitch: this.livePitch,
            roll: this.liveRoll
        };
    }

    getFinalAngles() {
        if (
            !this.hasFinalMeasurement
            || !Number.isFinite(this.displayFinalPitch)
            || !Number.isFinite(this.displayFinalRoll)
        ) {
            return { available: false, pitch: null, roll: null };
        }
        return {
            available: true,
            pitch: this.displayFinalPitch,
            roll: this.displayFinalRoll
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
        this.livePitch = 0;
        this.liveRoll = 0;
        this.finalPitch = NaN;
        this.finalRoll = NaN;
        this.displayFinalPitch = NaN;
        this.displayFinalRoll = NaN;
        this.hasFinalMeasurement = false;
        this._prevPitch = 0;
        this._prevRoll = 0;
        this._staticExitCount = 0;
        resetMotionWindow(this);
        this.measurementMode = 'active';
        this._resetStaticBuffer();
    }

    _updateLiveAngles(kfPitch, kfRoll) {
        if (!this.emaInitialized) {
            this.emaPitch = kfPitch;
            this.emaRoll = kfRoll;
            this.emaInitialized = true;
        } else {
            this.emaPitch = this.emaAlpha * kfPitch + (1 - this.emaAlpha) * this.emaPitch;
            this.emaRoll = this.emaAlpha * kfRoll + (1 - this.emaAlpha) * this.emaRoll;
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

    _updateMotionWindow(kfPitch, kfRoll) {
        const windowSize = this._toPositiveInt(this.staticDurationFrame, 60);
        updateMotionWindow(this, kfPitch, kfRoll, windowSize);
    }

    _pushMotionMetric(metric) {
        const windowSize = this._toPositiveInt(this.staticDurationFrame, 60);
        pushMotionMetric(this, metric, windowSize);
    }

    _isStaticDetectedWithHysteresis() {
        const windowSize = this._toPositiveInt(this.staticDurationFrame, 60);
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
        const graceFrames = this._toPositiveInt(this.staticExitGraceFrames, 12);
        return this._staticExitCount < graceFrames;
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

    _pushStaticSample(kfPitch, kfRoll) {
        const maxSize = this._toPositiveInt(this.maxBufferSize, 2000);
        pushStaticSample(this, kfPitch, kfRoll, maxSize);
    }

    _resetStaticBuffer() {
        resetStaticBuffer(this);
        this._staticExitCount = 0;
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
