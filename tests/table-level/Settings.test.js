import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TableLevelSettingsManager, DEFAULT_SETTINGS } from '../../table-level/assets/js/settings.js';

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock, configurable: true });

describe('table-level/settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('未保存時はデフォルト値を返すこと', () => {
    const manager = new TableLevelSettingsManager();
    const loaded = manager.load();
    expect(loaded.ok).toBe(true);
    expect(loaded.value.tableWidth).toBe(DEFAULT_SETTINGS.tableWidth);
  });

  it('範囲外の値がサニタイズされること', () => {
    localStorage.setItem('tableLevelGuide_v1_1', JSON.stringify({
      tableWidth: 100,
      tableDepth: 99999,
      boltCustomPitch: 10,
      language: 'xx',
      adjustMode: 'bad'
    }));

    const manager = new TableLevelSettingsManager();
    const loaded = manager.load();
    expect(loaded.value.tableWidth).toBe(300);
    expect(loaded.value.tableDepth).toBe(3000);
    expect(loaded.value.boltCustomPitch).toBe(5);
    expect(loaded.value.language).toBe('ja');
    expect(loaded.value.adjustMode).toBe('bidirectional');
  });

  it('保存失敗時に理由コードを返すこと', () => {
    const manager = new TableLevelSettingsManager();
    const err = new Error('full');
    err.name = 'QuotaExceededError';
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw err;
    });

    const result = manager.save(DEFAULT_SETTINGS);
    expect(result).toEqual({ ok: false, reason: 'quota_exceeded' });
    spy.mockRestore();
  });

  it('旧バージョン設定をロードした場合に migration 情報を返すこと', () => {
    localStorage.setItem('tableLevelGuide_v1_1', JSON.stringify({
      settingsVersion: 1,
      filterAlpha: 0.2,
      kalmanQ: 0.02,
      kalmanR: 0.5,
      staticVarianceThreshold: 0.01,
      staticDurationFrames: 90,
      averagingSampleCount: 120,
      measurementTimeoutSec: 90
    }));

    const manager = new TableLevelSettingsManager();
    const loaded = manager.load();

    expect(loaded.ok).toBe(true);
    expect(loaded.migrated).toBe(true);
    expect(loaded.value.settingsVersion).toBe(2);
    expect(loaded.value.filterAlpha).toBe(0.06);
    expect(loaded.value.kalmanQ).toBe(0.0005);
    expect(loaded.value.kalmanR).toBe(0.18);
    expect(loaded.value.staticVarianceThreshold).toBe(0.004);
    expect(loaded.value.staticDurationFrames).toBe(16);
    expect(loaded.value.averagingSampleCount).toBe(24);
    expect(loaded.value.measurementTimeoutSec).toBe(20);
  });
});
