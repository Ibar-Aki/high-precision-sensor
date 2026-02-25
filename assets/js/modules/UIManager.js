/**
 * UI マネージャー
 * DOM操作、数値表示、SVGアナログメーター描画を担当
 */
export class UIManager {
    constructor() {
        // DOM参照
        this.els = {
            pitchLiveValue: document.getElementById('pitch-live-value'),
            pitchFinalValue: document.getElementById('pitch-final-value'),
            rollLiveValue: document.getElementById('roll-live-value'),
            rollFinalValue: document.getElementById('roll-final-value'),
            totalLiveValue: document.getElementById('total-live-value'),
            totalFinalValue: document.getElementById('total-final-value'),
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
            sessionId: document.getElementById('session-id'),
            statusCode: document.getElementById('status-code'),
        };

        this.decimalPlaces = 2;
        this.levelSensitivity = 10; // °
        this._lastPitchBarWidth = '';
        this._lastRollBarWidth = '';
        this._lastBubbleCx = null;
        this._lastBubbleCy = null;
        this._lastBubbleFill = '';
        this._lastArcPitchPath = '';
        this._lastArcRollPath = '';
        this._lastStatusState = '';
        this._lastStatusText = '';
        this._statusTextEl = this.els.sensorStatus?.querySelector('.status-text') ?? null;
    }

    updateAngles({
        livePitch,
        liveRoll,
        liveTotal,
        finalPitch = null,
        finalRoll = null,
        finalTotal = null,
        hasFinal = false
    }, dpOverride = null) {
        const dp = dpOverride ?? this.decimalPlaces;
        const absPitch = Math.abs(livePitch);
        const absRoll = Math.abs(liveRoll);

        // デジタル値
        const pitchText = absPitch.toFixed(dp);
        const rollText = absRoll.toFixed(dp);
        const totalText = liveTotal.toFixed(dp);
        if (this.els.pitchLiveValue.textContent !== pitchText) this.els.pitchLiveValue.textContent = pitchText;
        if (this.els.rollLiveValue.textContent !== rollText) this.els.rollLiveValue.textContent = rollText;
        if (this.els.totalLiveValue.textContent !== totalText) this.els.totalLiveValue.textContent = totalText;

        const pitchFinalText = hasFinal && Number.isFinite(finalPitch) ? Math.abs(finalPitch).toFixed(dp) : '--';
        const rollFinalText = hasFinal && Number.isFinite(finalRoll) ? Math.abs(finalRoll).toFixed(dp) : '--';
        const totalFinalText = hasFinal && Number.isFinite(finalTotal) ? finalTotal.toFixed(dp) : '--';
        if (this.els.pitchFinalValue.textContent !== pitchFinalText) this.els.pitchFinalValue.textContent = pitchFinalText;
        if (this.els.rollFinalValue.textContent !== rollFinalText) this.els.rollFinalValue.textContent = rollFinalText;
        if (this.els.totalFinalValue.textContent !== totalFinalText) this.els.totalFinalValue.textContent = totalFinalText;

        // 方向インジケーター
        this._updateDirection(this.els.pitchDir, livePitch, '前傾', '後傾', '水平');
        this._updateDirection(this.els.rollDir, liveRoll, '右傾', '左傾', '水平');

        // カラーリング
        this._colorizeAngle(this.els.pitchLiveValue, absPitch);
        this._colorizeAngle(this.els.rollLiveValue, absRoll);

        // 角度バー
        const barScale = 10; // ±10°でフル
        const pitchPct = Math.min(absPitch / barScale * 50, 50);
        const rollPct = Math.min(absRoll / barScale * 50, 50);
        const pitchWidth = `${pitchPct}%`;
        const rollWidth = `${rollPct}%`;
        if (this._lastPitchBarWidth !== pitchWidth) {
            this.els.pitchBar.style.width = pitchWidth;
            this._lastPitchBarWidth = pitchWidth;
        }
        if (this._lastRollBarWidth !== rollWidth) {
            this.els.rollBar.style.width = rollWidth;
            this._lastRollBarWidth = rollWidth;
        }

        // SVG バブル
        this._updateBubble(livePitch, liveRoll);

        // 弧
        this._updateArcs(livePitch, liveRoll);
    }

