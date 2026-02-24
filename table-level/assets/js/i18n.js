const LEG_LABELS = {
  ja: {
    FL: '手前左',
    FR: '手前右',
    BL: '奥左',
    BR: '奥右'
  },
  en: {
    FL: 'front left',
    FR: 'front right',
    BL: 'back left',
    BR: 'back right'
  }
};

const DIRECTION_LABELS = {
  ja: {
    CW: '時計回り',
    CCW: '反時計回り'
  },
  en: {
    CW: 'clockwise',
    CCW: 'counter-clockwise'
  }
};

export function formatTurnsJa(turns) {
  if (turns === 0.5) return '半回';
  if (turns % 1 === 0.5) return `${Math.floor(turns)}回半`;
  return `${turns}回`;
}

export function formatTurnsEn(turns) {
  if (turns === 0.5) return 'half turn';
  if (turns % 1 === 0.5) return `${Math.floor(turns)} and a half turns`;
  return turns === 1 ? '1 turn' : `${turns} turns`;
}

export function buildInstructionText(language, instruction) {
  const lang = language === 'en' ? 'en' : 'ja';
  const legLabel = LEG_LABELS[lang][instruction.leg] ?? instruction.leg;
  const directionLabel = DIRECTION_LABELS[lang][instruction.direction] ?? instruction.direction;

  if (lang === 'en') {
    return `Turn the ${legLabel} leg ${formatTurnsEn(instruction.turns)} ${directionLabel}.`;
  }

  return `${legLabel}の足を${directionLabel}に${formatTurnsJa(instruction.turns)}まわしてください。`;
}

export function getVoiceMessages(language) {
  const lang = language === 'en' ? 'en' : 'ja';
  if (lang === 'en') {
    return {
      intro: 'Measurement complete. Here are your adjustment instructions.',
      done: 'Level achieved. Work is complete.',
      remeasure: 'After adjustment, please re-measure.'
    };
  }

  return {
    intro: '計測が完了しました。調整指示を案内します。',
    done: '水平を達成しました。作業完了です。',
    remeasure: '調整後は再計測してください。'
  };
}

export function getLegLabel(language, leg) {
  const lang = language === 'en' ? 'en' : 'ja';
  return LEG_LABELS[lang][leg] ?? leg;
}

export function getDirectionLabel(language, direction) {
  const lang = language === 'en' ? 'en' : 'ja';
  return DIRECTION_LABELS[lang][direction] ?? direction;
}
