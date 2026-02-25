import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { UIManager } from '../assets/js/modules/UIManager.js';

describe('UIManager', () => {
  let originalDocument;

  beforeEach(() => {
    originalDocument = global.document;
    global.document = {
      getElementById: () => null
    };
  });

  afterEach(() => {
    if (originalDocument === undefined) {
      delete global.document;
    } else {
      global.document = originalDocument;
    }
  });

  it('decimalPlaces の既定値が 2 であること', () => {
    const ui = new UIManager();
    expect(ui.decimalPlaces).toBe(2);
  });
});
