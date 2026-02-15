import { KalmanFilter1D } from './KalmanFilter1D.js';

/**
 * センサーエンジン
 * 2軸（Pitch/Roll）のカルマンフィルタ + EMA + デッドゾーン処理を担当
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

        // 3. EMA (指数移動平均) 適用
        /* 
           EMA = α * 現在値 + (1 - α) * 前回値
           ローパスフィルタとして機能し、高周波ノイズを除去する。
        */
        if (!this.emaInitialized) {
            this.emaPitch = kfP;
            this.emaRoll = kfR;
            this.emaInitialized = true;
        } else {
            this.emaPitch = this.emaAlpha * kfP + (1 - this.emaAlpha) * this.emaPitch;
            this.emaRoll = this.emaAlpha * kfR + (1 - this.emaAlpha) * this.emaRoll;
        }

        // 4. デッドゾーン (ヒステリシス処理)
        /*
           微小な変化（deadzone以下）を無視することで、数値のチラつきを抑制し
           「静止している」感覚をユーザーに与える。
        */
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

        // 統計更新
        if (Math.abs(this.pitch) > Math.abs(this.maxPitch)) this.maxPitch = this.pitch;
        if (Math.abs(this.roll) > Math.abs(this.maxRoll)) this.maxRoll = this.roll;
        return true;
    }

    calibrate() {
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
        this.kfPitch.reset();
        this.kfRoll.reset();
        this.emaInitialized = false;
        this.pitch = 0;
        this.roll = 0;
        this._prevPitch = 0;
        this._prevRoll = 0;
        return saveResult;
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

    _storageErrorReason(error) {
        if (error && error.name === 'QuotaExceededError') {
            return 'quota_exceeded';
        }
        return 'storage_unavailable';
    }
}
