import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsManager } from '../assets/js/modules/SettingsManager.js';

const createLocalStorageMock = () => {
    let store = {};
    return {
        getItem(key) {
            return store[key] ?? null;
        },
        setItem(key, value) {
            store[key] = String(value);
        },
        clear() {
            store = {};
        }
    };
};

describe('SettingsManager', () => {
    beforeEach(() => {
        Object.defineProperty(global, 'localStorage', {
            value: createLocalStorageMock(),
            configurable: true
        });
    });

    it('設定を保存・読み込みできること', () => {
        const manager = new SettingsManager();
        const settings = { deadzone: 0.01, soundEnabled: true };

        const saveResult = manager.save(settings);
        expect(saveResult).toEqual({ ok: true });

        const loadResult = manager.load();
        expect(loadResult.ok).toBe(true);
        expect(loadResult.value).toEqual(settings);
    });

    it('QuotaExceededError時に理由コードを返すこと', () => {
        const manager = new SettingsManager();
        const quotaError = new Error('quota');
        quotaError.name = 'QuotaExceededError';

        global.localStorage.setItem = () => {
            throw quotaError;
        };

        const result = manager.save({ a: 1 });
        expect(result).toEqual({ ok: false, reason: 'quota_exceeded' });
    });
});
