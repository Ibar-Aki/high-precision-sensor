import { describe, expect, it } from 'vitest';
import { refreshSoundSettingsVisibility } from '../assets/js/modules/SoundSettingsVisibility.js';

describe('SoundSettingsVisibility', () => {
  function createDoc() {
    const nodes = {
      'normal-sound-settings': { style: { display: '' } },
      'threshold-setting': { style: { display: '' } }
    };
    return {
      nodes,
      getElementById(id) {
        return this.nodes[id] ?? null;
      }
    };
  }

  it('normal + threshold のとき両方を表示すること', () => {
    const doc = createDoc();
    refreshSoundSettingsVisibility({ outputType: 'normal', mode: 'threshold' }, doc);
    expect(doc.nodes['normal-sound-settings'].style.display).toBe('block');
    expect(doc.nodes['threshold-setting'].style.display).toBe('block');
  });

  it('normal + continuous のとき閾値設定のみ非表示にすること', () => {
    const doc = createDoc();
    refreshSoundSettingsVisibility({ outputType: 'normal', mode: 'continuous' }, doc);
    expect(doc.nodes['normal-sound-settings'].style.display).toBe('block');
    expect(doc.nodes['threshold-setting'].style.display).toBe('none');
  });

  it('speech/off では関連設定を非表示にすること', () => {
    const doc = createDoc();
    refreshSoundSettingsVisibility({ outputType: 'speech', mode: 'threshold' }, doc);
    expect(doc.nodes['normal-sound-settings'].style.display).toBe('none');
    expect(doc.nodes['threshold-setting'].style.display).toBe('none');
  });
});