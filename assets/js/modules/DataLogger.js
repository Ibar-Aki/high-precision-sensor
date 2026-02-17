export class DataLogger {
    constructor() {
        this.isRecording = false;
        this.startTime = 0;
        this.lastLoggedAt = -Infinity;
        this.dropped = 0;
        this.sampleIntervalMs = 100; // 10Hz
        this.maxRecords = 18000; // 30分相当 (10Hz)
        this._buffer = [];
        this._head = 0;
        this._count = 0;
    }

    get logs() {
        return this._toOrderedArray();
    }

    start() {
        this._buffer = new Array(this.maxRecords);
        this._head = 0;
        this._count = 0;
        this.isRecording = true;
        this.startTime = Date.now();
        this.lastLoggedAt = -Infinity;
        this.dropped = 0;
        console.log("Data logging started");
    }

    stop() {
        this.isRecording = false;
        console.log(`Data logging stopped. Total records: ${this._count}`);
    }

    log(pitch, roll) {
        if (!this.isRecording) return false;
        if (!Number.isFinite(pitch) || !Number.isFinite(roll)) return false;

        // 経過時間(ms)
        const time = Date.now() - this.startTime;
        if (time - this.lastLoggedAt < this.sampleIntervalMs) {
            return false;
        }
        this.lastLoggedAt = time;

        // メモリ節約のため、数値のまま保持しCSV生成時に整形する
        if (this.maxRecords <= 0) {
            this.dropped++;
            return false;
        }

        let index = 0;
        if (this._count < this.maxRecords) {
            index = (this._head + this._count) % this.maxRecords;
            this._count++;
        } else {
            index = this._head;
            this._head = (this._head + 1) % this.maxRecords;
            this.dropped++;
        }

        this._buffer[index] = [time, pitch, roll];
        return true;
    }

    exportCSV() {
        if (this._count === 0) {
            alert("No data to export");
            return;
        }

        // CSVヘッダー
        let csvContent = "Time(ms),Pitch(deg),Roll(deg)\n";

        // データ行
        this._forEachLog(row => {
            csvContent += `${row[0]},${row[1].toFixed(5)},${row[2].toFixed(5)}\n`;
        });

        // Blob作成
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        try {
            // ダウンロードリンク生成
            const link = document.createElement("a");
            link.setAttribute("href", url);

            // ファイル名: sensor_log_YYYYMMDD_HHMMSS.csv
            const now = new Date();
            const filename = `sensor_log_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.csv`;

            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            return filename;
        } finally {
            if (typeof URL.revokeObjectURL === 'function') {
                URL.revokeObjectURL(url);
            }
        }
    }

    getStats() {
        const latest = this._getLatestRecord();
        const durationMs = latest ? latest[0] : 0;
        return {
            count: this._count,
            durationMs,
            dropped: this.dropped
        };
    }

    _forEachLog(callback) {
        for (let i = 0; i < this._count; i++) {
            const index = (this._head + i) % this.maxRecords;
            callback(this._buffer[index], i);
        }
    }

    _toOrderedArray() {
        const ordered = new Array(this._count);
        this._forEachLog((row, i) => {
            ordered[i] = row;
        });
        return ordered;
    }

    _getLatestRecord() {
        if (this._count === 0) return null;
        const index = (this._head + this._count - 1) % this.maxRecords;
        return this._buffer[index];
    }
}
