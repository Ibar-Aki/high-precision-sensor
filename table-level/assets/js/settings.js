const SETTINGS_KEY = 'tableLevelGuide_v1_1';
const SETTINGS_VERSION = 3;
const MIGRATION_FILTER_DEFAULTS = Object.freeze({
  filterAlpha: 0.06,
  kalmanQ: 0.0005,
  kalmanR: 0.18,
  staticVarianceThreshold: 0.0025,
  staticDurationFrames: 60,
  averagingSampleCount: 150,
  measurementTimeoutSec: 20
});

export const DEFAULT_SETTINGS = Object.freeze({
  settingsVersion: SETTINGS_VERSION,
  tableWidth: 800,
  tableDepth: 1200,
  boltType: 'M8',
  boltCustomPitch: null,
  phonePitchAxis: 'depth',
  invertPitch: false,
  invertRoll: false,
  adjustMode: 'bidirectional',
  levelThreshold: 0.5,
  language: 'ja',
  voiceEnabled: true,
  volume: 0.8,
  filterAlpha: 0.06,
  kalmanQ: 0.0005,
  kalmanR: 0.18,
  staticVarianceThreshold: 0.0025,
  staticDurationFrames: 60,
  averagingSampleCount: 150,
  measurementTimeoutSec: 20,
  maxTurnsWarning: 5,
  minTurnsToShow: 0.25
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export class TableLevelSettingsManager {
  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(SETTINGS_KEY);
    } catch (error) {
      return { ok: false, reason: this._storageErrorReason(error), value: { ...DEFAULT_SETTINGS }, migrated: false };
    }

    if (!raw) {
      return { ok: true, value: { ...DEFAULT_SETTINGS }, migrated: false };
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'invalid_settings', value: { ...DEFAULT_SETTINGS }, migrated: false };
    }

    const sanitized = this._sanitize(parsed, { applyMigration: true, withMeta: true });
    return { ok: true, value: sanitized.settings, migrated: sanitized.migrated };
  }

  save(settings) {
    const sanitized = this._sanitize(settings ?? {}, { applyMigration: false });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitized));
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

  _sanitize(raw, options = {}) {
    const applyMigration = options.applyMigration !== false;
    const withMeta = options.withMeta === true;
    const source = raw && typeof raw === 'object' ? raw : {};
    const rawVersion = Math.round(clamp(toNumber(source.settingsVersion) ?? 0, 0, 99));
    const merged = { ...DEFAULT_SETTINGS, ...source };
    const migrated = applyMigration && rawVersion < SETTINGS_VERSION;
    if (migrated) {
      for (const [key, value] of Object.entries(MIGRATION_FILTER_DEFAULTS)) {
        merged[key] = value;
      }
    }
    merged.settingsVersion = SETTINGS_VERSION;

    const boltTypes = ['M6', 'M8', 'M10', 'M12', 'custom'];
    const languages = ['ja', 'en'];
    const pitchAxis = ['depth', 'width'];
    const adjustModes = ['bidirectional', 'cw_only'];

    const settings = {
      settingsVersion: SETTINGS_VERSION,
      tableWidth: clamp(toNumber(merged.tableWidth) ?? DEFAULT_SETTINGS.tableWidth, 300, 3000),
      tableDepth: clamp(toNumber(merged.tableDepth) ?? DEFAULT_SETTINGS.tableDepth, 300, 3000),
      boltType: boltTypes.includes(merged.boltType) ? merged.boltType : DEFAULT_SETTINGS.boltType,
      boltCustomPitch: merged.boltCustomPitch == null
        ? null
        : clamp(toNumber(merged.boltCustomPitch) ?? DEFAULT_SETTINGS.boltCustomPitch ?? 1.25, 0.1, 5),
      phonePitchAxis: pitchAxis.includes(merged.phonePitchAxis) ? merged.phonePitchAxis : DEFAULT_SETTINGS.phonePitchAxis,
      invertPitch: Boolean(merged.invertPitch),
      invertRoll: Boolean(merged.invertRoll),
      adjustMode: adjustModes.includes(merged.adjustMode) ? merged.adjustMode : DEFAULT_SETTINGS.adjustMode,
      levelThreshold: clamp(toNumber(merged.levelThreshold) ?? DEFAULT_SETTINGS.levelThreshold, 0.1, 3),
      language: languages.includes(merged.language) ? merged.language : DEFAULT_SETTINGS.language,
      voiceEnabled: Boolean(merged.voiceEnabled),
      volume: clamp(toNumber(merged.volume) ?? DEFAULT_SETTINGS.volume, 0, 1),
      filterAlpha: clamp(toNumber(merged.filterAlpha) ?? DEFAULT_SETTINGS.filterAlpha, 0.01, 0.5),
      kalmanQ: clamp(toNumber(merged.kalmanQ) ?? DEFAULT_SETTINGS.kalmanQ, 0.0001, 0.1),
      kalmanR: clamp(toNumber(merged.kalmanR) ?? DEFAULT_SETTINGS.kalmanR, 0.01, 1),
      staticVarianceThreshold: clamp(
        toNumber(merged.staticVarianceThreshold) ?? DEFAULT_SETTINGS.staticVarianceThreshold,
        0.0001,
        0.05
      ),
      staticDurationFrames: Math.round(clamp(
        toNumber(merged.staticDurationFrames) ?? DEFAULT_SETTINGS.staticDurationFrames,
        5,
        240
      )),
      averagingSampleCount: Math.round(clamp(
        toNumber(merged.averagingSampleCount) ?? DEFAULT_SETTINGS.averagingSampleCount,
        5,
        300
      )),
      measurementTimeoutSec: Math.round(clamp(
        toNumber(merged.measurementTimeoutSec) ?? DEFAULT_SETTINGS.measurementTimeoutSec,
        5,
        120
      )),
      maxTurnsWarning: clamp(toNumber(merged.maxTurnsWarning) ?? DEFAULT_SETTINGS.maxTurnsWarning, 1, 20),
      minTurnsToShow: clamp(toNumber(merged.minTurnsToShow) ?? DEFAULT_SETTINGS.minTurnsToShow, 0, 1)
    };
    if (withMeta) {
      return { settings, migrated };
    }
    return settings;
  }
}

export const TableLevelSettings = {
  key: SETTINGS_KEY
};
