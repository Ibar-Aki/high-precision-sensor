import { refreshSoundSettingsVisibility } from './SoundSettingsVisibility.js';

export class SettingsControlBinder {
    constructor({ sensor, audio, ui, onSaveSettings }) {
        this.sensor = sensor;
        this.audio = audio;
        this.ui = ui;
        this.onSaveSettings = onSaveSettings;
    }

    bind(addListener) {
        addListener(document.getElementById('btn-settings'), 'click', () => {
            document.getElementById('settings-panel')?.classList.add('open');
        });
        const closeSettings = () => {
            document.getElementById('settings-panel')?.classList.remove('open');
        };
        addListener(document.getElementById('btn-close-settings'), 'click', closeSettings);
        addListener(document.getElementById('settings-overlay'), 'click', closeSettings);

        this._bindSlider(addListener, 'filter-alpha', (v) => {
            this.sensor.emaAlpha = v;
            document.getElementById('filter-alpha-val').textContent = v.toFixed(2);
        });
        this._bindSlider(addListener, 'kalman-q', (v) => {
            this.sensor.setKalmanParams(v, this.sensor.kfPitch.r);
            document.getElementById('kalman-q-val').textContent = v.toFixed(4);
        });
        this._bindSlider(addListener, 'kalman-r', (v) => {
            this.sensor.setKalmanParams(this.sensor.kfPitch.q, v);
            document.getElementById('kalman-r-val').textContent = v.toFixed(2);
        });
        this._bindSlider(addListener, 'deadzone', (v) => {
            this.sensor.deadzone = v;
            document.getElementById('deadzone-val').textContent = v.toFixed(3);
        });
        this._bindSlider(addListener, 'static-variance-threshold', (v) => {
            this.sensor.staticVarianceThreshold = v;
            document.getElementById('static-variance-threshold-val').textContent = v.toFixed(4);
        });
        this._bindSlider(addListener, 'static-duration-frame', (v) => {
            const frame = Math.max(1, Math.round(v));
            this.sensor.staticDurationFrame = frame;
            document.getElementById('static-duration-frame').value = String(frame);
            document.getElementById('static-duration-frame-val').textContent = frame;
        });
        this._bindSlider(addListener, 'averaging-sample-count', (v) => {
            const count = Math.max(1, Math.round(v));
            this.sensor.averagingSampleCount = count;
            document.getElementById('averaging-sample-count').value = String(count);
            document.getElementById('averaging-sample-count-val').textContent = count;
        });
        this._bindSlider(addListener, 'sound-threshold', (v) => {
            this.audio.threshold = v;
            document.getElementById('sound-threshold-val').textContent = v.toFixed(1);
        });
        this._bindSlider(addListener, 'master-volume', (v) => {
            this.audio.setMasterVolume(v);
            document.getElementById('master-volume-val').textContent = Math.round(v * 100) + '%';
        });
        this._bindSlider(addListener, 'decimal-places', (v) => {
            this.ui.decimalPlaces = Math.round(v);
            document.getElementById('decimal-places-val').textContent = Math.round(v);
        });
        this._bindSlider(addListener, 'level-sensitivity', (v) => {
            this.ui.levelSensitivity = v;
            document.getElementById('level-sensitivity-val').textContent = Math.round(v);
        });

        document.querySelectorAll('[data-output-type]').forEach((btn) => {
            addListener(btn, 'click', () => {
                document.querySelectorAll('[data-output-type]').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                this.audio.setOutputType(btn.dataset.outputType);
                refreshSoundSettingsVisibility(this.audio);
                this.onSaveSettings?.();
            });
        });

        document.querySelectorAll('[data-sound-mode]').forEach((btn) => {
            addListener(btn, 'click', () => {
                document.querySelectorAll('[data-sound-mode]').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                this.audio.setMode(btn.dataset.soundMode);
                refreshSoundSettingsVisibility(this.audio);
                this.onSaveSettings?.();
            });
        });

        refreshSoundSettingsVisibility(this.audio);
    }

    _bindSlider(addListener, id, callback) {
        const el = document.getElementById(id);
        if (!el) return;
        addListener(el, 'input', () => {
            callback(parseFloat(el.value));
            this.onSaveSettings?.();
        });
    }
}

