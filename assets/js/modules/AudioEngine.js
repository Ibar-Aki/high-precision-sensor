/**
 * 音声エンジン (Web Audio API)
 * 4方向のオシレーター制御とステレオパンニングを担当
 */
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
                osc.frequency.value = 440;
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
        const ramp = 0.05; // 50ms ランプ

        // パン（左右）
        if (this.panner && this.panner.pan) {
            const pan = Math.max(-1, Math.min(1, roll / 15));
            this.panner.pan.setTargetAtTime(pan, now, 0.05);
        }

        // 各方向の音量とピッチ計算
        const maxAngle = 30; // 最大参照角度

        // 前方向
        if (pitch < -0.05) {
            const intensity = Math.min(absPitch / maxAngle, 1);
            const freq = 220 + intensity * 660; // 220Hz ~ 880Hz
            this.oscillators.front.frequency.setTargetAtTime(freq, now, ramp);
            this.gains.front.gain.setTargetAtTime(intensity * 0.3, now, ramp);
        } else {
            this.gains.front.gain.setTargetAtTime(0, now, ramp);
        }

        // 後方向
        if (pitch > 0.05) {
            const intensity = Math.min(absPitch / maxAngle, 1);
            const freq = 220 + intensity * 660;
            this.oscillators.back.frequency.setTargetAtTime(freq, now, ramp);
            this.gains.back.gain.setTargetAtTime(intensity * 0.3, now, ramp);
        } else {
            this.gains.back.gain.setTargetAtTime(0, now, ramp);
        }

        // 左方向
        if (roll < -0.05) {
            const intensity = Math.min(absRoll / maxAngle, 1);
            const freq = 330 + intensity * 440;
            this.oscillators.left.frequency.setTargetAtTime(freq, now, ramp);
            this.gains.left.gain.setTargetAtTime(intensity * 0.25, now, ramp);
        } else {
            this.gains.left.gain.setTargetAtTime(0, now, ramp);
        }

        // 右方向
        if (roll > 0.05) {
            const intensity = Math.min(absRoll / maxAngle, 1);
            const freq = 330 + intensity * 440;
            this.oscillators.right.frequency.setTargetAtTime(freq, now, ramp);
            this.gains.right.gain.setTargetAtTime(intensity * 0.25, now, ramp);
        } else {
            this.gains.right.gain.setTargetAtTime(0, now, ramp);
        }
    }

    _silenceAll() {
        if (!this._initialized) return;
        const now = this.ctx.currentTime;
        for (const g of Object.values(this.gains)) {
            g.gain.setTargetAtTime(0, now, 0.05);
        }
    }

    setMasterVolume(v) {
        this.masterVolume = v;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
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
