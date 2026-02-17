import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsManager } from '../assets/js/modules/SettingsManager.js';

const SETTINGS_KEY = 'tilt-sensor-settings';

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

    it('破損JSONを検出して空設定へフォールバックすること', () => {
        const manager = new SettingsManager();
        global.localStorage.setItem(SETTINGS_KEY, '{broken');

        const result = manager.load();
        expect(result).toEqual({ ok: false, reason: 'invalid_settings', value: {} });
    });

    it('設定値の型・範囲を検証し安全な値のみ返すこと', () => {
        const manager = new SettingsManager();
        global.localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            emaAlpha: '0.8',
            kalmanQ: '0.00005',
            kalmanR: 0.5,
            deadzone: -1,
            staticVarianceThreshold: '0.5',
            staticDurationFrame: '75.6',
            averagingSampleCount: 999,
            soundEnabled: 'true',
            outputType: 'speech',
            soundMode: 'threshold',
            soundThreshold: 'abc',
            masterVolume: '1.2',
            decimalPlaces: '0',
            levelSens: '50',
            ignoredField: 'ignored'
        }));

        const result = manager.load();
        expect(result.ok).toBe(true);
        expect(result.value).toEqual({
            emaAlpha: 0.5,
            kalmanQ: 0.0001,
            kalmanR: 0.5,
            deadzone: 0,
            staticVarianceThreshold: 0.02,
            staticDurationFrame: 76,
            averagingSampleCount: 300,
            soundEnabled: true,
            outputType: 'speech',
            soundMode: 'threshold',
            masterVolume: 1,
            decimalPlaces: 1,
            levelSens: 45
        });
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
