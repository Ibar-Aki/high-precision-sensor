import { TableLevelSensor } from './sensor.js';
import { VoiceGuide } from './voice.js';
import { calcAdjustmentInstructions, isLevel } from './calculator.js';
import { TableLevelSettingsManager, DEFAULT_SETTINGS } from './settings.js';
import { getDirectionLabel, getLegLabel } from './i18n.js';

const BOLT_PITCH_MAP = {
  M6: 1.0,
  M8: 1.25,
  M10: 1.5,
  M12: 1.75
};
const MIN_SAMPLES_TO_FINALIZE = 10;
const ACTIVE_LOOP_INTERVAL_MS = 1000 / 30;
const IDLE_LOOP_INTERVAL_MS = 120;

class TableLevelApp {
  constructor() {
    this.settingsManager = new TableLevelSettingsManager();
    const loaded = this.settingsManager.load();
    this.settings = loaded.value;

    this.sensor = new TableLevelSensor(this._buildSensorOptions(this.settings));
    this.voice = new VoiceGuide();

    this.permissionGranted = false;
    this.hasOrientationListener = false;
    this.isMeasuring = false;
    this.resultReady = false;
    this.levelAnnounced = false;
    this.currentResult = null;
    this.measurementStartedAt = 0;
    this.isPortrait = true;
    this._lastStatus = { type: null, text: null };
    this._orientationBlocked = false;
    this._statusBeforeOrientationBlock = null;
    this._lastLoopUpdateAt = 0;
    this._loopFrameId = null;
    this._destroyed = false;
    this._orientationHandler = (event) => this._onOrientation(event);
    this._resizeHandler = () => this._updateOrientationGuard();
    this._orientationChangeHandler = () => this._updateOrientationGuard();
    this._destroyHandler = () => this.destroy();

    this._bindElements();
    this._bindEvents();
    this._applySettingsToForm();
    this._applySettingsToSensor();
    this._toggleBoltCustomInput();
    this._toggleManualConfirm(false);
    this._updateOrientationGuard();

    if (!loaded.ok) {
      this._setStatus('warning', '設定の読み込みに失敗したため既定値を使用します。');
    }

    this._registerServiceWorker();
    this._startLoop();
  }

  _bindElements() {
    const byId = (id) => document.getElementById(id);

    this.els = {
      splash: byId('splash-screen'),
      app: byId('app-screen'),
      orientationOverlay: byId('orientation-overlay'),
      statusText: byId('status-text'),
      pitchValue: byId('pitch-value'),
      rollValue: byId('roll-value'),
      measurementMode: byId('measurement-mode'),
      stabilityValue: byId('stability-value'),
      levelBanner: byId('level-banner'),
      warningBox: byId('warning-box'),
      instructionList: byId('instruction-list'),
      settingsForm: byId('settings-form'),
      enableSensorButton: byId('enable-sensor-btn'),
      startMeasureButton: byId('start-measure-btn'),
      remeasureButton: byId('remeasure-btn'),
      manualConfirmButton: byId('manual-confirm-btn'),
      saveSettingsButton: byId('save-settings-btn'),
      resetSettingsButton: byId('reset-settings-btn'),
      tableWidth: byId('table-width'),
      tableDepth: byId('table-depth'),
      boltType: byId('bolt-type'),
      boltCustomPitch: byId('bolt-custom-pitch'),
      boltCustomRow: byId('bolt-custom-row'),
      phonePitchAxis: byId('phone-pitch-axis'),
      invertPitch: byId('invert-pitch'),
      invertRoll: byId('invert-roll'),
      adjustMode: byId('adjust-mode'),
      levelThreshold: byId('level-threshold'),
      language: byId('language'),
      voiceEnabled: byId('voice-enabled'),
      volume: byId('volume'),
      filterAlpha: byId('filter-alpha'),
      kalmanQ: byId('kalman-q'),
      kalmanR: byId('kalman-r'),
      staticVarianceThreshold: byId('static-variance-threshold'),
      staticDurationFrames: byId('static-duration-frames'),
      averagingSampleCount: byId('averaging-sample-count'),
      measurementTimeoutSec: byId('measurement-timeout-sec'),
      maxTurnsWarning: byId('max-turns-warning'),
      minTurnsToShow: byId('min-turns-to-show'),
      legFL: byId('leg-FL'),
      legFR: byId('leg-FR'),
      legBL: byId('leg-BL'),
      legBR: byId('leg-BR')
    };
  }

