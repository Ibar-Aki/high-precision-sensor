import { SensorEngine } from './modules/SensorEngine.js';
import { AudioEngine } from './modules/AudioEngine.js';
import { UIManager } from './modules/UIManager.js';
import { DataLogger } from './modules/DataLogger.js';
import { SettingsManager } from './modules/SettingsManager.js';
import { ToastManager } from './modules/ToastManager.js';
import { LifecycleManager } from './modules/LifecycleManager.js';
import { AppEventBinder } from './modules/AppEventBinder.js';
import { refreshSoundSettingsVisibility } from './modules/SoundSettingsVisibility.js';

const MODE_LABEL = {
  active: '計測中',
  locking: '安定化中',
  measuring: '確定値'
};
const SETTINGS_PROFILE_VERSION = 3;
const SETTINGS_PROFILE_FILTER_DEFAULTS = Object.freeze({
  emaAlpha: 0.06,
  kalmanQ: 0.0005,
  kalmanR: 0.18,
  staticVarianceThreshold: 0.0025,
  staticDurationFrame: 60,
  averagingSampleCount: 150,
  decimalPlaces: 2
});

function createSessionId(prefix = 'HS') {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const random = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0').toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

const SETTINGS_SAVE_SCHEMA = [
  { key: 'settingsVersion', read: () => SETTINGS_PROFILE_VERSION },
  { key: 'emaAlpha', read: (app) => app.sensor.emaAlpha },
  { key: 'kalmanQ', read: (app) => app.sensor.kfPitch.q },
  { key: 'kalmanR', read: (app) => app.sensor.kfPitch.r },
  { key: 'deadzone', read: (app) => app.sensor.deadzone },
  { key: 'staticVarianceThreshold', read: (app) => app.sensor.staticVarianceThreshold },
  { key: 'staticDurationFrame', read: (app) => app.sensor.staticDurationFrame },
  { key: 'averagingSampleCount', read: (app) => app.sensor.averagingSampleCount },
  { key: 'soundEnabled', read: (app) => app.audio.enabled },
  { key: 'outputType', read: (app) => app.audio.outputType },
  { key: 'soundMode', read: (app) => app.audio.mode },
  { key: 'soundThreshold', read: (app) => app.audio.threshold },
  { key: 'masterVolume', read: (app) => app.audio.masterVolume },
  { key: 'decimalPlaces', read: (app) => app.ui.decimalPlaces },
  { key: 'levelSens', read: (app) => app.ui.levelSensitivity },
];

const SETTINGS_APPLY_SCHEMA = [
  {
    key: 'emaAlpha',
    apply: (app, value) => {
      app.sensor.emaAlpha = value;
    },
    inputId: 'filter-alpha',
    valueId: 'filter-alpha-val',
    format: (value) => value.toFixed(2),
  },
  {
    key: 'kalmanQ',
    inputId: 'kalman-q',
    valueId: 'kalman-q-val',
    format: (value) => value.toFixed(4),
  },
  {
    key: 'kalmanR',
    inputId: 'kalman-r',
    valueId: 'kalman-r-val',
    format: (value) => value.toFixed(2),
  },
  {
    key: 'deadzone',
    apply: (app, value) => {
      app.sensor.deadzone = value;
    },
    inputId: 'deadzone',
    valueId: 'deadzone-val',
    format: (value) => value.toFixed(3),
  },
  {
    key: 'staticVarianceThreshold',
    apply: (app, value) => {
      app.sensor.staticVarianceThreshold = value;
    },
    inputId: 'static-variance-threshold',
    valueId: 'static-variance-threshold-val',
    format: (value) => Number(value).toFixed(4),
  },
  {
    key: 'staticDurationFrame',
    normalize: (value) => Math.max(1, Math.round(value)),
    apply: (app, value) => {
      app.sensor.staticDurationFrame = value;
    },
    inputId: 'static-duration-frame',
    valueId: 'static-duration-frame-val',
  },
  {
    key: 'averagingSampleCount',
    normalize: (value) => Math.max(1, Math.round(value)),
    apply: (app, value) => {
      app.sensor.averagingSampleCount = value;
    },
    inputId: 'averaging-sample-count',
    valueId: 'averaging-sample-count-val',
  },
  {
    key: 'soundEnabled',
    apply: (app, value) => {
      app.audio.enabled = value;
      document.getElementById('btn-sound-toggle')?.classList.toggle('active', value);
    },
  },
  {
    key: 'soundThreshold',
    apply: (app, value) => {
      app.audio.threshold = value;
    },
    inputId: 'sound-threshold',
    valueId: 'sound-threshold-val',
    format: (value) => value.toFixed(1),
  },
  {
    key: 'masterVolume',
    apply: (app, value) => {
      app.audio.setMasterVolume(value);
    },
    inputId: 'master-volume',
    valueId: 'master-volume-val',
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'decimalPlaces',
    apply: (app, value) => {
      app.ui.decimalPlaces = value;
    },
    inputId: 'decimal-places',
    valueId: 'decimal-places-val',
  },
  {
    key: 'levelSens',
    apply: (app, value) => {
      app.ui.levelSensitivity = value;
    },
    inputId: 'level-sensitivity',
    valueId: 'level-sensitivity-val',
  },
];

/**
 * メインアプリケーション
 * 各モジュールの統合とイベントハンドリング
 */
class App {
  constructor() {
    this.sensor = new SensorEngine();
    this.audio = new AudioEngine();
    this.ui = new UIManager();
    this.logger = new DataLogger();
    this.settingsManager = new SettingsManager();
    this.toastManager = new ToastManager();

    this.isRunning = false;
    this._starting = false;
    this.animFrameId = null;
    this._orientationHandler = (e) => this._onOrientation(e);
    this._toastEventHandler = (event) => {
      const message = event?.detail?.message;
      if (message) this._showToast(message);
    };

    this._sensorLossDelayMs = 1000;
    this._lastSensorEventAt = 0;
    this._sensorLossNotified = false;

    this._lastSettingsErrorToastAt = -Infinity;
    this._settingsErrorToastIntervalMs = 3000;
    this._saveSettingsTimerId = null;
    this._saveSettingsDebounceMs = 200;
    this._lastStatusCode = 'INIT';
    this._lastMeasurementMode = null;
    this._sessionId = createSessionId();
    this._permissionHelpOpenHandler = () => this._openPermissionHelp('PERMISSION_HELP_MANUAL');
    this._permissionHelpCloseHandler = () => this._closePermissionHelp();

    const settingsResult = this.settingsManager.load();
    this.settings = settingsResult.value ?? {};
    const migration = this._migrateSettingsToLatest(this.settings);
    this.settings = migration.settings;
    if (!settingsResult.ok) {
      this._showStorageErrorToast('設定の読み込み', settingsResult.reason);
    }
    const canPersistMigration = settingsResult.ok || settingsResult.reason === 'invalid_settings';
    if (migration.changed && canPersistMigration) {
      const migrationSaveResult = this.settingsManager.save(this.settings);
      if (!migrationSaveResult.ok) {
        this._showStorageErrorToast('設定マイグレーション', migrationSaveResult.reason);
      }
    }

    window.addEventListener('app:toast', this._toastEventHandler);

    this.eventBinder = new AppEventBinder({
      sensor: this.sensor,
      audio: this.audio,
      ui: this.ui,
      onStart: () => this.start(),
      onSaveSettings: () => this._requestSaveSettings(),
      onToast: (message) => this._showToast(message),
      onStorageError: (operation, reason) => this._showStorageErrorToast(operation, reason),
      onStatusCode: (code) => this._setStatusCode(code)
    });
    this.eventBinder.bind();

    this.lifecycleManager = new LifecycleManager({
      onBeforeUnload: () => {
        this._saveSettingsImmediate();
        this.destroy();
      },
      onHidden: () => {
        this._saveSettingsImmediate();
      }
    });
    this.lifecycleManager.bind();

    // 初期設定適用（バインド後に行うことでスライダー等のUIにも反映）
    this._applySettings();
    this._bindPermissionHelp();
    this.ui.setSessionId(this._sessionId);
    this._setStatusCode('INIT');
    this._registerServiceWorker();
  }

  /* ---------- iOS権限 & 起動 ---------- */
  async start() {
    if (this.isRunning) {
      return true;
    }
    if (this._starting) {
      return false;
    }
    this._starting = true;

    try {

      // iOS 13+ では DeviceOrientationEvent.requestPermission が必要
      if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const perm = await DeviceOrientationEvent.requestPermission();
          if (perm !== 'granted') {
            this._showToast('センサーへのアクセスが拒否されました。Safari設定の「モーションと画面の向きのアクセス」を許可してください。');
            this._setStatusCode('PERMISSION_DENIED');
            this._openPermissionHelp('PERMISSION_DENIED');
            return false;
          }
        } catch (e) {
          this._showToast(`センサー権限リクエストエラー: ${e?.message ?? 'unknown_error'}`);
          this._setStatusCode('PERMISSION_REQUEST_ERROR');
          this._openPermissionHelp('PERMISSION_REQUEST_ERROR');
          return false;
        }
      }

      // DeviceOrientation が使えるか確認
      if (typeof DeviceOrientationEvent === 'undefined') {
        this._showToast('このデバイス/ブラウザではDeviceOrientation APIがサポートされていません。');
        this._setStatusCode('SENSOR_UNSUPPORTED');
        this._openPermissionHelp('SENSOR_UNSUPPORTED');
        return false;
      }

      // Audio初期化（ユーザージェスチャー内で呼ぶ必要あり）
      this.audio.init();

      // センサーイベント登録
      window.addEventListener('deviceorientation', this._orientationHandler, true);

      // 画面切り替え
      this._closePermissionHelp();
      document.getElementById('splash-screen').classList.remove('active');
      document.getElementById('main-screen').classList.add('active');

      this.isRunning = true;
      this._sensorLossNotified = false;
      this._lastSensorEventAt = performance.now();
      this.ui.setStatus('active', MODE_LABEL.active);
      this.ui.els.sensorInfo.textContent = 'センサー: DeviceOrientation API (100Hz フィルタ済み)';
      this._setStatusCode('MEASUREMENT_ACTIVE');

      // 録画ボタン生成
      if (!document.getElementById('recording-controls')) {
        this.ui.createRecordingButton(
          () => {
            this.logger.start();
            this._showToast('REC Start');
          },
          () => {
            const exportResult = this.logger.exportCSV();
            this.logger.stop();
            if (!exportResult.ok) {
              if (exportResult.reason === 'no_data') {
                this._showToast('エクスポートするデータがありません');
              } else {
                this._showToast('CSVエクスポートに失敗しました');
              }
            } else {
              this.ui.showDownloadButton(exportResult.filename);
              this._showToast('CSV Saved');
            }
            const stats = this.logger.getStats();
            if (stats.dropped > 0) {
              this._showToast(`ログ上限到達: ${stats.dropped.toLocaleString()}件を削除しました`);
            }
          }
        );
      }

      // 描画ループ
      this._startRenderLoop();

      return true;
    } finally {
      this._starting = false;
    }
  }

  _onOrientation(e) {
    if (!this.isRunning) return;

    const beta = e.beta;  // ピッチ（前後: -180 〜 180）
    const gamma = e.gamma; // ロール（左右: -90 〜 90）

    if (beta === null || gamma === null || !Number.isFinite(beta) || !Number.isFinite(gamma)) {
      this._handleSensorLoss();
      return;
    }

    this._lastSensorEventAt = performance.now();
    this._handleSensorRecovery();

    const processed = this.sensor.process(beta, gamma);
    if (!processed) {
      return;
    }
  }

  _startRenderLoop() {
    let lastStatsUpdate = 0;

    const loop = (timestamp) => {
      if (!this.isRunning) return;

      if (timestamp - this._lastSensorEventAt > this._sensorLossDelayMs) {
        this._handleSensorLoss();
      }

      // データのロギング（録画中のみ）
      if (this.logger.isRecording) {
        this.logger.log(this.sensor.pitch, this.sensor.roll);
      }

      if (!this._sensorLossNotified) {
        this._updateMeasurementStatus();
      }

      const displayDp = Number.isFinite(this.ui.decimalPlaces) ? this.ui.decimalPlaces : 2;
      const live = this.sensor.getLiveAngles?.() ?? { pitch: this.sensor.pitch, roll: this.sensor.roll };
      const final = this.sensor.getFinalAngles?.() ?? { available: false, pitch: null, roll: null };
      const liveTotal = Math.sqrt(live.pitch * live.pitch + live.roll * live.roll);
      const finalTotal = final.available
        ? Math.sqrt(final.pitch * final.pitch + final.roll * final.roll)
        : null;

      // 角度表示更新
      this.ui.updateAngles({
        livePitch: live.pitch,
        liveRoll: live.roll,
        liveTotal,
        finalPitch: final.pitch,
        finalRoll: final.roll,
        finalTotal,
        hasFinal: Boolean(final.available)
      }, displayDp);

      // 音声更新
      this.audio.update(live.pitch, live.roll);

      // 統計は200ms毎
      if (timestamp - lastStatsUpdate > 200) {
        this.ui.updateStats(
          this.sensor.maxPitch,
          this.sensor.maxRoll,
          this.sensor.sampleCount
        );
        lastStatsUpdate = timestamp;
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  _updateMeasurementStatus() {
    const mode = this.sensor.getMeasurementMode?.() ?? 'active';
    const modeChanged = this._lastMeasurementMode !== mode;
    this._lastMeasurementMode = mode;
    if (mode === 'measuring') {
      this.ui.setStatus('active', MODE_LABEL.measuring);
      if (modeChanged) this._setStatusCode('MEASUREMENT_STABLE');
      return;
    }
    if (mode === 'locking') {
      this.ui.setStatus('inactive', MODE_LABEL.locking);
      if (modeChanged) this._setStatusCode('MEASUREMENT_STABILIZING');
      return;
    }
    this.ui.setStatus('active', MODE_LABEL.active);
    if (modeChanged) this._setStatusCode('MEASUREMENT_ACTIVE');
  }

  _handleSensorLoss() {
    if (this._sensorLossNotified) return;
    if (performance.now() - this._lastSensorEventAt < this._sensorLossDelayMs) return;

    this._sensorLossNotified = true;
    this.ui.setStatus('inactive', 'センサー信号待ち');
    this._showToast('センサーデータを受信できません');
    this._setStatusCode('SENSOR_SIGNAL_LOST');
  }

  _handleSensorRecovery() {
    if (!this._sensorLossNotified) return;

    this._sensorLossNotified = false;
    this.ui.setStatus('active', MODE_LABEL.active);
    this._showToast('センサーデータ受信を再開しました');
    this._setStatusCode('SENSOR_SIGNAL_RECOVERED');
  }

  /* ---------- トースト通知 ---------- */
  _showToast(msg) {
    this.toastManager.show(msg);
  }

  _showStorageErrorToast(operation, reason) {
    this.toastManager.showStorageError(operation, reason);
    this._setStatusCode(`STORAGE_ERROR_${String(reason ?? 'unknown').toUpperCase()}`);
  }

  _bindPermissionHelp() {
    document.getElementById('btn-open-permission-help')?.addEventListener('click', this._permissionHelpOpenHandler);
    document.getElementById('btn-close-permission-help')?.addEventListener('click', this._permissionHelpCloseHandler);
  }

  _openPermissionHelp(reasonCode) {
    const screen = document.getElementById('permission-help-screen');
    if (!screen) return;
    const reason = document.getElementById('permission-help-reason');
    if (reason) reason.textContent = `状態コード: ${reasonCode}`;
    this._setStatusCode(reasonCode);
    screen.classList.add('active');
    screen.setAttribute('aria-hidden', 'false');
  }

  _closePermissionHelp() {
    const screen = document.getElementById('permission-help-screen');
    if (!screen) return;
    screen.classList.remove('active');
    screen.setAttribute('aria-hidden', 'true');
  }

  _setStatusCode(code) {
    if (!code || code === this._lastStatusCode) return;
    this._lastStatusCode = code;
    this.ui.setStatusCode(code);
  }

  /* ---------- 設定の永続化 ---------- */
  _requestSaveSettings() {
    if (this._saveSettingsTimerId !== null) {
      clearTimeout(this._saveSettingsTimerId);
    }
    this._saveSettingsTimerId = window.setTimeout(() => {
      this._saveSettingsTimerId = null;
      this._saveSettingsNow();
    }, this._saveSettingsDebounceMs);
  }

  _saveSettingsImmediate() {
    this._clearPendingSettingsSave();
    this._saveSettingsNow();
  }

  _clearPendingSettingsSave() {
    if (this._saveSettingsTimerId !== null) {
      clearTimeout(this._saveSettingsTimerId);
      this._saveSettingsTimerId = null;
    }
  }

  _saveSettingsNow() {
    const s = {};
    for (const entry of SETTINGS_SAVE_SCHEMA) {
      s[entry.key] = entry.read(this);
    }
    const result = this.settingsManager.save(s);
    if (!result.ok) {
      const now = performance.now();
      if (now - this._lastSettingsErrorToastAt > this._settingsErrorToastIntervalMs) {
        this._lastSettingsErrorToastAt = now;
        this._showStorageErrorToast('設定の保存', result.reason);
      }
    }
  }

  _applySettings() {
    const s = this.settings;
    if (!s || Object.keys(s).length === 0) return;

    this._applySettingSchema(s, SETTINGS_APPLY_SCHEMA);

    if (s.kalmanQ !== undefined && s.kalmanR !== undefined) {
      this.sensor.setKalmanParams(s.kalmanQ, s.kalmanR);
    }

    const outputType = s.outputType ?? 'normal';
    this.audio.setOutputType(outputType);
    document.querySelectorAll('[data-output-type]').forEach(b => {
      b.classList.toggle('active', b.dataset.outputType === outputType);
    });

    if (s.soundMode !== undefined) {
      this.audio.setMode(s.soundMode);
    }
    document.querySelectorAll('[data-sound-mode]').forEach(b => {
      b.classList.toggle('active', b.dataset.soundMode === this.audio.mode);
    });
    this._refreshSoundSettingsVisibility();
  }

  _applySettingSchema(settings, schema) {
    for (const entry of schema) {
      if (settings[entry.key] === undefined) continue;

      const normalized = entry.normalize ? entry.normalize(settings[entry.key]) : settings[entry.key];
      entry.apply?.(this, normalized, settings);

      if (entry.inputId) {
        const input = document.getElementById(entry.inputId);
        if (input) input.value = String(normalized);
      }
      if (entry.valueId) {
        const valueEl = document.getElementById(entry.valueId);
        if (valueEl) {
          valueEl.textContent = entry.format ? entry.format(normalized, this) : String(normalized);
        }
      }
    }
  }

  _refreshSoundSettingsVisibility() {
    refreshSoundSettingsVisibility(this.audio);
  }

  _migrateSettingsToLatest(loadedSettings) {
    const source = (loadedSettings && typeof loadedSettings === 'object')
      ? { ...loadedSettings }
      : {};
    const version = Number.isFinite(source.settingsVersion)
      ? Math.max(0, Math.round(source.settingsVersion))
      : 0;

    if (version >= SETTINGS_PROFILE_VERSION) {
      return { changed: false, settings: source };
    }

    for (const [key, value] of Object.entries(SETTINGS_PROFILE_FILTER_DEFAULTS)) {
      source[key] = value;
    }
    source.settingsVersion = SETTINGS_PROFILE_VERSION;
    return { changed: true, settings: source };
  }

  async _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch {
      // service worker登録失敗時は無視して継続
    }
  }

  destroy() {
    this.isRunning = false;
    this._starting = false;
    this._clearPendingSettingsSave();
    this.sensor.cancelTwoPointCalibration?.();
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    window.removeEventListener('deviceorientation', this._orientationHandler, true);
    window.removeEventListener('app:toast', this._toastEventHandler);
    document.getElementById('btn-open-permission-help')?.removeEventListener('click', this._permissionHelpOpenHandler);
    document.getElementById('btn-close-permission-help')?.removeEventListener('click', this._permissionHelpCloseHandler);
    this.eventBinder?.destroy();
    this.lifecycleManager?.destroy();
    this.audio.destroy?.();
    this.toastManager.destroy();
  }
}

// アプリケーション起動
// DOMが読み込まれてから実行
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
