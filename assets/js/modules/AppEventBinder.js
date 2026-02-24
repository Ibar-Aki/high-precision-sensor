import { CalibrationControlBinder } from './CalibrationControlBinder.js';
import { SettingsControlBinder } from './SettingsControlBinder.js';

export class AppEventBinder {
    constructor({ sensor, audio, ui, onStart, onSaveSettings, onToast, onStorageError, onStatusCode }) {
        this.sensor = sensor;
        this.audio = audio;
        this.ui = ui;
        this.onStart = onStart;
        this.onSaveSettings = onSaveSettings;
        this.onToast = onToast;
        this.onStorageError = onStorageError;
        this.onStatusCode = onStatusCode;
        this._unbinders = [];

        this.calibrationBinder = new CalibrationControlBinder({
            sensor: this.sensor,
            onToast: this.onToast,
            onStorageError: this.onStorageError,
            onStatusCode: this.onStatusCode,
            onFlashCalibrated: () => this._flashCalibrated(),
        });

        this.settingsBinder = new SettingsControlBinder({
            sensor: this.sensor,
            audio: this.audio,
            ui: this.ui,
            onSaveSettings: this.onSaveSettings,
        });
    }

    bind() {
        this.destroy();

        this._addListener(document.getElementById('btn-start'), 'click', () => this.onStart?.());

        this._addListener(document.getElementById('btn-sound-toggle'), 'click', (e) => {
            const on = this.audio.toggle();
            e.currentTarget?.classList.toggle('active', on);
            this.onSaveSettings?.();
        });

        this._addListener(document.getElementById('btn-reset-stats'), 'click', () => {
            this.sensor.resetStats();
            this.onToast?.('統計リセット');
            this.onStatusCode?.('STATS_RESET');
        });

        this._addListener(document.getElementById('btn-lock'), 'click', (e) => {
            this.sensor.locked = !this.sensor.locked;
            e.currentTarget?.classList.toggle('active', this.sensor.locked);
            document.querySelector('.measurement-area')?.classList.toggle('locked', this.sensor.locked);

            const svg = e.currentTarget?.querySelector('.btn-svg');
            if (svg) svg.style.fill = this.sensor.locked ? 'var(--accent-cyan)' : '';

            this.onToast?.(this.sensor.locked ? '値ロック中' : 'ロック解除');
            this.onStatusCode?.(this.sensor.locked ? 'VALUE_LOCKED' : 'VALUE_UNLOCKED');
        });

        this.calibrationBinder.bind((target, eventName, handler) => {
            this._addListener(target, eventName, handler);
        });
        this.settingsBinder.bind((target, eventName, handler) => {
            this._addListener(target, eventName, handler);
        });
    }

    destroy() {
        for (const unbind of this._unbinders) {
            unbind();
        }
        this._unbinders = [];
    }

    _flashCalibrated() {
        const measurementArea = document.querySelector('.measurement-area');
        measurementArea?.classList.add('calibrated');
        setTimeout(() => {
            measurementArea?.classList.remove('calibrated');
        }, 600);
    }

    _addListener(target, eventName, handler) {
        if (!target) return;
        target.addEventListener(eventName, handler);
        this._unbinders.push(() => target.removeEventListener(eventName, handler));
    }
}

