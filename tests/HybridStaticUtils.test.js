import { describe, expect, it } from 'vitest';
import {
  isStaticDetected,
  pushStaticSample,
  resetMotionWindow,
  resetStaticBuffer,
  toPositiveInt,
  updateMotionWindow
} from '../shared/js/HybridStaticUtils.js';

describe('HybridStaticUtils', () => {
  it('動きウィンドウの有効サイズを維持しつつ分散を更新すること', () => {
    const state = {
      measurementVariance: Infinity,
      motionWindow: [],
      motionWindowStart: 0,
      motionWindowSum: 0,
      motionWindowSqSum: 0,
      _prevKfPitch: null,
      _prevKfRoll: null,
      staticPitchBuffer: [],
      staticRollBuffer: [],
      staticBufferStart: 0,
      staticPitchSum: 0,
      staticRollSum: 0,
      staticSampleCount: 0
    };

    const windowSize = 7;
    for (let i = 0; i < 8000; i++) {
      updateMotionWindow(state, Math.sin(i / 3) * 20, Math.cos(i / 4) * 20, windowSize);
    }

    const activeWindowSize = state.motionWindow.length - state.motionWindowStart;
    expect(activeWindowSize).toBeLessThanOrEqual(windowSize);
    expect(state.motionWindow.length).toBeLessThan(600);
    expect(Number.isFinite(state.measurementVariance)).toBe(true);
  });

  it('静止バッファを上限件数で維持すること', () => {
    const state = {
      measurementVariance: Infinity,
      motionWindow: [],
      motionWindowStart: 0,
      motionWindowSum: 0,
      motionWindowSqSum: 0,
      _prevKfPitch: null,
      _prevKfRoll: null,
      staticPitchBuffer: [],
      staticRollBuffer: [],
      staticBufferStart: 0,
      staticPitchSum: 0,
      staticRollSum: 0,
      staticSampleCount: 0
    };

    for (let i = 0; i < 4000; i++) {
      pushStaticSample(state, 1.0, -1.0, 20);
    }

    expect(state.staticSampleCount).toBeLessThanOrEqual(20);
    expect(state.staticPitchBuffer.length).toBeLessThan(600);
    expect(state.staticRollBuffer.length).toBeLessThan(600);
  });

  it('補助関数の境界値を満たすこと', () => {
    expect(toPositiveInt(10.2, 3)).toBe(10);
    expect(toPositiveInt(0, 3)).toBe(3);
    expect(toPositiveInt(NaN, 3)).toBe(3);

    const state = {
      measurementVariance: 0.001,
      motionWindow: [0, 0, 0],
      motionWindowStart: 0,
      motionWindowSum: 0,
      motionWindowSqSum: 0,
      _prevKfPitch: null,
      _prevKfRoll: null,
      staticPitchBuffer: [1],
      staticRollBuffer: [1],
      staticBufferStart: 0,
      staticPitchSum: 1,
      staticRollSum: 1,
      staticSampleCount: 1
    };

    expect(isStaticDetected(state, 3, 0.002)).toBe(true);
    resetStaticBuffer(state);
    resetMotionWindow(state);
    expect(state.staticSampleCount).toBe(0);
    expect(state.motionWindow.length).toBe(0);
    expect(state.measurementVariance).toBe(Infinity);
  });
});