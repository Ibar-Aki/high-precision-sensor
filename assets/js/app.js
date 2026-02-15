import { SensorEngine } from './modules/SensorEngine.js';
import { AudioEngine } from './modules/AudioEngine.js';
import { UIManager } from './modules/UIManager.js';
import { DataLogger } from './modules/DataLogger.js';
import { SettingsManager } from './modules/SettingsManager.js';
import { ToastManager } from './modules/ToastManager.js';
import { LifecycleManager } from './modules/LifecycleManager.js';
import { AppEventBinder } from './modules/AppEventBinder.js';

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

    const settingsResult = this.settingsManager.load();
    this.settings = settingsResult.value ?? {};
    if (!settingsResult.ok) {
      this._showStorageErrorToast('設定の読み込み', settingsResult.reason);
    }

    window.addEventListener('app:toast', this._toastEventHandler);

    this.eventBinder = new AppEventBinder({
      sensor: this.sensor,
      audio: this.audio,
      ui: this.ui,
      onStart: () => this.start(),
      onSaveSettings: () => this._saveSettings(),
      onToast: (message) => this._showToast(message),
      onStorageError: (operation, reason) => this._showStorageErrorToast(operation, reason)
    });
    this.eventBinder.bind();

    this.lifecycleManager = new LifecycleManager({
      onBeforeUnload: () => {
        this._saveSettings();
        this.destroy();
      },
      onHidden: () => {
        this._saveSettings();
      }
    });
    this.lifecycleManager.bind();

    // 初期設定適用（バインド後に行うことでスライダー等のUIにも反映）
    this._applySettings();
  }

  /* ---------- iOS権限 & 起動 ---------- */
  async start() {
    if (this.isRunning) {
      return true;
    }

    // iOS 13+ では DeviceOrientationEvent.requestPermission が必要
    if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') {
          alert('センサーへのアクセスが拒否されました。\n設定 > Safari > モーションと画面の向きのアクセス を許可してください。');
          return false;
        }
      } catch (e) {
        alert('センサー権限リクエストエラー: ' + e.message);
        return false;
      }
    }

    // DeviceOrientation が使えるか確認
    if (typeof DeviceOrientationEvent === 'undefined') {
      alert('このデバイス/ブラウザではDeviceOrientation APIがサポートされていません。');
      return false;
    }

    // Audio初期化（ユーザージェスチャー内で呼ぶ必要あり）
    this.audio.init();

    // センサーイベント登録
    window.addEventListener('deviceorientation', this._orientationHandler, true);

    // 画面切り替え
    document.getElementById('splash-screen').classList.remove('active');
    document.getElementById('main-screen').classList.add('active');

    this.isRunning = true;
    this._sensorLossNotified = false;
    this._lastSensorEventAt = performance.now();
    this.ui.setStatus('active', '計測中');
    this.ui.els.sensorInfo.textContent = 'センサー: DeviceOrientation API (100Hz フィルタ済み)';

    // 録画ボタン生成
    if (!document.getElementById('recording-controls')) {
      this.ui.createRecordingButton(
        () => {
          this.logger.start();
          this._showToast('REC Start');
        },
        () => {
          const filename = this.logger.exportCSV();
          this.logger.stop();
          if (filename) {
            this.ui.showDownloadButton(filename);
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

      // 角度表示更新
      this.ui.updateAngles(
        this.sensor.pitch,
        this.sensor.roll,
        this.sensor.getTotalAngle()
      );

      // 音声更新
      this.audio.update(this.sensor.pitch, this.sensor.roll);

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

  _handleSensorLoss() {
    if (this._sensorLossNotified) return;
    if (performance.now() - this._lastSensorEventAt < this._sensorLossDelayMs) return;

    this._sensorLossNotified = true;
    this.ui.setStatus('inactive', 'センサー信号待ち');
    this._showToast('センサーデータを受信できません');
  }

  _handleSensorRecovery() {
    if (!this._sensorLossNotified) return;

    this._sensorLossNotified = false;
    this.ui.setStatus('active', '計測中');
    this._showToast('センサーデータ受信を再開しました');
  }

  /* ---------- トースト通知 ---------- */
  _showToast(msg) {
    this.toastManager.show(msg);
  }

  _showStorageErrorToast(operation, reason) {
    this.toastManager.showStorageError(operation, reason);
  }

  /* ---------- 設定の永続化 ---------- */
  _saveSettings() {
    const s = {
      emaAlpha: this.sensor.emaAlpha,
      kalmanQ: this.sensor.kfPitch.q,
      kalmanR: this.sensor.kfPitch.r,
      deadzone: this.sensor.deadzone,
      soundEnabled: this.audio.enabled,
      soundMode: this.audio.mode,
      soundThreshold: this.audio.threshold,
      masterVolume: this.audio.masterVolume,
      decimalPlaces: this.ui.decimalPlaces,
      levelSens: this.ui.levelSensitivity,
    };
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

    if (s.emaAlpha !== undefined) {
      this.sensor.emaAlpha = s.emaAlpha;
      const el = document.getElementById('filter-alpha');
      if (el) el.value = s.emaAlpha;
      const val = document.getElementById('filter-alpha-val');
      if (val) val.textContent = s.emaAlpha.toFixed(2);
    }
    if (s.kalmanQ !== undefined) {
      const el = document.getElementById('kalman-q');
      if (el) el.value = s.kalmanQ;
      const val = document.getElementById('kalman-q-val');
      if (val) val.textContent = s.kalmanQ.toFixed(4);
    }
    if (s.kalmanR !== undefined) {
      const el = document.getElementById('kalman-r');
      if (el) el.value = s.kalmanR;
      const val = document.getElementById('kalman-r-val');
      if (val) val.textContent = s.kalmanR.toFixed(2);
    }
    if (s.kalmanQ !== undefined && s.kalmanR !== undefined) {
      this.sensor.setKalmanParams(s.kalmanQ, s.kalmanR);
    }
    if (s.deadzone !== undefined) {
      this.sensor.deadzone = s.deadzone;
      const el = document.getElementById('deadzone');
      if (el) el.value = s.deadzone;
      const val = document.getElementById('deadzone-val');
      if (val) val.textContent = s.deadzone.toFixed(3);
    }
    if (s.soundEnabled !== undefined) {
      this.audio.enabled = s.soundEnabled;
      document.getElementById('btn-sound-toggle')?.classList.toggle('active', s.soundEnabled);
    }
    if (s.soundMode !== undefined) {
      this.audio.mode = s.soundMode;
      document.querySelectorAll('[data-sound-mode]').forEach(b => {
        b.classList.toggle('active', b.dataset.soundMode === s.soundMode);
      });
      const thresholdSetting = document.getElementById('threshold-setting');
      if (thresholdSetting) {
        thresholdSetting.style.display = s.soundMode === 'threshold' ? 'block' : 'none';
      }
    }
    if (s.soundThreshold !== undefined) {
      this.audio.threshold = s.soundThreshold;
      const el = document.getElementById('sound-threshold');
      if (el) el.value = s.soundThreshold;
      const val = document.getElementById('sound-threshold-val');
      if (val) val.textContent = s.soundThreshold.toFixed(1);
    }
    if (s.masterVolume !== undefined) {
      this.audio.setMasterVolume(s.masterVolume);
      const el = document.getElementById('master-volume');
      if (el) el.value = s.masterVolume;
      const val = document.getElementById('master-volume-val');
      if (val) val.textContent = Math.round(s.masterVolume * 100) + '%';
    }
    if (s.decimalPlaces !== undefined) {
      this.ui.decimalPlaces = s.decimalPlaces;
      const el = document.getElementById('decimal-places');
      if (el) el.value = s.decimalPlaces;
      const val = document.getElementById('decimal-places-val');
      if (val) val.textContent = s.decimalPlaces;
    }
    if (s.levelSens !== undefined) {
      this.ui.levelSensitivity = s.levelSens;
      const el = document.getElementById('level-sensitivity');
      if (el) el.value = s.levelSens;
      const val = document.getElementById('level-sensitivity-val');
      if (val) val.textContent = s.levelSens;
    }
  }

  destroy() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    window.removeEventListener('deviceorientation', this._orientationHandler, true);
    window.removeEventListener('app:toast', this._toastEventHandler);
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
