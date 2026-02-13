/**
 * 高精度傾斜角センサー PWA
 * ============================
 * - 1D カルマンフィルタ × 2軸
 * - 指数移動平均 (EMA)
 * - Web Audio API 方向音声フィードバック
 * - iOS DeviceOrientation 権限管理
 */

'use strict';

/* ========================================
   1D カルマンフィルタ
   ======================================== */
class KalmanFilter1D {
  constructor(q = 0.001, r = 0.1) {
    this.q = q; // プロセスノイズ
    this.r = r; // 観測ノイズ
    this.x = 0; // 推定値
    this.p = 1; // 推定誤差共分散
    this.k = 0; // カルマンゲイン
    this.initialized = false;
  }

  update(measurement) {
    if (!this.initialized) {
      this.x = measurement;
      this.initialized = true;
      return this.x;
    }
    // 予測ステップ
    this.p += this.q;
    // 更新ステップ
    this.k = this.p / (this.p + this.r);
    this.x += this.k * (measurement - this.x);
    this.p *= (1 - this.k);
    return this.x;
  }

  reset() {
    this.x = 0;
    this.p = 1;
    this.k = 0;
    this.initialized = false;
  }

  setParams(q, r) {
    this.q = q;
    this.r = r;
  }
}

/* ========================================
   センサーエンジン
   ======================================== */
class SensorEngine {
  constructor() {
    // カルマンフィルタ（ピッチ / ロール各1D）
    this.kfPitch = new KalmanFilter1D(0.001, 0.1);
    this.kfRoll  = new KalmanFilter1D(0.001, 0.1);

    // EMA
    this.emaAlpha = 0.08;
    this.emaPitch = 0;
    this.emaRoll  = 0;
    this.emaInitialized = false;

    // キャリブレーション
    this.calibPitch = 0;
    this.calibRoll  = 0;

    // デッドゾーン
    this.deadzone = 0.005;

    // 出力値
    this.pitch = 0;
    this.roll = 0;
    this.rawPitch = 0;
    this.rawRoll = 0;

    // 統計
    this.maxPitch = 0;
    this.maxRoll = 0;
    this.sampleCount = 0;

    // 前回値（デッドゾーン用）
    this._prevPitch = 0;
    this._prevRoll = 0;

    // ロック
    this.locked = false;
  }

  process(beta, gamma) {
    if (this.locked) return;

    this.rawPitch = beta;
    this.rawRoll = gamma;
    this.sampleCount++;

    // キャリブレーション補正
    let correctedPitch = beta - this.calibPitch;
    let correctedRoll  = gamma - this.calibRoll;

    // カルマンフィルタ適用
    let kfP = this.kfPitch.update(correctedPitch);
    let kfR = this.kfRoll.update(correctedRoll);

    // EMA 適用
    if (!this.emaInitialized) {
      this.emaPitch = kfP;
      this.emaRoll  = kfR;
      this.emaInitialized = true;
    } else {
      this.emaPitch = this.emaAlpha * kfP + (1 - this.emaAlpha) * this.emaPitch;
      this.emaRoll  = this.emaAlpha * kfR + (1 - this.emaAlpha) * this.emaRoll;
    }

    // デッドゾーン
    let newPitch = this.emaPitch;
    let newRoll  = this.emaRoll;

    if (Math.abs(newPitch - this._prevPitch) < this.deadzone) {
      newPitch = this._prevPitch;
    }
    if (Math.abs(newRoll - this._prevRoll) < this.deadzone) {
      newRoll = this._prevRoll;
    }

    this._prevPitch = newPitch;
    this._prevRoll  = newRoll;

    this.pitch = newPitch;
    this.roll  = newRoll;

    // 統計更新
    if (Math.abs(this.pitch) > Math.abs(this.maxPitch)) this.maxPitch = this.pitch;
    if (Math.abs(this.roll)  > Math.abs(this.maxRoll))  this.maxRoll  = this.roll;
  }

