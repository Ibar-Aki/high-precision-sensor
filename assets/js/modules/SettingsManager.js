const SETTINGS_KEY = 'tilt-sensor-settings';

export class SettingsManager {
    load() {
        try {
            const data = localStorage.getItem(SETTINGS_KEY);
            return { ok: true, value: data ? JSON.parse(data) : {} };
        } catch (error) {
            return { ok: false, reason: this._storageErrorReason(error), value: {} };
        }
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
}
