import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../assets/js/modules/AudioEngine.js';

const createAudioParam = () => {
    const param = {
        value: 0,
        setTargetAtTime: vi.fn((v) => {
            param.value = v;
        })
    };
    return param;
};

class FakeGainNode {
    constructor() {
        this.gain = createAudioParam();
    }

    connect() { }
}

class FakeOscillatorNode {
    constructor() {
        this.type = 'sine';
        this.frequency = createAudioParam();
        this.start = vi.fn();
        this.stop = vi.fn();
    }

    connect() { }
}

class FakeStereoPannerNode {
    constructor() {
        this.pan = createAudioParam();
    }

    connect() { }
}

class FakeAudioContext {
    constructor() {
        this.currentTime = 0;
        this.state = 'running';
        this.destination = {};
        this.close = vi.fn();
        this.resume = vi.fn(() => {
            this.state = 'running';
        });
    }

    createGain() {
        return new FakeGainNode();
    }

    createOscillator() {
        return new FakeOscillatorNode();
    }

    createStereoPanner() {
        return new FakeStereoPannerNode();
    }
}

describe('AudioEngine', () => {
    const originalWindow = global.window;
    const originalStereoPannerNode = global.StereoPannerNode;
    const originalSpeechUtterance = global.SpeechSynthesisUtterance;

    const speechSynthesisMock = {
        speak: vi.fn(),
        cancel: vi.fn(),
        speaking: false
    };

    beforeEach(() => {
        vi.useFakeTimers();
        speechSynthesisMock.speak.mockClear();
        speechSynthesisMock.cancel.mockClear();
        speechSynthesisMock.speaking = false;

        global.StereoPannerNode = function MockStereoPannerNode() { };
        global.SpeechSynthesisUtterance = class MockSpeechSynthesisUtterance {
            constructor(text) {
                this.text = text;
                this.lang = '';
                this.volume = 1;
                this.rate = 1;
                this.pitch = 1;
            }
        };

        global.window = {
            AudioContext: FakeAudioContext,
            webkitAudioContext: FakeAudioContext,
            setInterval,
            clearInterval,
            speechSynthesis: speechSynthesisMock
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        if (originalWindow === undefined) {
            delete global.window;
        } else {
            global.window = originalWindow;
        }
        if (originalStereoPannerNode === undefined) {
            delete global.StereoPannerNode;
        } else {
            global.StereoPannerNode = originalStereoPannerNode;
        }
        if (originalSpeechUtterance === undefined) {
            delete global.SpeechSynthesisUtterance;
        } else {
            global.SpeechSynthesisUtterance = originalSpeechUtterance;
        }
    });

    it('読み上げ音モードで10秒ごとに0.1度単位の文言を読み上げること', () => {
        const engine = new AudioEngine();
        engine.enabled = true;
        engine.setOutputType('speech');
        engine.init();

        engine.update(-0.14, -0.48);
        vi.advanceTimersByTime(10000);

        expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);
        const first = speechSynthesisMock.speak.mock.calls[0][0];
        expect(first.text).toBe('前上がり0.1度、左上がり0.5度');
        expect(first.lang).toBe('ja-JP');
        expect(first.volume).toBe(0.5);

        engine.update(0.44, 2.26);
        vi.advanceTimersByTime(10000);
        expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(2);
        const second = speechSynthesisMock.speak.mock.calls[1][0];
        expect(second.text).toBe('後ろ上がり0.4度、右上がり2.3度');
    });

    it('OFFモードでは読み上げを停止し、追加読み上げを行わないこと', () => {
        const engine = new AudioEngine();
        engine.enabled = true;
        engine.setOutputType('speech');
        engine.init();
        engine.update(1.2, -0.7);

        vi.advanceTimersByTime(10000);
        expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);

        engine.setOutputType('off');
        expect(speechSynthesisMock.cancel).toHaveBeenCalled();

        vi.advanceTimersByTime(30000);
        expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);
    });

    it('通常の音モードでは既存の閾値設定が有効なこと', () => {
        const engine = new AudioEngine();
        engine.enabled = true;
        engine.init();
        engine.setOutputType('normal');
        engine.setMode('threshold');
        engine.threshold = 5.0;

        engine.update(1.0, 1.0);
        vi.advanceTimersByTime(10000);

        expect(speechSynthesisMock.speak).not.toHaveBeenCalled();
        expect(engine.gains.front.gain.setTargetAtTime).toHaveBeenCalled();
        expect(engine.gains.back.gain.setTargetAtTime).toHaveBeenCalled();
    });

    it('マスターミュートで読み上げが止まること', () => {
        const engine = new AudioEngine();
        engine.enabled = true;
        engine.setOutputType('speech');
        engine.init();
        engine.update(-0.2, 0.3);

        vi.advanceTimersByTime(10000);
        expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);

        const enabled = engine.toggle();
        expect(enabled).toBe(false);
        vi.advanceTimersByTime(20000);
        expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);
        expect(speechSynthesisMock.cancel).toHaveBeenCalled();
    });
});
