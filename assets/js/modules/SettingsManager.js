const SETTINGS_KEY = 'tilt-sensor-settings';

export class SettingsManager {
    load() {
        let data = null;
        try {
            data = localStorage.getItem(SETTINGS_KEY);
        } catch (error) {
            return { ok: false, reason: this._storageErrorReason(error), value: {} };
        }

        if (!data) {
            return { ok: true, value: {} };
        }

        let parsed = null;
        try {
            parsed = JSON.parse(data);
        } catch {
            return { ok: false, reason: 'invalid_settings', value: {} };
        }

        const sanitized = this._sanitizeSettings(parsed);
        if (sanitized === null) {
            return { ok: false, reason: 'invalid_settings', value: {} };
        }
        return { ok: true, value: sanitized };
    }

    save(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            return { ok: true };
        } catch (error) {
            return { ok: false, reason: this._storageErrorReason(error) };
        }
    }

    _storageErrorReason(error) {
        if (error && error.name === 'QuotaExceededError') {
            return 'quota_exceeded';
        }
        return 'storage_unavailable';
    }

    _sanitizeSettings(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return null;
        }

        const sanitized = {};

        const settingsVersion = this._sanitizeNumber(raw.settingsVersion, 0, 99, { integer: true });
        if (settingsVersion !== undefined) sanitized.settingsVersion = settingsVersion;

        const emaAlpha = this._sanitizeNumber(raw.emaAlpha, 0.01, 0.5);
        if (emaAlpha !== undefined) sanitized.emaAlpha = emaAlpha;

        const kalmanQ = this._sanitizeNumber(raw.kalmanQ, 0.0001, 0.1);
        if (kalmanQ !== undefined) sanitized.kalmanQ = kalmanQ;

        const kalmanR = this._sanitizeNumber(raw.kalmanR, 0.01, 1.0);
        if (kalmanR !== undefined) sanitized.kalmanR = kalmanR;

        const deadzone = this._sanitizeNumber(raw.deadzone, 0, 0.1);
        if (deadzone !== undefined) sanitized.deadzone = deadzone;

        const staticVarianceThreshold = this._sanitizeNumber(raw.staticVarianceThreshold, 0.0001, 0.02);
        if (staticVarianceThreshold !== undefined) sanitized.staticVarianceThreshold = staticVarianceThreshold;

        const staticDurationFrame = this._sanitizeNumber(raw.staticDurationFrame, 10, 120, { integer: true });
        if (staticDurationFrame !== undefined) sanitized.staticDurationFrame = staticDurationFrame;

        const averagingSampleCount = this._sanitizeNumber(raw.averagingSampleCount, 10, 300, { integer: true });
        if (averagingSampleCount !== undefined) sanitized.averagingSampleCount = averagingSampleCount;

        const soundEnabled = this._sanitizeBoolean(raw.soundEnabled);
        if (soundEnabled !== undefined) sanitized.soundEnabled = soundEnabled;

        const outputType = this._sanitizeEnum(raw.outputType, ['normal', 'speech', 'off']);
        if (outputType !== undefined) sanitized.outputType = outputType;

        const soundMode = this._sanitizeEnum(raw.soundMode, ['continuous', 'threshold']);
        if (soundMode !== undefined) sanitized.soundMode = soundMode;

        const soundThreshold = this._sanitizeNumber(raw.soundThreshold, 0.1, 10);
        if (soundThreshold !== undefined) sanitized.soundThreshold = soundThreshold;

        const masterVolume = this._sanitizeNumber(raw.masterVolume, 0, 1);
        if (masterVolume !== undefined) sanitized.masterVolume = masterVolume;

        const decimalPlaces = this._sanitizeNumber(raw.decimalPlaces, 1, 4, { integer: true });
        if (decimalPlaces !== undefined) sanitized.decimalPlaces = decimalPlaces;

        const levelSens = this._sanitizeNumber(raw.levelSens, 1, 45, { integer: true });
        if (levelSens !== undefined) sanitized.levelSens = levelSens;

        return sanitized;
    }

    _sanitizeNumber(value, min, max, options = {}) {
        const numeric = typeof value === 'number'
            ? value
            : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
        if (!Number.isFinite(numeric)) return undefined;

        const clamped = Math.min(max, Math.max(min, numeric));
        if (options.integer) {
            return Math.round(clamped);
        }
        return clamped;
    }

    _sanitizeBoolean(value) {
        if (value === true || value === false) return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
        return undefined;
    }

    _sanitizeEnum(value, accepted) {
        if (typeof value !== 'string') return undefined;
        if (!accepted.includes(value)) return undefined;
        return value;
    }
}