  _bindEvents() {
    this.els.enableSensorButton.addEventListener('click', () => this._enableSensorAccess());
    this.els.startMeasureButton.addEventListener('click', () => this.startMeasurement());
    this.els.remeasureButton.addEventListener('click', () => this.startMeasurement());
    this.els.manualConfirmButton.addEventListener('click', () => this._confirmMeasurementManually());
    this.els.settingsForm.addEventListener('submit', (event) => {
      event.preventDefault();
    });

    this.els.saveSettingsButton.addEventListener('click', (event) => {
      event.preventDefault();
      this._saveSettingsFromForm();
    });

    this.els.resetSettingsButton.addEventListener('click', (event) => {
      event.preventDefault();
      this.settings = { ...DEFAULT_SETTINGS };
      this._applySettingsToForm();
      this._applySettingsToSensor();
      const saveResult = this.settingsManager.save(this.settings);
      if (!saveResult.ok) {
        this._setStatus('warning', '設定の保存に失敗しました。');
        return;
      }
      this._setStatus('active', '設定を初期値に戻しました。');
    });

    this.els.boltType.addEventListener('change', () => this._toggleBoltCustomInput());

    window.addEventListener('resize', this._resizeHandler);
    window.addEventListener('orientationchange', this._orientationChangeHandler);
    window.addEventListener('pagehide', this._destroyHandler);
    window.addEventListener('beforeunload', this._destroyHandler);
  }

