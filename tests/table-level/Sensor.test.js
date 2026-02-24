import { describe, it, expect } from 'vitest';
import { TableLevelSensor } from '../../table-level/assets/js/sensor.js';

describe('table-level/sensor', () => {
  it('静止入力でmeasuringまで遷移すること', () => {
    const sensor = new TableLevelSensor({ staticDurationFrames: 5, averagingSampleCount: 8, staticVarianceThreshold: 0.001 });
    for (let i = 0; i < 80; i++) {
      sensor.process(2.0, -1.0);
    }
    expect(sensor.getMeasurementMode()).toBe('measuring');
    const angle = sensor.getDeskAngles();
    expect(Math.abs(angle.pitchDeg)).toBeGreaterThan(0.5);
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
});
