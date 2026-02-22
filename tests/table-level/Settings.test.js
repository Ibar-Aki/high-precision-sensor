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
});
