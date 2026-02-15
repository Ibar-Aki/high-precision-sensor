/**
 * 音声エンジン (Web Audio API)
 * 4方向のオシレーター制御とステレオパンニングを担当
 */
const DEFAULT_OSC_FREQUENCY = 440;
const AXIS_ACTIVE_THRESHOLD = 0.05;
const PITCH_BASE_FREQUENCY = 220;
const PITCH_FREQUENCY_RANGE = 660;
const ROLL_BASE_FREQUENCY = 330;
const ROLL_FREQUENCY_RANGE = 440;
const PITCH_GAIN_SCALE = 0.3;
const ROLL_GAIN_SCALE = 0.25;
const MAX_TILT_ANGLE_FOR_AUDIO = 30;
const PAN_DIVISOR = 15;
const GAIN_RAMP_SECONDS = 0.05;
const PAN_RAMP_SECONDS = 0.05;
const SILENCE_RAMP_SECONDS = 0.05;
const MASTER_VOLUME_RAMP_SECONDS = 0.02;

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.enabled = false;
        this.mode = 'continuous'; // 'continuous' | 'threshold'
        this.threshold = 1.0;
        this.masterVolume = 0.5;

        // オシレーターノード群
        this.oscillators = {};
        this.gains = {};
        this.panner = null;
        this.masterGain = null;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.masterVolume;
            this.masterGain.connect(this.ctx.destination);

            // ステレオパンナー
            if (typeof StereoPannerNode !== 'undefined') {
                this.panner = this.ctx.createStereoPanner();
                this.panner.pan.value = 0;
                this.panner.connect(this.masterGain);
            } else {
                this.panner = this.masterGain; // フォールバック
            }

            // 4方向オシレーター
            const types = {
                front: 'sine',      // 前 = サイン波
                back: 'triangle',  // 後 = 三角波
                left: 'sawtooth',  // 左 = ノコギリ波
                right: 'square'     // 右 = 矩形波
            };

            for (const [dir, type] of Object.entries(types)) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = type;
                osc.frequency.value = DEFAULT_OSC_FREQUENCY;
                gain.gain.value = 0;
                osc.connect(gain);
                gain.connect(this.panner);
                osc.start();
                this.oscillators[dir] = osc;
                this.gains[dir] = gain;
            }

            this._initialized = true;
        } catch (e) {
            console.warn('Web Audio API 初期化エラー:', e);
        }
    }

    update(pitch, roll) {
        if (!this._initialized || !this.enabled) {
            this._silenceAll();
            return;
        }

        // AudioContext がサスペンドされていたら再開
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const absPitch = Math.abs(pitch);
        const absRoll = Math.abs(roll);

        // 閾値モードチェック
        if (this.mode === 'threshold') {
            if (absPitch < this.threshold && absRoll < this.threshold) {
                this._silenceAll();
                return;
            }
        }

        const now = this.ctx.currentTime;

        // パン（左右）
        if (this.panner && this.panner.pan) {
            const pan = Math.max(-1, Math.min(1, roll / PAN_DIVISOR));
            this.panner.pan.setTargetAtTime(pan, now, PAN_RAMP_SECONDS);
        }

        // 各方向の音量と周波数を傾き量から算出する
        const maxAngle = MAX_TILT_ANGLE_FOR_AUDIO;

        // 前方向
        if (pitch < -AXIS_ACTIVE_THRESHOLD) {
            const intensity = Math.min(absPitch / maxAngle, 1);
            const freq = PITCH_BASE_FREQUENCY + intensity * PITCH_FREQUENCY_RANGE;
            this.oscillators.front.frequency.setTargetAtTime(freq, now, GAIN_RAMP_SECONDS);
            this.gains.front.gain.setTargetAtTime(intensity * PITCH_GAIN_SCALE, now, GAIN_RAMP_SECONDS);
        } else {
            this.gains.front.gain.setTargetAtTime(0, now, GAIN_RAMP_SECONDS);
        }

        // 後方向
        if (pitch > AXIS_ACTIVE_THRESHOLD) {
            const intensity = Math.min(absPitch / maxAngle, 1);
            const freq = PITCH_BASE_FREQUENCY + intensity * PITCH_FREQUENCY_RANGE;
            this.oscillators.back.frequency.setTargetAtTime(freq, now, GAIN_RAMP_SECONDS);
            this.gains.back.gain.setTargetAtTime(intensity * PITCH_GAIN_SCALE, now, GAIN_RAMP_SECONDS);
        } else {
            this.gains.back.gain.setTargetAtTime(0, now, GAIN_RAMP_SECONDS);
        }

        // 左方向
        if (roll < -AXIS_ACTIVE_THRESHOLD) {
            const intensity = Math.min(absRoll / maxAngle, 1);
            const freq = ROLL_BASE_FREQUENCY + intensity * ROLL_FREQUENCY_RANGE;
            this.oscillators.left.frequency.setTargetAtTime(freq, now, GAIN_RAMP_SECONDS);
            this.gains.left.gain.setTargetAtTime(intensity * ROLL_GAIN_SCALE, now, GAIN_RAMP_SECONDS);
        } else {
            this.gains.left.gain.setTargetAtTime(0, now, GAIN_RAMP_SECONDS);
        }

        // 右方向
        if (roll > AXIS_ACTIVE_THRESHOLD) {
            const intensity = Math.min(absRoll / maxAngle, 1);
            const freq = ROLL_BASE_FREQUENCY + intensity * ROLL_FREQUENCY_RANGE;
            this.oscillators.right.frequency.setTargetAtTime(freq, now, GAIN_RAMP_SECONDS);
            this.gains.right.gain.setTargetAtTime(intensity * ROLL_GAIN_SCALE, now, GAIN_RAMP_SECONDS);
        } else {
            this.gains.right.gain.setTargetAtTime(0, now, GAIN_RAMP_SECONDS);
        }
    }

    _silenceAll() {
        if (!this._initialized) return;
        const now = this.ctx.currentTime;
        for (const g of Object.values(this.gains)) {
            g.gain.setTargetAtTime(0, now, SILENCE_RAMP_SECONDS);
        }
    }

    setMasterVolume(v) {
        this.masterVolume = v;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, MASTER_VOLUME_RAMP_SECONDS);
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) this._silenceAll();
        return this.enabled;
    }

    setMode(mode) {
        this.mode = mode;
    }

    destroy() {
        if (!this._initialized) return;
        for (const osc of Object.values(this.oscillators)) {
            try {
                osc.stop();
            } catch {
                // 既に停止済みの場合は無視
            }
        }
        this.oscillators = {};
        this.gains = {};
        this.ctx?.close();
        this.ctx = null;
        this.masterGain = null;
        this.panner = null;
        this._initialized = false;
    }
}
