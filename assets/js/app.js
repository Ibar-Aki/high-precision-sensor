import { SensorEngine } from './modules/SensorEngine.js';
import { AudioEngine } from './modules/AudioEngine.js';
import { UIManager } from './modules/UIManager.js';
import { DataLogger } from './modules/DataLogger.js';

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

    this.isRunning = false;
    this.animFrameId = null;
    this._orientationHandler = (e) => this._onOrientation(e);

    // 設定
    this.settings = this._loadSettings();

    // イベントバインド
    this._bindEvents();

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
    this.ui.setStatus('active', '計測中');
    this.ui.els.sensorInfo.textContent = 'センサー: DeviceOrientation API (100Hz フィルタ済み)';

    // 録画ボタン生成
    if (!document.getElementById('recording-controls')) {
      this.ui.createRecordingButton(
        () => {
          this.logger.start();
          this._showToast("REC Start");
        },
        () => {
          const filename = this.logger.exportCSV();
          this.logger.stop();
          this.ui.showDownloadButton(filename);
          this._showToast("CSV Saved");
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

    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;

    this.sensor.process(beta, gamma);
  }

  _startRenderLoop() {
    let lastStatsUpdate = 0;

    const loop = (timestamp) => {
      // データのロギング（録画中のみ）
      this.logger.log(this.sensor.pitch, this.sensor.roll);

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

  /* ---------- イベントバインド ---------- */
  _bindEvents() {
    // スタートボタン
    const btnStart = document.getElementById('btn-start');
    if (btnStart) btnStart.addEventListener('click', () => this.start());

    // サウンドトグル
    const btnSoundToggle = document.getElementById('btn-sound-toggle');
    if (btnSoundToggle) {
      btnSoundToggle.addEventListener('click', (e) => {
        const on = this.audio.toggle();
        e.currentTarget.classList.toggle('active', on);
        this._saveSettings();
      });
    }

    // 設定パネル開閉
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      document.getElementById('settings-panel').classList.add('open');
    });
    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      document.getElementById('settings-panel').classList.remove('open');
    });
    document.getElementById('settings-overlay')?.addEventListener('click', () => {
      document.getElementById('settings-panel').classList.remove('open');
    });

    // キャリブレーション
    document.getElementById('btn-calibrate')?.addEventListener('click', () => {
      this.sensor.calibrate();
      document.querySelector('.measurement-area').classList.add('calibrated');
      setTimeout(() => {
        document.querySelector('.measurement-area').classList.remove('calibrated');
      }, 600);
      this._showToast('キャリブレーション完了');
    });

    // 統計リセット
    document.getElementById('btn-reset-stats')?.addEventListener('click', () => {
      this.sensor.resetStats();
      this._showToast('統計リセット');
    });

    // 値ロック
    document.getElementById('btn-lock')?.addEventListener('click', (e) => {
      this.sensor.locked = !this.sensor.locked;
      e.currentTarget.classList.toggle('active', this.sensor.locked);
      document.querySelector('.measurement-area').classList.toggle('locked', this.sensor.locked);

      const svg = e.currentTarget.querySelector('.btn-svg');
      if (svg) svg.style.fill = this.sensor.locked ? 'var(--accent-cyan)' : '';

      this._showToast(this.sensor.locked ? '値ロック中' : 'ロック解除');
    });

    // スライダー群
    this._bindSlider('filter-alpha', (v) => {
      this.sensor.emaAlpha = v;
      document.getElementById('filter-alpha-val').textContent = v.toFixed(2);
    });
    this._bindSlider('kalman-q', (v) => {
      this.sensor.setKalmanParams(v, this.sensor.kfPitch.r);
      document.getElementById('kalman-q-val').textContent = v.toFixed(4);
    });
    this._bindSlider('kalman-r', (v) => {
      this.sensor.setKalmanParams(this.sensor.kfPitch.q, v);
      document.getElementById('kalman-r-val').textContent = v.toFixed(2);
    });
    this._bindSlider('deadzone', (v) => {
      this.sensor.deadzone = v;
      document.getElementById('deadzone-val').textContent = v.toFixed(3);
    });
    this._bindSlider('sound-threshold', (v) => {
      this.audio.threshold = v;
      document.getElementById('sound-threshold-val').textContent = v.toFixed(1);
    });
    this._bindSlider('master-volume', (v) => {
      this.audio.setMasterVolume(v);
      document.getElementById('master-volume-val').textContent = Math.round(v * 100) + '%';
    });
    this._bindSlider('decimal-places', (v) => {
      this.ui.decimalPlaces = Math.round(v);
      document.getElementById('decimal-places-val').textContent = Math.round(v);
    });
    this._bindSlider('level-sensitivity', (v) => {
      this.ui.levelSensitivity = v;
      document.getElementById('level-sensitivity-val').textContent = Math.round(v);
    });

    // 音声モード切替
    document.querySelectorAll('[data-sound-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-sound-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.soundMode;
        this.audio.setMode(mode);
        const thresholdSetting = document.getElementById('threshold-setting');
        if (thresholdSetting) {
          thresholdSetting.style.display = mode === 'threshold' ? 'block' : 'none';
        }
        this._saveSettings();
      });
    });

    // ページ離脱前に設定保存
    window.addEventListener('beforeunload', () => this._saveSettings());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._saveSettings();
    });
  }

  _bindSlider(id, callback) {
    const el = document.getElementById(id);
    if (!el) return;
    const handler = () => {
      callback(parseFloat(el.value));
      this._saveSettings();
    };
    el.addEventListener('input', handler);
  }

  /* ---------- トースト通知 ---------- */
  _showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.style.cssText = `
        position: fixed; bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
        left: 50%; transform: translateX(-50%) translateY(20px);
        padding: 0.6rem 1.2rem; border-radius: 12px;
        background: rgba(0,212,255,0.15); border: 1px solid rgba(0,212,255,0.3);
        color: #00d4ff; font-size: 0.8rem; font-weight: 600;
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        opacity: 0; transition: opacity 0.3s, transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
        z-index: 200; pointer-events: none;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 1500);
  }

  /* ---------- 設定の永続化 ---------- */
  _loadSettings() {
    try {
      const data = localStorage.getItem('tilt-sensor-settings');
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

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
    try {
      localStorage.setItem('tilt-sensor-settings', JSON.stringify(s));
    } catch { /* ignore */ }
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
      this.audio.masterVolume = s.masterVolume;
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
}

// アプリケーション起動
// DOMが読み込まれてから実行
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
