import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTurnsJa, buildInstructionText, getDirectionLabel } from '../../table-level/assets/js/i18n.js';
import { VoiceGuide } from '../../table-level/assets/js/voice.js';

describe('table-level/i18n + voice', () => {
  beforeEach(() => {
    global.window = {
      speechSynthesis: {
        cancel: vi.fn(),
        speak: vi.fn()
      }
    };
    global.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
        this.lang = '';
        this.volume = 1;
      }
    };
  });

  it('日本語の回転数文言を整形すること', () => {
    expect(formatTurnsJa(0.5)).toBe('半回');
    expect(formatTurnsJa(2.5)).toBe('2回半');
    expect(formatTurnsJa(3)).toBe('3回');
  });

  it('音声案内で0回転を除外し、読み上げキューを更新すること', () => {
    const voice = new VoiceGuide();
    const instructions = [
      { leg: 'BL', turns: 2.5, direction: 'CW' },
      { leg: 'FR', turns: 0, direction: 'CCW' }
    ];
    voice.speakAdjustment(instructions, { language: 'ja', volume: 0.8 });

    expect(window.speechSynthesis.cancel).toHaveBeenCalledTimes(1);
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
    const firstUtterance = window.speechSynthesis.speak.mock.calls[0][0];
    const secondUtterance = window.speechSynthesis.speak.mock.calls[1][0];
    expect(firstUtterance.text.includes('調整指示')).toBe(true);
    expect(secondUtterance.text.includes('手前右')).toBe(false);
    expect(secondUtterance.text.includes('奥左')).toBe(true);
  });

  it('指示文生成で方角・回転を含むこと', () => {
    const text = buildInstructionText('ja', { leg: 'FL', turns: 1.5, direction: 'CCW' });
    expect(text).toContain('手前左');
    expect(text).toContain('反時計回り');
    expect(text).toContain('1回半');
  });

  it('方向ラベルが言語別に返ること', () => {
    expect(getDirectionLabel('ja', 'CW')).toBe('時計回り');
    expect(getDirectionLabel('en', 'CCW')).toBe('counter-clockwise');
  });
});
