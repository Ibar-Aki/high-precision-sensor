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
const SPEECH_INTERVAL_MS = 20000;
const SPEECH_LANG = 'ja-JP';
const ANNOUNCE_LEVEL_EPSILON_DEG = 0.05;

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.enabled = false;
        this.outputType = 'normal'; // 'normal' | 'speech' | 'off'
        this.mode = 'continuous'; // 'continuous' | 'threshold'
        this.threshold = 1.0;
        this.masterVolume = 0.5;

        // オシレーターノード群
        this.oscillators = {};
        this.gains = {};
        this.panner = null;
        this.masterGain = null;
        this._initialized = false;
        this._speechTimerId = null;
        this._latestPitch = 0;
        this._latestRoll = 0;
        this._isSilenced = false;
        this._resumePromise = null;
        this._lastResumeAttemptAt = -Infinity;
        this._resumeRetryIntervalMs = 1000;
        this._initAttempted = false;
    }

    init() {
        this._initAttempted = true;
        if (this._initialized) {
            this._syncOutputMode();
            return;
        }
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
        this._syncOutputMode();
    }

    update(pitch, roll) {
        this._latestPitch = pitch;
        this._latestRoll = roll;

        if (!this.enabled || this.outputType === 'off') {
            this._silenceAll();
            this._stopSpeechAnnouncements();
            return;
        }

        if (this.outputType === 'speech') {
            this._silenceAll();
            this._ensureSpeechAnnouncements();
            return;
        }

        this._stopSpeechAnnouncements();
        if (!this._initialized) {
            return;
        }

        // AudioContext がサスペンドされていたら再開（多重実行を抑止）
        this._ensureContextRunning();

        const absPitch = Math.abs(pitch);
        const absRoll = Math.abs(roll);

        // 閾値モードチェック
        if (this.mode === 'threshold') {
            if (absPitch < this.threshold && absRoll < this.threshold) {
                this._silenceAll();
                return;
            }
        }

        const frontActive = pitch < -AXIS_ACTIVE_THRESHOLD;
        const backActive = pitch > AXIS_ACTIVE_THRESHOLD;
        const leftActive = roll < -AXIS_ACTIVE_THRESHOLD;
        const rightActive = roll > AXIS_ACTIVE_THRESHOLD;
        if (!frontActive && !backActive && !leftActive && !rightActive) {
            this._silenceAll();
            return;
        }

        this._isSilenced = false;

        const now = this.ctx.currentTime;

        // パン（左右）
        if (this.panner && this.panner.pan) {
            const pan = Math.max(-1, Math.min(1, roll / PAN_DIVISOR));
            this.panner.pan.setTargetAtTime(pan, now, PAN_RAMP_SECONDS);
        }

        // 各方向の音量と周波数を傾き量から算出する
        const maxAngle = MAX_TILT_ANGLE_FOR_AUDIO;

        // 前方向
        if (frontActive) {
            const intensity = Math.min(absPitch / maxAngle, 1);
            const freq = PITCH_BASE_FREQUENCY + intensity * PITCH_FREQUENCY_RANGE;
            this.oscillators.front.frequency.setTargetAtTime(freq, now, GAIN_RAMP_SECONDS);
            this.gains.front.gain.setTargetAtTime(intensity * PITCH_GAIN_SCALE, now, GAIN_RAMP_SECONDS);
        } else {
            this.gains.front.gain.setTargetAtTime(0, now, GAIN_RAMP_SECONDS);
        }

        // 後方向
        if (backActive) {
            const intensity = Math.min(absPitch / maxAngle, 1);
            const freq = PITCH_BASE_FREQUENCY + intensity * PITCH_FREQUENCY_RANGE;
            this.oscillators.back.frequency.setTargetAtTime(freq, now, GAIN_RAMP_SECONDS);
            this.gains.back.gain.setTargetAtTime(intensity * PITCH_GAIN_SCALE, now, GAIN_RAMP_SECONDS);
        } else {
            this.gains.back.gain.setTargetAtTime(0, now, GAIN_RAMP_SECONDS);
        }

        // 左方向
        if (leftActive) {
            const intensity = Math.min(absRoll / maxAngle, 1);
            const freq = ROLL_BASE_FREQUENCY + intensity * ROLL_FREQUENCY_RANGE;
            this.oscillators.left.frequency.setTargetAtTime(freq, now, GAIN_RAMP_SECONDS);
            this.gains.left.gain.setTargetAtTime(intensity * ROLL_GAIN_SCALE, now, GAIN_RAMP_SECONDS);
        } else {
            this.gains.left.gain.setTargetAtTime(0, now, GAIN_RAMP_SECONDS);
        }

        // 右方向
        if (rightActive) {
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
        if (this._isSilenced) return;
        const now = this.ctx.currentTime;
        for (const g of Object.values(this.gains)) {
            g.gain.setTargetAtTime(0, now, SILENCE_RAMP_SECONDS);
        }
        this._isSilenced = true;
    }

    _ensureContextRunning() {
        if (!this.ctx || this.ctx.state !== 'suspended') {
            return;
        }
        if (this._resumePromise) {
            return;
        }

        const now = this._getNowMs();
        if (now - this._lastResumeAttemptAt < this._resumeRetryIntervalMs) {
            return;
        }
        this._lastResumeAttemptAt = now;

        try {
            const maybePromise = this.ctx.resume?.();
            if (!maybePromise || typeof maybePromise.then !== 'function') {
                return;
            }
            this._resumePromise = Promise.resolve(maybePromise)
                .catch(() => {
                    // ユーザー操作待ちなどでresume不可でも継続
                })
                .finally(() => {
                    this._resumePromise = null;
                });
        } catch {
            // resume例外時も次回リトライへ
        }
    }

    _getNowMs() {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    }

    setMasterVolume(v) {
        this.masterVolume = v;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, MASTER_VOLUME_RAMP_SECONDS);
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        this._syncOutputMode();
        return this.enabled;
    }

    setMode(mode) {
        if (mode === 'continuous' || mode === 'threshold') {
            this.mode = mode;
        }
    }

    setOutputType(type) {
        if (type !== 'normal' && type !== 'speech' && type !== 'off') {
            return;
        }
        this.outputType = type;
        this._syncOutputMode();
    }

    _syncOutputMode() {
        if (!this.enabled || this.outputType === 'off') {
            this._silenceAll();
            this._stopSpeechAnnouncements();
            return;
        }
        if (this.outputType === 'speech') {
            this._silenceAll();
            this._ensureSpeechAnnouncements();
            return;
        }
        this._stopSpeechAnnouncements();
    }

    _ensureSpeechAnnouncements() {
        if (!this._initAttempted || this._speechTimerId !== null || typeof window === 'undefined') {
            return;
        }
        if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
            return;
        }
        this._speechTimerId = window.setInterval(() => {
            this._announceAngles();
        }, SPEECH_INTERVAL_MS);
    }

    _stopSpeechAnnouncements() {
        let stopped = false;
        if (this._speechTimerId !== null && typeof window !== 'undefined') {
            window.clearInterval(this._speechTimerId);
            this._speechTimerId = null;
            stopped = true;
        }
        if (stopped && typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }

    _announceAngles() {
        if (!this.enabled || this.outputType !== 'speech' || typeof window === 'undefined') {
            return;
        }
        if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
            return;
        }

        const synth = window.speechSynthesis;
        try {
            synth.resume?.();
        } catch {
            // Safari で resume 非対応/失敗時も読み上げ続行
        }
        const utterance = new SpeechSynthesisUtterance(this._buildAnnouncement(this._latestPitch, this._latestRoll));
        utterance.lang = SPEECH_LANG;
        utterance.volume = this.masterVolume;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        if (synth.speaking) {
            synth.cancel();
        }
        synth.speak(utterance);
    }

    primeSpeechAnnouncement() {
        if (!this.enabled || this.outputType !== 'speech' || typeof window === 'undefined') {
            return false;
        }
        if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
            return false;
        }
        try {
            const synth = window.speechSynthesis;
            synth.resume?.();
            const utterance = new SpeechSynthesisUtterance('音声読み上げを開始します');
            utterance.lang = SPEECH_LANG;
            utterance.volume = this.masterVolume;
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            if (synth.speaking) {
                synth.cancel();
            }
            synth.speak(utterance);
            return true;
        } catch {
            return false;
        }
    }

    _buildAnnouncement(pitch, roll) {
        const absPitch = Math.abs(pitch);
        const absRoll = Math.abs(roll);
        const pitchLabel = pitch < 0 ? '前上がり' : '後ろ上がり';
        const rollLabel = roll < 0 ? '左上がり' : '右上がり';
        const pitchValue = Math.abs(pitch).toFixed(1);
        const rollValue = Math.abs(roll).toFixed(1);
        const pitchText = absPitch < ANNOUNCE_LEVEL_EPSILON_DEG ? `水平${pitchValue}ど` : `${pitchLabel}${pitchValue}ど`;
        const rollText = absRoll < ANNOUNCE_LEVEL_EPSILON_DEG ? `水平${rollValue}ど` : `${rollLabel}${rollValue}ど`;
        return `前後、、${pitchText}、、。左右、、${rollText}`;
    }

    destroy() {
        this._stopSpeechAnnouncements();
        const ctx = this.ctx;
        if (this._initialized) {
            for (const osc of Object.values(this.oscillators)) {
                try {
                    osc.stop();
                } catch {
                    // 既に停止済みの場合は無視
                }
            }
        }
        this.oscillators = {};
        this.gains = {};
        this.ctx = null;
        this.masterGain = null;
        this.panner = null;
        this._latestPitch = 0;
        this._latestRoll = 0;
        this._isSilenced = false;
        this._resumePromise = null;
        this._lastResumeAttemptAt = -Infinity;
        this._initialized = false;
        if (ctx && typeof ctx.close === 'function') {
            Promise.resolve(ctx.close()).catch(() => {
                // クローズ失敗は破棄フローを継続
            });
        }
    }
}