  calibrate() {
    this.calibPitch += this.pitch;
    this.calibRoll  += this.roll;
    // フィルタリセット
    this.kfPitch.reset();
    this.kfRoll.reset();
    this.emaInitialized = false;
    this.pitch = 0;
    this.roll = 0;
    this._prevPitch = 0;
    this._prevRoll = 0;
  }

  resetStats() {
    this.maxPitch = 0;
    this.maxRoll  = 0;
    this.sampleCount = 0;
  }

  setKalmanParams(q, r) {
    this.kfPitch.setParams(q, r);
    this.kfRoll.setParams(q, r);
  }

  getTotalAngle() {
    return Math.sqrt(this.pitch * this.pitch + this.roll * this.roll);
  }
}

/* ========================================
   音声エンジン (Web Audio API)
   ======================================== */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.mode = 'continuous'; // 'continuous' | 'threshold'
    this.threshold = 1.0;
    this.masterVolume = 0.5;

    // オシレーターノード群
    this.oscillators = {};
    this.gains = {};
    this.panner = null;
    this.masterGain = null;
    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.ctx.destination);

      // ステレオパンナー
      if (typeof StereoPannerNode !== 'undefined') {
        this.panner = this.ctx.createStereoPanner();
        this.panner.pan.value = 0;
        this.panner.connect(this.masterGain);
      } else {
        this.panner = this.masterGain; // フォールバック
      }

      // 4方向オシレーター
      const types = {
        front: 'sine',      // 前 = サイン波
        back:  'triangle',  // 後 = 三角波
        left:  'sawtooth',  // 左 = ノコギリ波
        right: 'square'     // 右 = 矩形波
      };

      for (const [dir, type] of Object.entries(types)) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = 440;
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(this.panner);
        osc.start();
        this.oscillators[dir] = osc;
        this.gains[dir] = gain;
      }

      this._initialized = true;
    } catch (e) {
      console.warn('Web Audio API 初期化エラー:', e);
    }
  }

  update(pitch, roll) {
    if (!this._initialized || !this.enabled) {
      this._silenceAll();
      return;
    }

    // AudioContext がサスペンドされていたら再開
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const absPitch = Math.abs(pitch);
    const absRoll  = Math.abs(roll);

    // 閾値モードチェック
    if (this.mode === 'threshold') {
      if (absPitch < this.threshold && absRoll < this.threshold) {
        this._silenceAll();
        return;
      }
    }

    const now = this.ctx.currentTime;
    const ramp = 0.05; // 50ms ランプ

    // パン（左右）
    if (this.panner && this.panner.pan) {
      const pan = Math.max(-1, Math.min(1, roll / 15));
      this.panner.pan.setTargetAtTime(pan, now, 0.05);
    }

    // 各方向の音量とピッチ計算
    const maxAngle = 30; // 最大参照角度

    // 前方向
    if (pitch < -0.05) {
      const intensity = Math.min(absPitch / maxAngle, 1);
      const freq = 220 + intensity * 660; // 220Hz ~ 880Hz
      this.oscillators.front.frequency.setTargetAtTime(freq, now, ramp);
      this.gains.front.gain.setTargetAtTime(intensity * 0.3, now, ramp);
    } else {
      this.gains.front.gain.setTargetAtTime(0, now, ramp);
    }

    // 後方向
    if (pitch > 0.05) {
      const intensity = Math.min(absPitch / maxAngle, 1);
      const freq = 220 + intensity * 660;
      this.oscillators.back.frequency.setTargetAtTime(freq, now, ramp);
      this.gains.back.gain.setTargetAtTime(intensity * 0.3, now, ramp);
    } else {
      this.gains.back.gain.setTargetAtTime(0, now, ramp);
    }

    // 左方向
    if (roll < -0.05) {
      const intensity = Math.min(absRoll / maxAngle, 1);
      const freq = 330 + intensity * 440;
      this.oscillators.left.frequency.setTargetAtTime(freq, now, ramp);
      this.gains.left.gain.setTargetAtTime(intensity * 0.25, now, ramp);
    } else {
      this.gains.left.gain.setTargetAtTime(0, now, ramp);
    }

    // 右方向
    if (roll > 0.05) {
      const intensity = Math.min(absRoll / maxAngle, 1);
      const freq = 330 + intensity * 440;
      this.oscillators.right.frequency.setTargetAtTime(freq, now, ramp);
      this.gains.right.gain.setTargetAtTime(intensity * 0.25, now, ramp);
    } else {
      this.gains.right.gain.setTargetAtTime(0, now, ramp);
    }
  }

  _silenceAll() {
    if (!this._initialized) return;
    const now = this.ctx.currentTime;
    for (const g of Object.values(this.gains)) {
      g.gain.setTargetAtTime(0, now, 0.05);
    }
  }

  setMasterVolume(v) {
    this.masterVolume = v;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this._silenceAll();
    return this.enabled;
  }

  setMode(mode) {
    this.mode = mode;
  }
}

