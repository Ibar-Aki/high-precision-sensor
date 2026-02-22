import { buildInstructionText, getVoiceMessages } from './i18n.js';

function hasSpeechSupport() {
  return Boolean(
    globalThis.window &&
    globalThis.window.speechSynthesis &&
    typeof globalThis.SpeechSynthesisUtterance !== 'undefined'
  );
}

export class VoiceGuide {
  isSupported() {
    return hasSpeechSupport();
  }

  stop() {
    if (!hasSpeechSupport()) return;
    globalThis.window.speechSynthesis.cancel();
  }

  speakAdjustment(instructions, { language = 'ja', volume = 1 } = {}) {
    if (!hasSpeechSupport()) {
      return { ok: false, reason: 'unsupported' };
    }

    const filtered = (instructions ?? [])
      .filter((item) => item.turns > 0)
      .sort((a, b) => b.turns - a.turns);

    if (filtered.length === 0) {
      return { ok: true, count: 0 };
    }

    const synth = globalThis.window.speechSynthesis;
    const messages = getVoiceMessages(language);

    synth.cancel();

    const intro = this._createUtterance(messages.intro, language, volume);
    synth.speak(intro);

    for (const instruction of filtered) {
      const text = buildInstructionText(language, instruction);
      synth.speak(this._createUtterance(text, language, volume));
    }

    synth.speak(this._createUtterance(messages.remeasure, language, volume));

    return { ok: true, count: filtered.length };
  }

  speakLevelAchieved({ language = 'ja', volume = 1 } = {}) {
    if (!hasSpeechSupport()) {
      return { ok: false, reason: 'unsupported' };
    }
    const synth = globalThis.window.speechSynthesis;
    const messages = getVoiceMessages(language);
    synth.cancel();
    synth.speak(this._createUtterance(messages.done, language, volume));
    return { ok: true };
  }

  _createUtterance(text, language, volume) {
    const utterance = new globalThis.SpeechSynthesisUtterance(text);
    utterance.lang = language === 'en' ? 'en-US' : 'ja-JP';
    utterance.volume = volume;
    utterance.rate = 1;
    utterance.pitch = 1;
    return utterance;
  }
}
