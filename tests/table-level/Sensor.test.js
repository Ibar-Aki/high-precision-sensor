import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TableLevelSensor } from '../../table-level/assets/js/sensor.js';

describe('table-level/sensor', () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      },
      clear() {
        store.clear();
      }
    };
  });

  afterEach(() => {
    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalLocalStorage;
    }
  });

  it('静止入力でmeasuringまで遷移すること', () => {
    const sensor = new TableLevelSensor({ staticDurationFrames: 5, averagingSampleCount: 8, staticVarianceThreshold: 0.001 });
    for (let i = 0; i < 80; i++) {
      sensor.process(2.0, -1.0);
    }
    expect(sensor.getMeasurementMode()).toBe('measuring');
    const angle = sensor.getDeskAngles();
    expect(Math.abs(angle.pitchDeg)).toBeGreaterThan(0.5);
  });

  it('既定値では確定値モードへの遷移が遅くなること', () => {
    const sensor = new TableLevelSensor();
    for (let i = 0; i < 160; i++) {
      sensor.process(2.0, -1.0);
    }
    expect(sensor.getMeasurementMode()).not.toBe('measuring');

    for (let i = 0; i < 80; i++) {
      sensor.process(2.0, -1.0);
    }
    expect(sensor.getMeasurementMode()).toBe('measuring');
  });

  it('短い外乱はヒステリシスで吸収し長い外乱でactiveへ戻ること', () => {
    const sensor = new TableLevelSensor({ staticDurationFrames: 5, averagingSampleCount: 8, staticVarianceThreshold: 0.001 });
    for (let i = 0; i < 80; i++) {
      sensor.process(2.0, -1.0);
    }
    expect(sensor.getMeasurementMode()).toBe('measuring');

    for (let i = 0; i < 8; i++) {
      sensor.process(i % 2 === 0 ? 15 : -12, i % 2 === 0 ? -14 : 13);
    }
    expect(sensor.getMeasurementMode()).not.toBe('active');

    for (let i = 0; i < 20; i++) {
      sensor.process(i % 2 === 0 ? 15 : -12, i % 2 === 0 ? -14 : 13);
    }
    expect(sensor.getMeasurementMode()).toBe('active');
  });

  it('確定値表示が微小ノイズで暴れにくいこと', () => {
    const sensor = new TableLevelSensor({ staticDurationFrames: 3, averagingSampleCount: 3, staticVarianceThreshold: 0.01 });
    for (let i = 0; i < 40; i++) {
      sensor.process(2.0, -1.0);
    }
    expect(sensor.getMeasurementMode()).toBe('measuring');

    const finalPitchValues = [];
    for (let i = 0; i < 40; i++) {
      const pitch = i % 2 === 0 ? 2.03 : 1.97;
      const roll = i % 2 === 0 ? -1.03 : -0.97;
      sensor.process(pitch, roll);
      const final = sensor.getDeskAngles('final');
      if (Number.isFinite(final.pitchDeg)) {
        finalPitchValues.push(final.pitchDeg);
      }
    }

    expect(finalPitchValues.length).toBeGreaterThan(0);
    const minPitch = Math.min(...finalPitchValues);
    const maxPitch = Math.max(...finalPitchValues);
    expect(maxPitch - minPitch).toBeLessThanOrEqual(0.05);
  });

  it('軸マッピングと符号反転が反映されること', () => {
    const sensor = new TableLevelSensor();
    sensor.setAxisConfig({ phonePitchAxis: 'width', invertPitch: true, invertRoll: false });
    for (let i = 0; i < 50; i++) {
      sensor.process(4.0, 1.0);
    }
    const angle = sensor.getDeskAngles();
    expect(angle.pitchDeg).toBeLessThan(0);
  });

  it('再計測リセットでサンプル数とフィルタ履歴を初期化すること', () => {
    const sensor = new TableLevelSensor();
    for (let i = 0; i < 50; i++) {
      sensor.process(8.0, 8.0);
    }
    expect(sensor.getSampleCount()).toBeGreaterThan(0);

    sensor.resetMeasurementState();
    expect(sensor.getSampleCount()).toBe(0);

    sensor.process(0.0, 0.0);
    const angle = sensor.getDeskAngles();
    expect(Math.abs(angle.pitchDeg)).toBeLessThan(0.05);
    expect(Math.abs(angle.rollDeg)).toBeLessThan(0.05);
  });

  it('緩やかな変化でもEMA内部状態が追従しデッドゾーンに埋もれ続けないこと', () => {
    const sensor = new TableLevelSensor({
      emaAlpha: 0.1,
      deadzone: 0.05,
      staticDurationFrames: 9999,
      staticVarianceThreshold: -1
    });

    for (let i = 1; i <= 20; i++) {
      sensor.process(i * 0.01, 0);
    }

    const angle = sensor.getDeskAngles();
    expect(Math.abs(angle.pitchDeg)).toBeGreaterThan(0);
  });

  it('1点校正で現在姿勢がゼロ付近になること', () => {
    const sensor = new TableLevelSensor();
    for (let i = 0; i < 80; i++) {
      sensor.process(5.0, -3.0);
    }
    const before = sensor.getDeskAngles();
    expect(Math.abs(before.pitchDeg)).toBeGreaterThan(0.5);

    const calibrated = sensor.calibrateOnePoint();
    expect(calibrated.ok).toBe(true);

    for (let i = 0; i < 80; i++) {
      sensor.process(5.0, -3.0);
    }
    const after = sensor.getDeskAngles();
    expect(Math.abs(after.pitchDeg)).toBeLessThan(0.2);
    expect(Math.abs(after.rollDeg)).toBeLessThan(0.2);
  });

  it('2点校正の状態遷移が動作すること', () => {
    const sensor = new TableLevelSensor();
    for (let i = 0; i < 80; i++) {
      sensor.process(2.0, 1.0);
    }
    const started = sensor.startTwoPointCalibration();
    expect(started.ok).toBe(true);
    expect(started.step).toBe('awaiting_first');

    const first = sensor.captureTwoPointCalibrationPoint();
    expect(first.ok).toBe(true);
    expect(first.step).toBe('awaiting_second');

    for (let i = 0; i < 80; i++) {
      sensor.process(-1.0, -2.0);
    }
    const second = sensor.captureTwoPointCalibrationPoint();
    expect(second.done).toBe(true);
    expect(second.ok).toBe(true);
    expect(sensor.getTwoPointCalibrationState().step).toBe('idle');
  });
});