/* ========================================
   UI マネージャー
   ======================================== */
class UIManager {
  constructor() {
    // DOM参照
    this.els = {
      pitchValue:   document.getElementById('pitch-value'),
      rollValue:    document.getElementById('roll-value'),
      totalValue:   document.getElementById('total-value'),
      pitchDir:     document.getElementById('pitch-direction'),
      rollDir:      document.getElementById('roll-direction'),
      pitchBar:     document.getElementById('pitch-bar'),
      rollBar:      document.getElementById('roll-bar'),
      maxPitch:     document.getElementById('max-pitch'),
      maxRoll:      document.getElementById('max-roll'),
      sampleCount:  document.getElementById('sample-count'),
      bubble:       document.getElementById('bubble'),
      arcPitch:     document.getElementById('arc-pitch'),
      arcRoll:      document.getElementById('arc-roll'),
      sensorStatus: document.getElementById('sensor-status'),
      sensorInfo:   document.getElementById('sensor-info'),
    };

    this.decimalPlaces = 3;
    this.levelSensitivity = 10; // °
  }

  updateAngles(pitch, roll, total) {
    const dp = this.decimalPlaces;

    // デジタル値
    this.els.pitchValue.textContent = Math.abs(pitch).toFixed(dp);
    this.els.rollValue.textContent  = Math.abs(roll).toFixed(dp);
    this.els.totalValue.textContent = total.toFixed(dp);

    // 方向インジケーター
    this._updateDirection(this.els.pitchDir, pitch, '前傾', '後傾', '水平');
    this._updateDirection(this.els.rollDir, roll, '右傾', '左傾', '水平');

    // カラーリング
    this._colorizeAngle(this.els.pitchValue, Math.abs(pitch));
    this._colorizeAngle(this.els.rollValue, Math.abs(roll));

    // 角度バー
    const barScale = 10; // ±10°でフル
    const pitchPct = Math.min(Math.abs(pitch) / barScale * 50, 50);
    const rollPct  = Math.min(Math.abs(roll) / barScale * 50, 50);
    this.els.pitchBar.style.width = `${pitchPct}%`;
    this.els.rollBar.style.width  = `${rollPct}%`;

    // SVG バブル
    this._updateBubble(pitch, roll);

    // 弧
    this._updateArcs(pitch, roll);
  }

  _updateDirection(el, value, posLabel, negLabel, zeroLabel) {
    const threshold = 0.02;
    el.className = 'direction-indicator';
    if (Math.abs(value) < threshold) {
      el.textContent = zeroLabel;
      el.classList.add('dir-level');
    } else if (value > 0) {
      el.textContent = posLabel;
      // pitch>0 → 後傾, roll>0 → 右傾 — ラベルに応じたクラス
      if (posLabel === '前傾') el.classList.add('dir-front');
      else if (posLabel === '後傾') el.classList.add('dir-back');
      else if (posLabel === '右傾') el.classList.add('dir-right');
      else el.classList.add('dir-left');
    } else {
      el.textContent = negLabel;
      if (negLabel === '前傾') el.classList.add('dir-front');
      else if (negLabel === '後傾') el.classList.add('dir-back');
      else if (negLabel === '右傾') el.classList.add('dir-right');
      else el.classList.add('dir-left');
    }
  }

