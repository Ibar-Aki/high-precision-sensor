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
});