  async _enableSensorAccess() {
    if (typeof DeviceOrientationEvent === 'undefined') {
      this._setStatus('error', 'この端末ではセンサーAPIが利用できません。');
      return;
    }

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') {
          this._setStatus('error', 'センサー許可が必要です。Safariの設定を確認してください。');
          return;
        }
      } catch (error) {
        this._setStatus('error', `センサー許可でエラー: ${error.message}`);
        return;
      }
    }

    if (!this.hasOrientationListener) {
      window.addEventListener('deviceorientation', this._orientationHandler, true);
      this.hasOrientationListener = true;
    }

    this.permissionGranted = true;
    this.els.splash.classList.remove('active');
    this.els.app.classList.add('active');
    this._setStatus('active', 'センサー有効化済み。計測開始してください。');
  }

  _onOrientation(event) {
    if (!this.permissionGranted) return;
    if (!this.isPortrait) return;
    this.sensor.process(event.beta, event.gamma);
  }

  startMeasurement() {
    if (!this.permissionGranted) {
      this._setStatus('warning', '先にセンサーを有効化してください。');
      return;
    }
    if (!this.isPortrait) {
      this._setStatus('warning', '縦向きで計測してください。');
      return;
    }

    this.isMeasuring = true;
    this.resultReady = false;
    this.levelAnnounced = false;
    this.currentResult = null;
    this.measurementStartedAt = Date.now();

    this.sensor.resetMeasurementState();
    this._toggleManualConfirm(false);
    this._setStatus('active', '計測中... 端末を動かさず待機してください。');

    this.els.warningBox.textContent = '';
    this.els.levelBanner.classList.remove('visible');
    this._renderEmptyInstructions();
    this._renderLegCards(null);
    this.voice.stop();
  }

  _confirmMeasurementManually() {
    if (!this.permissionGranted) return;
    if (!this._hasSufficientSensorSamples()) {
      this._setStatus('warning', 'センサーデータが不足しているため手動確定できません。');
      return;
    }
    this._finalizeMeasurement(true);
  }

  _saveSettingsFromForm() {
    const draft = {
      tableWidth: Number(this.els.tableWidth.value),
      tableDepth: Number(this.els.tableDepth.value),
      boltType: this.els.boltType.value,
      boltCustomPitch: this.els.boltCustomPitch.value === '' ? null : Number(this.els.boltCustomPitch.value),
      phonePitchAxis: this.els.phonePitchAxis.value,
      invertPitch: this.els.invertPitch.checked,
      invertRoll: this.els.invertRoll.checked,
      adjustMode: this.els.adjustMode.value,
      levelThreshold: Number(this.els.levelThreshold.value),
      language: this.els.language.value,
      voiceEnabled: this.els.voiceEnabled.checked,
      volume: Number(this.els.volume.value),
      filterAlpha: Number(this.els.filterAlpha.value),
      kalmanQ: Number(this.els.kalmanQ.value),
      kalmanR: Number(this.els.kalmanR.value),
      staticVarianceThreshold: Number(this.els.staticVarianceThreshold.value),
      staticDurationFrames: Number(this.els.staticDurationFrames.value),
      averagingSampleCount: Number(this.els.averagingSampleCount.value),
      measurementTimeoutSec: Number(this.els.measurementTimeoutSec.value),
      maxTurnsWarning: Number(this.els.maxTurnsWarning.value),
      minTurnsToShow: Number(this.els.minTurnsToShow.value)
    };

    const saveResult = this.settingsManager.save(draft);
    const loaded = this.settingsManager.load();
    this.settings = loaded.value;
    this._applySettingsToForm();
    this._applySettingsToSensor();
    this._toggleBoltCustomInput();

    if (!saveResult.ok) {
      this._setStatus('warning', '設定の保存に失敗しました。');
      return;
    }
    if (!loaded.ok) {
      this._setStatus('warning', '設定保存後の読み込み検証に失敗しました。');
      return;
    }

    this._setStatus('active', '設定を保存しました。');
  }

  _applySettingsToForm() {
    const s = this.settings;
    this.els.tableWidth.value = s.tableWidth;
    this.els.tableDepth.value = s.tableDepth;
    this.els.boltType.value = s.boltType;
    this.els.boltCustomPitch.value = s.boltCustomPitch ?? '';
    this.els.phonePitchAxis.value = s.phonePitchAxis;
    this.els.invertPitch.checked = s.invertPitch;
    this.els.invertRoll.checked = s.invertRoll;
    this.els.adjustMode.value = s.adjustMode;
    this.els.levelThreshold.value = s.levelThreshold;
    this.els.language.value = s.language;
    this.els.voiceEnabled.checked = s.voiceEnabled;
    this.els.volume.value = s.volume;
    this.els.filterAlpha.value = s.filterAlpha;
    this.els.kalmanQ.value = s.kalmanQ;
    this.els.kalmanR.value = s.kalmanR;
    this.els.staticVarianceThreshold.value = s.staticVarianceThreshold;
    this.els.staticDurationFrames.value = s.staticDurationFrames;
    this.els.averagingSampleCount.value = s.averagingSampleCount;
    this.els.measurementTimeoutSec.value = s.measurementTimeoutSec;
    this.els.maxTurnsWarning.value = s.maxTurnsWarning;
    this.els.minTurnsToShow.value = s.minTurnsToShow;
  }

  _applySettingsToSensor() {
    this.sensor.setAxisConfig({
      phonePitchAxis: this.settings.phonePitchAxis,
      invertPitch: this.settings.invertPitch,
      invertRoll: this.settings.invertRoll
    });

    this.sensor.setFilterParams({
      emaAlpha: this.settings.filterAlpha,
      kalmanQ: this.settings.kalmanQ,
      kalmanR: this.settings.kalmanR,
      staticVarianceThreshold: this.settings.staticVarianceThreshold,
      staticDurationFrames: this.settings.staticDurationFrames,
      averagingSampleCount: this.settings.averagingSampleCount
    });
  }

  _buildSensorOptions(settings) {
    return {
      emaAlpha: settings.filterAlpha,
      kalmanQ: settings.kalmanQ,
      kalmanR: settings.kalmanR,
      staticVarianceThreshold: settings.staticVarianceThreshold,
      staticDurationFrames: settings.staticDurationFrames,
      averagingSampleCount: settings.averagingSampleCount,
      phonePitchAxis: settings.phonePitchAxis,
      invertPitch: settings.invertPitch,
      invertRoll: settings.invertRoll
    };
  }

  _startLoop() {
    const tick = (timestamp) => {
      if (this._destroyed) return;
      const hidden = document.hidden;
      const canRenderTelemetry = this.permissionGranted && this.isPortrait && !hidden;
      const canUpdateMeasurementFlow = this.isMeasuring && canRenderTelemetry;
      const targetInterval = canUpdateMeasurementFlow ? ACTIVE_LOOP_INTERVAL_MS : IDLE_LOOP_INTERVAL_MS;

      if (timestamp - this._lastLoopUpdateAt >= targetInterval) {
        if (canRenderTelemetry) {
          this._renderTelemetry();
        }
        if (canUpdateMeasurementFlow) {
          this._updateMeasurementFlow();
        }
        this._lastLoopUpdateAt = timestamp;
      }

      this._loopFrameId = window.requestAnimationFrame(tick);
    };
    this._loopFrameId = window.requestAnimationFrame(tick);
  }

  _renderTelemetry() {
    const { pitchDeg, rollDeg } = this.sensor.getDeskAngles();
    const info = this.sensor.getMeasurementInfo();

    this.els.pitchValue.textContent = `${pitchDeg.toFixed(3)}°`;
    this.els.rollValue.textContent = `${rollDeg.toFixed(3)}°`;
    this.els.measurementMode.textContent = info.mode;

    const stability = Math.min(1, info.staticSamples / Math.max(1, this.settings.averagingSampleCount));
    this.els.stabilityValue.textContent = `${Math.round(stability * 100)}%`;
  }

  _updateMeasurementFlow() {
    if (!this.isMeasuring || !this.permissionGranted) return;
    if (!this.isPortrait) return;

    const mode = this.sensor.getMeasurementMode();
    if (!this.resultReady && mode === 'measuring') {
      this._finalizeMeasurement(false);
      return;
    }

    if (!this.resultReady) {
      const elapsedSec = (Date.now() - this.measurementStartedAt) / 1000;
      if (elapsedSec >= this.settings.measurementTimeoutSec) {
        if (!this._hasSufficientSensorSamples()) {
          this._setStatus('warning', 'センサーデータ不足です。端末の向きと権限を確認してください。');
          this._toggleManualConfirm(false);
        } else {
          this._setStatus('warning', '計測が安定しません。手動確定または端末位置を見直してください。');
          this._toggleManualConfirm(true);
        }
      }
      return;
    }

    const { pitchDeg, rollDeg } = this.sensor.getDeskAngles();
    if (isLevel(pitchDeg, rollDeg, this.settings.levelThreshold)) {
      this.els.levelBanner.classList.add('visible');
      if (!this.levelAnnounced && this.settings.voiceEnabled) {
        this.voice.speakLevelAchieved({ language: this.settings.language, volume: this.settings.volume });
      }
      this.levelAnnounced = true;
      this._setStatus('active', '水平達成。作業完了です。');
    }
  }

  _finalizeMeasurement(forced) {
    if (!this.isPortrait) {
      this._setStatus('warning', '縦向きで再計測してください。');
      return;
    }
    if (!this._hasSufficientSensorSamples()) {
      this._setStatus('warning', 'センサーデータが不足しているため計算できません。');
      return;
    }

    const { pitchDeg, rollDeg } = this.sensor.getDeskAngles();
    if (!Number.isFinite(pitchDeg) || !Number.isFinite(rollDeg)) {
      this._setStatus('error', 'センサー値が不正のため再計測してください。');
      return;
    }

    const result = calcAdjustmentInstructions({
      pitchDeg,
      rollDeg,
      widthMm: this.settings.tableWidth,
      depthMm: this.settings.tableDepth,
      boltPitchMmPerRev: this._currentBoltPitch(),
      mode: this.settings.adjustMode,
      minTurnsToShow: this.settings.minTurnsToShow,
      maxTurnsWarning: this.settings.maxTurnsWarning
    });

    this.currentResult = result;
    this.resultReady = true;
    this._toggleManualConfirm(false);
    this._renderInstructions(result.instructions);
    this._renderLegCards(result.instructions);

    if (result.hasWarning) {
      this.els.warningBox.textContent = '注意: 推奨回転数が上限を超える足があります。構造を確認してください。';
    } else {
      this.els.warningBox.textContent = '';
    }

    const measuredMsg = forced ? '手動確定で調整指示を表示しました。' : '計測安定。調整指示を表示しました。';
    this._setStatus('active', measuredMsg);

    if (this.settings.voiceEnabled) {
      this.voice.speakAdjustment(result.instructions, {
        language: this.settings.language,
        volume: this.settings.volume
      });
    }
  }

  _renderEmptyInstructions() {
    this.els.instructionList.innerHTML = '';
    const item = document.createElement('li');
    item.textContent = '計測結果待ちです。';
    this.els.instructionList.appendChild(item);
  }

  _renderInstructions(instructions) {
    this.els.instructionList.innerHTML = '';

    const active = instructions.filter((item) => item.turns > 0);
    if (active.length === 0) {
      const item = document.createElement('li');
      item.textContent = '全足: 調整不要';
      this.els.instructionList.appendChild(item);
      return;
    }

    for (const instruction of instructions) {
      const item = document.createElement('li');
      const leg = getLegLabel(this.settings.language, instruction.leg);
      if (instruction.turns <= 0) {
        item.textContent = `${leg}: 調整不要`;
      } else {
        const directionLabel = getDirectionLabel(this.settings.language, instruction.direction);
        item.textContent = `${leg}: ${directionLabel} ${instruction.turns}回転`;
      }
      this.els.instructionList.appendChild(item);
    }
  }

  _renderLegCards(instructions) {
    const map = {
      FL: this.els.legFL,
      FR: this.els.legFR,
      BL: this.els.legBL,
      BR: this.els.legBR
    };

    for (const [leg, el] of Object.entries(map)) {
      el.textContent = `${leg}: -`;
      el.classList.remove('active');
    }

    if (!instructions) return;

    for (const instruction of instructions) {
      const el = map[instruction.leg];
      if (!el) continue;
      if (instruction.turns <= 0) {
        el.textContent = `${instruction.leg}: 調整不要`;
        continue;
      }
      el.textContent = `${instruction.leg}: ${instruction.direction} ${instruction.turns}`;
      el.classList.add('active');
    }
  }

  _toggleBoltCustomInput() {
    const show = this.els.boltType.value === 'custom';
    this.els.boltCustomRow.style.display = show ? 'grid' : 'none';
  }

  _toggleManualConfirm(show) {
    this.els.manualConfirmButton.style.display = show ? 'inline-flex' : 'none';
  }

  _currentBoltPitch() {
    if (this.settings.boltType === 'custom') {
      return this.settings.boltCustomPitch ?? 1.25;
    }
    return BOLT_PITCH_MAP[this.settings.boltType] ?? 1.25;
  }

  _setStatus(type, text) {
    if (this._lastStatus.type === type && this._lastStatus.text === text) {
      return;
    }
    this._lastStatus = { type, text };
    this.els.statusText.dataset.status = type;
    this.els.statusText.textContent = text;
  }

  _updateOrientationGuard() {
    const wasPortrait = this.isPortrait;
    this.isPortrait = window.innerHeight >= window.innerWidth;
    this.els.orientationOverlay.classList.toggle('visible', !this.isPortrait);
    if (!this.isPortrait) {
      if (!this._orientationBlocked) {
        this._orientationBlocked = true;
        this._statusBeforeOrientationBlock = { ...this._lastStatus };
      }
      this._toggleManualConfirm(false);
      if (this.isMeasuring) {
        this._setStatus('warning', '横向きのため計測停止中です。縦向きに戻してください。');
      }
      return;
    }

    if (!wasPortrait && this._orientationBlocked) {
      this._orientationBlocked = false;
      const prev = this._statusBeforeOrientationBlock;
      this._statusBeforeOrientationBlock = null;
      if (prev?.text) {
        this._setStatus(prev.type ?? 'active', prev.text);
      } else if (this.isMeasuring) {
        this._setStatus('active', '計測中... 端末を動かさず待機してください。');
      }
    }
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._loopFrameId !== null) {
      window.cancelAnimationFrame(this._loopFrameId);
      this._loopFrameId = null;
    }

    if (this.hasOrientationListener) {
      window.removeEventListener('deviceorientation', this._orientationHandler, true);
      this.hasOrientationListener = false;
    }

    this.voice.stop();

    window.removeEventListener('resize', this._resizeHandler);
    window.removeEventListener('orientationchange', this._orientationChangeHandler);
    window.removeEventListener('pagehide', this._destroyHandler);
    window.removeEventListener('beforeunload', this._destroyHandler);
  }

  _hasSufficientSensorSamples(min = MIN_SAMPLES_TO_FINALIZE) {
    return this.sensor.getSampleCount() >= min;
  }

  async _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch {
      // service worker登録失敗時は無視して継続
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new TableLevelApp();
});