  _colorizeAngle(el, absVal) {
    el.classList.remove('level-ok', 'level-warn', 'level-danger');
    if (absVal < 0.5) el.classList.add('level-ok');
    else if (absVal < 3) el.classList.add('level-warn');
    else el.classList.add('level-danger');
  }

  _updateBubble(pitch, roll) {
    const sens = this.levelSensitivity;
    const cx = 150 + Math.max(-120, Math.min(120, (roll / sens) * 120));
    const cy = 150 + Math.max(-120, Math.min(120, (pitch / sens) * 120));
    this.els.bubble.setAttribute('cx', cx);
    this.els.bubble.setAttribute('cy', cy);

    // バブルの色を合成角度に応じて変化
    const total = Math.sqrt(pitch * pitch + roll * roll);
    const hue = Math.max(0, 180 - total * 18); // 180(cyan) → 0(red)
    this.els.bubble.setAttribute('fill', `hsl(${hue}, 100%, 60%)`);
  }

  _updateArcs(pitch, roll) {
    // ピッチ弧（垂直方向）
    const pAngle = Math.max(-90, Math.min(90, pitch * 3));
    this.els.arcPitch.setAttribute('d', this._describeArc(150, 150, 135, -90, -90 + pAngle));

    // ロール弧（水平方向）
    const rAngle = Math.max(-90, Math.min(90, roll * 3));
    this.els.arcRoll.setAttribute('d', this._describeArc(150, 150, 130, 0, rAngle));
  }

  _describeArc(cx, cy, r, startAngle, endAngle) {
    if (Math.abs(endAngle - startAngle) < 0.1) return '';
    const start = this._polarToCartesian(cx, cy, r, endAngle);
    const end   = this._polarToCartesian(cx, cy, r, startAngle);
    const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
    const sweep = endAngle > startAngle ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
  }

  _polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  updateStats(maxPitch, maxRoll, sampleCount) {
    const dp = this.decimalPlaces;
    this.els.maxPitch.textContent = Math.abs(maxPitch).toFixed(dp) + '°';
    this.els.maxRoll.textContent  = Math.abs(maxRoll).toFixed(dp) + '°';
    this.els.sampleCount.textContent = sampleCount.toLocaleString();
  }

  setStatus(state, text) {
    const el = this.els.sensorStatus;
    el.className = 'status-badge status-' + state;
    el.querySelector('.status-text').textContent = text;
  }
}

/* ========================================
   メインアプリケーション
   ======================================== */
class App {
  constructor() {
    this.sensor = new SensorEngine();
    this.audio  = new AudioEngine();
    this.ui     = new UIManager();

    this.isRunning = false;
    this.animFrameId = null;
    this._orientationHandler = (e) => this._onOrientation(e);

    // 設定
    this.settings = this._loadSettings();
    this._applySettings();

    // イベントバインド
    this._bindEvents();
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

    // 描画ループ
    this._startRenderLoop();

    return true;
  }

  _onOrientation(e) {
    if (!this.isRunning) return;

    const beta  = e.beta;  // ピッチ（前後: -180 〜 180）
    const gamma = e.gamma; // ロール（左右: -90 〜 90）

    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;

    this.sensor.process(beta, gamma);
  }

