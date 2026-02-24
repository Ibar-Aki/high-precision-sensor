import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataLogger } from '../assets/js/modules/DataLogger.js';

describe('DataLogger', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(0));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        delete global.document;
        delete global.URL;
    });

    it('録画中のみログを保存すること', () => {
        const logger = new DataLogger();
        expect(logger.log(1, 1)).toBe(false);
        expect(logger.logs.length).toBe(0);

        logger.start();
        expect(logger.log(1, 2)).toBe(true);
        expect(logger.logs.length).toBe(1);
    });

    it('10Hzの間引きが有効であること', () => {
        const logger = new DataLogger();
        logger.start();

        expect(logger.log(1, 1)).toBe(true);
        vi.setSystemTime(new Date(50));
        expect(logger.log(2, 2)).toBe(false);
        vi.setSystemTime(new Date(100));
        expect(logger.log(3, 3)).toBe(true);

        expect(logger.logs.length).toBe(2);
    });

    it('件数上限を超えた場合に古いデータを削除すること', () => {
        const logger = new DataLogger();
        logger.sampleIntervalMs = 0;
        logger.maxRecords = 3;
        logger.start();

        for (let i = 0; i < 5; i++) {
            vi.setSystemTime(new Date(i));
            logger.log(i, i);
        }

        expect(logger.logs.length).toBe(3);
        expect(logger.logs[0][0]).toBe(2);
        expect(logger.dropped).toBe(2);
    });

    it('CSV出力時に小数点5桁で整形すること', () => {
        const logger = new DataLogger();
        logger.sampleIntervalMs = 0;
        logger.start();
        logger.log(1.234567, -9.876543);

        const created = [];
        global.URL = {
            createObjectURL: vi.fn(() => 'blob:mock'),
            revokeObjectURL: vi.fn()
        };
        global.document = {
            body: {
                appendChild: vi.fn(),
                removeChild: vi.fn()
            },
            createElement: vi.fn(() => {
                const element = {
                    style: {},
                    attrs: {},
                    setAttribute(key, value) {
                        this.attrs[key] = value;
                    },
                    click: vi.fn()
                };
                created.push(element);
                return element;
            })
        };

        const result = logger.exportCSV();
        expect(result.ok).toBe(true);
        expect(result.filename).toMatch(/^sensor_log_\d{8}_\d{6}\.csv$/);
        expect(created[0].attrs.download).toBe(result.filename);
        expect(document.body.appendChild).toHaveBeenCalled();
        vi.advanceTimersByTime(0);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });

    it('ログが空のときはCSVを出力せず理由コードを返すこと', () => {
        const logger = new DataLogger();
        const result = logger.exportCSV();
        expect(result).toEqual({ ok: false, reason: 'no_data' });
    });
});
