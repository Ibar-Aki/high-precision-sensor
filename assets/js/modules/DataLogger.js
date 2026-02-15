export class DataLogger {
    constructor() {
        this.logs = [];
        this.isRecording = false;
        this.startTime = 0;
        this.lastLoggedAt = -Infinity;
        this.dropped = 0;
        this.sampleIntervalMs = 100; // 10Hz
        this.maxRecords = 18000; // 30分相当 (10Hz)
    }

    start() {
        this.logs = [];
        this.isRecording = true;
        this.startTime = Date.now();
        this.lastLoggedAt = -Infinity;
        this.dropped = 0;
        console.log("Data logging started");
    }

    stop() {
        this.isRecording = false;
        console.log(`Data logging stopped. Total records: ${this.logs.length}`);
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
        if (this.logs.length >= this.maxRecords) {
            this.logs.shift();
            this.dropped++;
        }
        this.logs.push([time, pitch, roll]);
        return true;
    }

    exportCSV() {
        if (this.logs.length === 0) {
            alert("No data to export");
            return;
        }

        // CSVヘッダー
        let csvContent = "Time(ms),Pitch(deg),Roll(deg)\n";

        // データ行
        this.logs.forEach(row => {
            csvContent += `${row[0]},${row[1].toFixed(5)},${row[2].toFixed(5)}\n`;
        });

        // Blob作成
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

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
    }

    getStats() {
        const durationMs = this.logs.length > 0 ? this.logs[this.logs.length - 1][0] : 0;
        return {
            count: this.logs.length,
            durationMs,
            dropped: this.dropped
        };
    }
}
