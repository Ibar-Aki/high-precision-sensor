import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SensorEngine } from '../assets/js/modules/SensorEngine.js';

// LocalStorage Mock
const localStorageMock = (function () {
    let store = {};
    return {
        getItem: function (key) {
            return store[key] || null;
        },
        setItem: function (key, value) {
            store[key] = value.toString();
        },
        clear: function () {
            store = {};
        }
    };
})();
// グローバルに定義 (Node環境でwindow.localStorageのエミュレーション)
if (typeof global !== 'undefined') {
    Object.defineProperty(global, 'localStorage', { value: localStorageMock, configurable: true });
}

describe('SensorEngine', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('初期状態は0であること', () => {
        const engine = new SensorEngine();
        expect(engine.pitch).toBe(0);
        expect(engine.roll).toBe(0);
    });

    it('ノイズが除去されること (フィルタリング効果)', () => {
        let engine = new SensorEngine();
        const input = 10.0;

        // 1回目の入力 (初期化によりそのまま出力される)
        engine.process(input, input);
        expect(engine.pitch).toBe(input); // 初回は一致するはず

        // 2回目の入力 (ここからフィルタが効くはず)
        // 同じ値を入れても、カルマンフィルタの状態共分散pが変動するため
        // 完全には一致しない可能性があるが、EMAは前回の値を保持しているので
        // EMA: alpha*10 + (1-alpha)*10 = 10 変わらないはず…？

        // いや、カルマンフィルタは予測ステップで p += q されるので
        // ゲイン k が変わり、値が変動する可能性がある。

        // ノイズ除去効果を見るなら、変動する入力を与えるか、
        // あるいはステップ応答（0 -> 10）の過渡特性を見るべき。

        // リセットしてやり直し
        engine = new SensorEngine();

        // 0の状態で安定させる
        engine.process(0, 0);

        // 10を入力（デッドゾーン 0.005 を確実に超えるまで回す）
        for (let i = 0; i < 10; i++) {
            engine.process(10.0, 10.0);
        }

        // 0 -> 10 への変化なので、フィルタが効いて 10 より小さい値になるはず
        console.log(`Noise test: pitch=${engine.pitch}`);
        expect(engine.pitch).toBeLessThan(10.0);
        expect(engine.pitch).toBeGreaterThan(0.0);

        // 100回繰り返すと近づく (1秒相当)
        for (let i = 0; i < 100; i++) {
            engine.process(10.0, 10.0);
        }

        expect(engine.pitch).toBeCloseTo(10.0, 1);
    });

    it('デッドゾーン内の変化は無視されること', () => {
        const engine = new SensorEngine();

        // 初回 0 (初期化)
        engine.process(0, 0);
        expect(engine.pitch).toBe(0);

        // 0.003度の変化（デッドゾーン 0.005 以下）
        // 数回繰り返しても0のままであるべき
        for (let i = 0; i < 10; i++) {
            engine.process(0.003, 0.003);
        }

        console.log(`Deadzone test: input=0.003, output=${engine.pitch}`);

        // 出力は0のまま (前回値 0 を維持)
        expect(engine.pitch).toBe(0);

        // 0.1度の変化（デッドゾーン超え）
        // EMAの遅延があるため、即座には反映されないかもしれない。
        // 数回回して値が出ることを確認
        let changed = false;
        for (let i = 0; i < 20; i++) {
            engine.process(0.1, 0.1);
            if (engine.pitch !== 0) {
                changed = true;
                break;
            }
        }

        expect(changed).toBe(true);
    });

    it('キャリブレーション機能', () => {
        const engine = new SensorEngine();

        // 5度の傾きがある状態で安定させる
        for (let i = 0; i < 100; i++) {
            engine.process(5.0, 5.0);
        }

        const beforeCalib = engine.pitch;
        expect(beforeCalib).toBeCloseTo(5.0, 1);

        // キャリブレーション実行
        engine.calibrate();

        // 0になるはず
        expect(engine.pitch).toBe(0);

        // その後も5度が入力され続けても0であること
        engine.process(5.0, 5.0);
        expect(engine.pitch).toBeCloseTo(0, 2);

        // 7度になったら 2度と表示されること
        for (let i = 0; i < 50; i++) {
            engine.process(7.0, 7.0);
        }
        expect(engine.pitch).toBeCloseTo(2.0, 1);
    });

    it('キャリブレーション値の永続化', () => {
        // テスト前にストレージクリア
        localStorage.clear();

        let engine = new SensorEngine();

        // 5度の傾き
        for (let i = 0; i < 50; i++) engine.process(5.0, 5.0);

        // キャリブレーション実行 -> 保存されるはず
        engine.calibrate();

        // 保存されたか確認 (モック経由)
        const savedJson = localStorage.getItem('sensor_calibration_v1');
        expect(savedJson).not.toBeNull();
        const saved = JSON.parse(savedJson);
        // calibrate()の実装: this.calibPitch += this.pitch
        // 5度入力状態でpitchは5に近い値。
        expect(saved.calibPitch).toBeGreaterThan(4.0);

        // 新しいインスタンス作成（ロードされるはず）
        const newEngine = new SensorEngine();
        // コンストラクタでロードされる
        expect(newEngine.calibPitch).toBeCloseTo(saved.calibPitch, 5);

        // 新しいエンジンで処理
        // 入力 5.0 -> オフセット 5.0 -> 出力 0
        newEngine.process(5.0, 5.0);
        expect(newEngine.pitch).toBeCloseTo(0, 1);
    });

    it('不正なセンサー値は処理しないこと', () => {
        const engine = new SensorEngine();

        const ok = engine.process(NaN, 1);
        expect(ok).toBe(false);
        expect(engine.sampleCount).toBe(0);
    });

    it('ストレージ容量不足時に理由コードを返すこと', () => {
        const engine = new SensorEngine();
        const quotaError = new Error('quota');
        quotaError.name = 'QuotaExceededError';
        const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            throw quotaError;
        });

        const result = engine.saveCalibration();
        expect(result).toEqual({ ok: false, reason: 'quota_exceeded' });

        setItemSpy.mockRestore();
    });
});
