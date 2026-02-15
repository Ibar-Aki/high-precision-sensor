export class AppEventBinder {
    constructor({ sensor, audio, ui, onStart, onSaveSettings, onToast, onStorageError }) {
        this.sensor = sensor;
        this.audio = audio;
        this.ui = ui;
        this.onStart = onStart;
        this.onSaveSettings = onSaveSettings;
        this.onToast = onToast;
        this.onStorageError = onStorageError;
        this._unbinders = [];
    }

    bind() {
        this.destroy();

        this._addListener(document.getElementById('btn-start'), 'click', () => this.onStart?.());

        this._addListener(document.getElementById('btn-sound-toggle'), 'click', (e) => {
            const on = this.audio.toggle();
            e.currentTarget?.classList.toggle('active', on);
            this.onSaveSettings?.();
        });

        this._addListener(document.getElementById('btn-settings'), 'click', () => {
            document.getElementById('settings-panel')?.classList.add('open');
        });
        const closeSettings = () => {
            document.getElementById('settings-panel')?.classList.remove('open');
        };
        this._addListener(document.getElementById('btn-close-settings'), 'click', closeSettings);
        this._addListener(document.getElementById('settings-overlay'), 'click', closeSettings);

        this._addListener(document.getElementById('btn-calibrate'), 'click', () => {
            const result = this.sensor.calibrate();
            const measurementArea = document.querySelector('.measurement-area');
            measurementArea?.classList.add('calibrated');
            setTimeout(() => {
                measurementArea?.classList.remove('calibrated');
            }, 600);
            this.onToast?.('キャリブレーション完了');
            if (result && !result.ok) {
                this.onStorageError?.('キャリブレーション保存', result.reason);
            }
        });

        this._addListener(document.getElementById('btn-reset-stats'), 'click', () => {
            this.sensor.resetStats();
            this.onToast?.('統計リセット');
        });

        this._addListener(document.getElementById('btn-lock'), 'click', (e) => {
            this.sensor.locked = !this.sensor.locked;
            e.currentTarget?.classList.toggle('active', this.sensor.locked);
            document.querySelector('.measurement-area')?.classList.toggle('locked', this.sensor.locked);

            const svg = e.currentTarget?.querySelector('.btn-svg');
            if (svg) svg.style.fill = this.sensor.locked ? 'var(--accent-cyan)' : '';

            this.onToast?.(this.sensor.locked ? '値ロック中' : 'ロック解除');
        });

        this._bindSlider('filter-alpha', (v) => {
            this.sensor.emaAlpha = v;
            document.getElementById('filter-alpha-val').textContent = v.toFixed(2);
        });
        this._bindSlider('kalman-q', (v) => {
            this.sensor.setKalmanParams(v, this.sensor.kfPitch.r);
            document.getElementById('kalman-q-val').textContent = v.toFixed(4);
        });
        this._bindSlider('kalman-r', (v) => {
            this.sensor.setKalmanParams(this.sensor.kfPitch.q, v);
            document.getElementById('kalman-r-val').textContent = v.toFixed(2);
        });
        this._bindSlider('deadzone', (v) => {
            this.sensor.deadzone = v;
            document.getElementById('deadzone-val').textContent = v.toFixed(3);
        });
        this._bindSlider('sound-threshold', (v) => {
            this.audio.threshold = v;
            document.getElementById('sound-threshold-val').textContent = v.toFixed(1);
        });
        this._bindSlider('master-volume', (v) => {
            this.audio.setMasterVolume(v);
            document.getElementById('master-volume-val').textContent = Math.round(v * 100) + '%';
        });
        this._bindSlider('decimal-places', (v) => {
            this.ui.decimalPlaces = Math.round(v);
            document.getElementById('decimal-places-val').textContent = Math.round(v);
        });
        this._bindSlider('level-sensitivity', (v) => {
            this.ui.levelSensitivity = v;
            document.getElementById('level-sensitivity-val').textContent = Math.round(v);
        });

        document.querySelectorAll('[data-sound-mode]').forEach((btn) => {
            this._addListener(btn, 'click', () => {
                document.querySelectorAll('[data-sound-mode]').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                const mode = btn.dataset.soundMode;
                this.audio.setMode(mode);
                const thresholdSetting = document.getElementById('threshold-setting');
                if (thresholdSetting) {
                    thresholdSetting.style.display = mode === 'threshold' ? 'block' : 'none';
                }
                this.onSaveSettings?.();
            });
        });
    }

    destroy() {
        for (const unbind of this._unbinders) {
            unbind();
        }
        this._unbinders = [];
    }

    _bindSlider(id, callback) {
        const el = document.getElementById(id);
        if (!el) return;
        this._addListener(el, 'input', () => {
            callback(parseFloat(el.value));
            this.onSaveSettings?.();
        });
    }

    _addListener(target, eventName, handler) {
        if (!target) return;
        target.addEventListener(eventName, handler);
        this._unbinders.push(() => target.removeEventListener(eventName, handler));
    }
}
