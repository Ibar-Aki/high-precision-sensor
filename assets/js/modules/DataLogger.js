export class DataLogger {
    constructor() {
        this.logs = [];
        this.isRecording = false;
        this.startTime = 0;
    }

    start() {
        this.logs = [];
        this.isRecording = true;
        this.startTime = Date.now();
        console.log("Data logging started");
    }

    stop() {
        this.isRecording = false;
        console.log(`Data logging stopped. Total records: ${this.logs.length}`);
    }

    log(pitch, roll) {
        if (!this.isRecording) return;

        // 経過時間(ms)
        const time = Date.now() - this.startTime;

        // メモリ節約のため、配列の配列として保存
        // [time, pitch, roll]
        this.logs.push([time, pitch.toFixed(5), roll.toFixed(5)]);
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
            csvContent += `${row[0]},${row[1]},${row[2]}\n`;
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
}
