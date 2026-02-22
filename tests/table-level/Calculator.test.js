import { describe, it, expect } from 'vitest';
import {
  calcLegDeltaMm,
  calcAdjustmentInstructions,
  convertToCwOnly,
  isLevel
} from '../../table-level/assets/js/calculator.js';

describe('table-level/calculator', () => {
  it('pitch正で奥側を下げる指示（双方向）になること', () => {
    const delta = calcLegDeltaMm({ pitchDeg: 1, rollDeg: 0, widthMm: 800, depthMm: 1200 });
    expect(delta.BL).toBeLessThan(0);
    expect(delta.BR).toBeLessThan(0);
    expect(delta.FL).toBeCloseTo(0, 6);
  });

  it('CW専用変換で全足が0以上になること', () => {
    const shifted = convertToCwOnly({ FL: 0, FR: 1, BL: -4, BR: -2 });
    expect(Math.min(...Object.values(shifted))).toBeGreaterThanOrEqual(0);
    expect(shifted.BL).toBe(0);
  });

  it('回転指示が0.5刻みになること', () => {
    const result = calcAdjustmentInstructions({
      pitchDeg: 0.4,
      rollDeg: 0.2,
      widthMm: 800,
      depthMm: 1200,
      boltPitchMmPerRev: 1.25,
      mode: 'bidirectional',
      minTurnsToShow: 0
    });
    const turns = result.instructions.map((i) => i.turns);
    expect(turns.every((v) => Number.isInteger(v * 2))).toBe(true);
  });

  it('水平判定が閾値以内でtrueになること', () => {
    expect(isLevel(0.2, -0.3, 0.5)).toBe(true);
    expect(isLevel(0.8, 0.1, 0.5)).toBe(false);
  });
});