  _startRenderLoop() {
    let lastStatsUpdate = 0;

    const loop = (timestamp) => {
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
    document.getElementById('btn-start').addEventListener('click', () => this.start());

    // サウンドトグル
    document.getElementById('btn-sound-toggle').addEventListener('click', (e) => {
      const on = this.audio.toggle();
      e.currentTarget.classList.toggle('active', on);
      this._saveSettings();
    });

    // 設定パネル開閉
    document.getElementById('btn-settings').addEventListener('click', () => {
      document.getElementById('settings-panel').classList.add('open');
    });
    document.getElementById('btn-close-settings').addEventListener('click', () => {
      document.getElementById('settings-panel').classList.remove('open');
    });
    document.getElementById('settings-overlay').addEventListener('click', () => {
      document.getElementById('settings-panel').classList.remove('open');
    });

    // キャリブレーション
    document.getElementById('btn-calibrate').addEventListener('click', () => {
      this.sensor.calibrate();
      document.querySelector('.measurement-area').classList.add('calibrated');
      setTimeout(() => {
        document.querySelector('.measurement-area').classList.remove('calibrated');
      }, 600);
      this._showToast('キャリブレーション完了');
    });

    // 統計リセット
    document.getElementById('btn-reset-stats').addEventListener('click', () => {
      this.sensor.resetStats();
      this._showToast('統計リセット');
    });

    // 値ロック
    document.getElementById('btn-lock').addEventListener('click', (e) => {
      this.sensor.locked = !this.sensor.locked;
      e.currentTarget.classList.toggle('active', this.sensor.locked);
      document.querySelector('.measurement-area').classList.toggle('locked', this.sensor.locked);
      e.currentTarget.querySelector('.btn-svg').style.fill =
        this.sensor.locked ? 'var(--accent-cyan)' : '';
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
        document.getElementById('threshold-setting').style.display =
          mode === 'threshold' ? 'block' : 'none';
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
      emaAlpha:       this.sensor.emaAlpha,
      kalmanQ:        this.sensor.kfPitch.q,
      kalmanR:        this.sensor.kfPitch.r,
      deadzone:       this.sensor.deadzone,
      soundEnabled:   this.audio.enabled,
      soundMode:      this.audio.mode,
      soundThreshold: this.audio.threshold,
      masterVolume:   this.audio.masterVolume,
      decimalPlaces:  this.ui.decimalPlaces,
      levelSens:      this.ui.levelSensitivity,
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
      document.getElementById('filter-alpha').value = s.emaAlpha;
      document.getElementById('filter-alpha-val').textContent = s.emaAlpha.toFixed(2);
    }
    if (s.kalmanQ !== undefined) {
      document.getElementById('kalman-q').value = s.kalmanQ;
      document.getElementById('kalman-q-val').textContent = s.kalmanQ.toFixed(4);
    }
    if (s.kalmanR !== undefined) {
      document.getElementById('kalman-r').value = s.kalmanR;
      document.getElementById('kalman-r-val').textContent = s.kalmanR.toFixed(2);
    }
    if (s.kalmanQ !== undefined && s.kalmanR !== undefined) {
      this.sensor.setKalmanParams(s.kalmanQ, s.kalmanR);
    }
    if (s.deadzone !== undefined) {
      this.sensor.deadzone = s.deadzone;
      document.getElementById('deadzone').value = s.deadzone;
      document.getElementById('deadzone-val').textContent = s.deadzone.toFixed(3);
    }
    if (s.soundEnabled !== undefined) {
      this.audio.enabled = s.soundEnabled;
      document.getElementById('btn-sound-toggle').classList.toggle('active', s.soundEnabled);
    }
    if (s.soundMode !== undefined) {
      this.audio.mode = s.soundMode;
      document.querySelectorAll('[data-sound-mode]').forEach(b => {
        b.classList.toggle('active', b.dataset.soundMode === s.soundMode);
      });
      document.getElementById('threshold-setting').style.display =
        s.soundMode === 'threshold' ? 'block' : 'none';
    }
    if (s.soundThreshold !== undefined) {
      this.audio.threshold = s.soundThreshold;
      document.getElementById('sound-threshold').value = s.soundThreshold;
      document.getElementById('sound-threshold-val').textContent = s.soundThreshold.toFixed(1);
    }
    if (s.masterVolume !== undefined) {
      this.audio.masterVolume = s.masterVolume;
      document.getElementById('master-volume').value = s.masterVolume;
      document.getElementById('master-volume-val').textContent = Math.round(s.masterVolume * 100) + '%';
    }
    if (s.decimalPlaces !== undefined) {
      this.ui.decimalPlaces = s.decimalPlaces;
      document.getElementById('decimal-places').value = s.decimalPlaces;
      document.getElementById('decimal-places-val').textContent = s.decimalPlaces;
    }
    if (s.levelSens !== undefined) {
      this.ui.levelSensitivity = s.levelSens;
      document.getElementById('level-sensitivity').value = s.levelSens;
      document.getElementById('level-sensitivity-val').textContent = Math.round(s.levelSens);
    }
  }
}

/* ---------- 起動 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