    _updateDirection(el, value, posLabel, negLabel, zeroLabel) {
        const threshold = 0.02;
        let text = zeroLabel;
        let stateClass = 'dir-level';
        if (Math.abs(value) < threshold) {
            text = zeroLabel;
        } else if (value > 0) {
            text = posLabel;
            stateClass = this._directionClassFromLabel(posLabel);
        } else {
            text = negLabel;
            stateClass = this._directionClassFromLabel(negLabel);
        }

        if (el.dataset.directionClass !== stateClass) {
            el.className = 'direction-indicator';
            el.classList.add(stateClass);
            el.dataset.directionClass = stateClass;
        }
        if (el.textContent !== text) {
            el.textContent = text;
        }
    }

    _colorizeAngle(el, absVal) {
        const levelClass = absVal < 0.5 ? 'level-ok' : (absVal < 3 ? 'level-warn' : 'level-danger');
        const prevLevelClass = el.dataset.levelClass;
        if (prevLevelClass === levelClass) return;
        if (prevLevelClass) {
            el.classList.remove(prevLevelClass);
        } else {
            el.classList.remove('level-ok', 'level-warn', 'level-danger');
        }
        el.classList.add(levelClass);
        el.dataset.levelClass = levelClass;
    }

    _updateBubble(pitch, roll) {
        const sens = this.levelSensitivity;
        const cx = Number((150 + Math.max(-120, Math.min(120, (roll / sens) * 120))).toFixed(2));
        const cy = Number((150 + Math.max(-120, Math.min(120, (pitch / sens) * 120))).toFixed(2));
        if (this._lastBubbleCx !== cx) {
            this.els.bubble.setAttribute('cx', cx);
            this._lastBubbleCx = cx;
        }
        if (this._lastBubbleCy !== cy) {
            this.els.bubble.setAttribute('cy', cy);
            this._lastBubbleCy = cy;
        }

        // バブルの色を合成角度に応じて変化
        const total = Math.sqrt(pitch * pitch + roll * roll);
        const hue = Math.max(0, 180 - total * 18); // 180(cyan) → 0(red)
        const fill = `hsl(${hue.toFixed(1)}, 100%, 60%)`;
        if (this._lastBubbleFill !== fill) {
            this.els.bubble.setAttribute('fill', fill);
            this._lastBubbleFill = fill;
        }
    }

    _updateArcs(pitch, roll) {
        // ピッチ弧（垂直方向）
        const pAngle = Math.max(-90, Math.min(90, pitch * 3));
        const pitchPath = this._describeArc(150, 150, 135, -90, -90 + pAngle);
        if (this._lastArcPitchPath !== pitchPath) {
            this.els.arcPitch.setAttribute('d', pitchPath);
            this._lastArcPitchPath = pitchPath;
        }

        // ロール弧（水平方向）
        const rAngle = Math.max(-90, Math.min(90, roll * 3));
        const rollPath = this._describeArc(150, 150, 130, 0, rAngle);
        if (this._lastArcRollPath !== rollPath) {
            this.els.arcRoll.setAttribute('d', rollPath);
            this._lastArcRollPath = rollPath;
        }
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
        if (this._lastStatusState !== state) {
            el.className = 'status-badge status-' + state;
            this._lastStatusState = state;
        }
        if (!this._statusTextEl) {
            this._statusTextEl = el.querySelector('.status-text');
        }
        if (this._statusTextEl && this._lastStatusText !== text) {
            this._statusTextEl.textContent = text;
            this._lastStatusText = text;
        }
    }

    setSessionId(sessionId) {
        if (!this.els.sessionId) return;
        this.els.sessionId.textContent = sessionId || '-';
    }

    setStatusCode(code) {
        if (!this.els.statusCode) return;
        this.els.statusCode.textContent = code || 'UNKNOWN';
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

    _directionClassFromLabel(label) {
        if (label === '前傾') return 'dir-front';
        if (label === '後傾') return 'dir-back';
        if (label === '右傾') return 'dir-right';
        return 'dir-left';
    }
}
