/**
 * UI マネージャー
 * DOM操作、数値表示、SVGアナログメーター描画を担当
 */
export class UIManager {
    constructor() {
        // DOM参照
        this.els = {
            pitchValue: document.getElementById('pitch-value'),
            rollValue: document.getElementById('roll-value'),
            totalValue: document.getElementById('total-value'),
            pitchDir: document.getElementById('pitch-direction'),
            rollDir: document.getElementById('roll-direction'),
            pitchBar: document.getElementById('pitch-bar'),
            rollBar: document.getElementById('roll-bar'),
            maxPitch: document.getElementById('max-pitch'),
            maxRoll: document.getElementById('max-roll'),
            sampleCount: document.getElementById('sample-count'),
            bubble: document.getElementById('bubble'),
            arcPitch: document.getElementById('arc-pitch'),
            arcRoll: document.getElementById('arc-roll'),
            sensorStatus: document.getElementById('sensor-status'),
            sensorInfo: document.getElementById('sensor-info'),
        };

        this.decimalPlaces = 3;
        this.levelSensitivity = 10; // °
    }

    updateAngles(pitch, roll, total, dpOverride = null) {
        const dp = dpOverride ?? this.decimalPlaces;

        // デジタル値
        this.els.pitchValue.textContent = Math.abs(pitch).toFixed(dp);
        this.els.rollValue.textContent = Math.abs(roll).toFixed(dp);
        this.els.totalValue.textContent = total.toFixed(dp);

        // 方向インジケーター
        this._updateDirection(this.els.pitchDir, pitch, '前傾', '後傾', '水平');
        this._updateDirection(this.els.rollDir, roll, '右傾', '左傾', '水平');

        // カラーリング
        this._colorizeAngle(this.els.pitchValue, Math.abs(pitch));
        this._colorizeAngle(this.els.rollValue, Math.abs(roll));

        // 角度バー
        const barScale = 10; // ±10°でフル
        const pitchPct = Math.min(Math.abs(pitch) / barScale * 50, 50);
        const rollPct = Math.min(Math.abs(roll) / barScale * 50, 50);
        this.els.pitchBar.style.width = `${pitchPct}%`;
        this.els.rollBar.style.width = `${rollPct}%`;

        // SVG バブル
        this._updateBubble(pitch, roll);

        // 弧
        this._updateArcs(pitch, roll);
    }

    _updateDirection(el, value, posLabel, negLabel, zeroLabel) {
        const threshold = 0.02;
        el.className = 'direction-indicator';
        if (Math.abs(value) < threshold) {
            el.textContent = zeroLabel;
            el.classList.add('dir-level');
        } else if (value > 0) {
            el.textContent = posLabel;
            // pitch>0 → 後傾, roll>0 → 右傾 — ラベルに応じたクラス
            if (posLabel === '前傾') el.classList.add('dir-front');
            else if (posLabel === '後傾') el.classList.add('dir-back');
            else if (posLabel === '右傾') el.classList.add('dir-right');
            else el.classList.add('dir-left');
        } else {
            el.textContent = negLabel;
            if (negLabel === '前傾') el.classList.add('dir-front');
            else if (negLabel === '後傾') el.classList.add('dir-back');
            else if (negLabel === '右傾') el.classList.add('dir-right');
            else el.classList.add('dir-left');
        }
    }

    _colorizeAngle(el, absVal) {
        el.classList.remove('level-ok', 'level-warn', 'level-danger');
        if (absVal < 0.5) el.classList.add('level-ok');
        else if (absVal < 3) el.classList.add('level-warn');
        else el.classList.add('level-danger');
    }

    _updateBubble(pitch, roll) {
        const sens = this.levelSensitivity;
        const cx = 150 + Math.max(-120, Math.min(120, (roll / sens) * 120));
        const cy = 150 + Math.max(-120, Math.min(120, (pitch / sens) * 120));
        this.els.bubble.setAttribute('cx', cx);
        this.els.bubble.setAttribute('cy', cy);

        // バブルの色を合成角度に応じて変化
        const total = Math.sqrt(pitch * pitch + roll * roll);
        const hue = Math.max(0, 180 - total * 18); // 180(cyan) → 0(red)
        this.els.bubble.setAttribute('fill', `hsl(${hue}, 100%, 60%)`);
    }

    _updateArcs(pitch, roll) {
        // ピッチ弧（垂直方向）
        const pAngle = Math.max(-90, Math.min(90, pitch * 3));
        this.els.arcPitch.setAttribute('d', this._describeArc(150, 150, 135, -90, -90 + pAngle));

        // ロール弧（水平方向）
        const rAngle = Math.max(-90, Math.min(90, roll * 3));
        this.els.arcRoll.setAttribute('d', this._describeArc(150, 150, 130, 0, rAngle));
    }

    _describeArc(cx, cy, r, startAngle, endAngle) {
        if (Math.abs(endAngle - startAngle) < 0.1) return '';
        const start = this._polarToCartesian(cx, cy, r, endAngle);
        const end = this._polarToCartesian(cx, cy, r, startAngle);
        const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
        const sweep = endAngle > startAngle ? 1 : 0;
        return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
    }

    _polarToCartesian(cx, cy, r, angleDeg) {
        const rad = (angleDeg - 90) * Math.PI / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }

    updateStats(maxPitch, maxRoll, sampleCount) {
        const dp = this.decimalPlaces;
        this.els.maxPitch.textContent = Math.abs(maxPitch).toFixed(dp) + '°';
        this.els.maxRoll.textContent = Math.abs(maxRoll).toFixed(dp) + '°';
        this.els.sampleCount.textContent = sampleCount.toLocaleString();
    }

    setStatus(state, text) {
        const el = this.els.sensorStatus;
        el.className = 'status-badge status-' + state;
        el.querySelector('.status-text').textContent = text;
    }

    createRecordingButton(onStart, onStop) {
        const container = document.createElement('div');
        container.id = 'recording-controls';

        const btn = document.createElement('button');
        btn.id = 'btn-record';
        btn.className = 'record-button';
        btn.innerHTML = '<span class="record-icon">●</span>';

        btn.addEventListener('click', () => {
            if (btn.classList.contains('recording')) {
                // Stop
                btn.classList.remove('recording');
                onStop();
            } else {
                // Start
                btn.classList.add('recording');
                onStart();
            }
        });

        container.appendChild(btn);
        document.body.appendChild(container);
        return btn;
    }

    showDownloadButton(filename) {
        let btn = document.getElementById('btn-download-csv');
        // 自動ダウンロード方式にするため、ボタンは表示せず通知だけにすることも可能だが、
        // ユーザーがキャンセルした場合なども考慮し、ダウンロードボタンを一時的に出しても良い。
        // 今回は DataLogger が自動ダウンロードトリガーまでする仕様にしたので、
        // ここでは「録画停止中」への復帰のみ行う。

        const recBtn = document.getElementById('btn-record');
        if (recBtn) recBtn.classList.remove('recording');

        this.statusToast(`Saved: ${filename}`);
    }

    statusToast(msg) {
        window.dispatchEvent(new CustomEvent('app:toast', {
            detail: { message: msg }
        }));
    }
}
