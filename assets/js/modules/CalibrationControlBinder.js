const STEP_TEXT = {
    idle: '待機中',
    awaiting_first: 'ステップ1/2: 1点目を記録',
    awaiting_second: 'ステップ2/2: 2点目を記録',
    completed: '完了'
};

const BUTTON_TEXT = {
    idle: '2点校正を開始',
    awaiting_first: '1点目を記録',
    awaiting_second: '2点目を記録',
    completed: '2点校正を開始'
};

export class CalibrationControlBinder {
    constructor({ sensor, onToast, onStorageError, onStatusCode, onFlashCalibrated }) {
        this.sensor = sensor;
        this.onToast = onToast;
        this.onStorageError = onStorageError;
        this.onStatusCode = onStatusCode;
        this.onFlashCalibrated = onFlashCalibrated;
        this._els = {
            singleButton: document.getElementById('btn-calibrate'),
            twoPointButton: document.getElementById('btn-calibrate-2pt'),
            stepText: document.getElementById('two-point-step-text'),
            guideText: document.getElementById('two-point-guide-text'),
        };
    }

    bind(addListener) {
        this._setStepUi('idle', '端末を静止させた状態で実行してください。');

        addListener(this._els.singleButton, 'click', () => {
            const result = this.sensor.calibrate();
            this.onFlashCalibrated?.();
            if (result && !result.ok) {
                this.onToast?.('キャリブレーションを適用しましたが保存に失敗しました');
                this.onStorageError?.('キャリブレーション保存', result.reason);
                this.onStatusCode?.('CAL1P_SAVE_FAILED');
                return;
            }
            this.onToast?.('キャリブレーション完了');
            this.onStatusCode?.('CAL1P_DONE');
        });

        addListener(this._els.twoPointButton, 'click', () => {
            this._handleTwoPointCalibration();
        });
    }

    _handleTwoPointCalibration() {
        const state = this.sensor.getTwoPointCalibrationState?.() ?? { step: 'idle' };

        if (state.step === 'idle') {
            this.sensor.startTwoPointCalibration();
            this._setStepUi('awaiting_first', '端末を静止させ、ボタンを押して1点目を記録してください。');
            this.onToast?.('2点校正を開始しました');
            this.onStatusCode?.('CAL2P_STEP1_PENDING');
            return;
        }

        const result = this.sensor.captureTwoPointCalibrationPoint();
        if (result.done) {
            this.onFlashCalibrated?.();
            if (!result.ok) {
                this.onToast?.('2点キャリブレーションを適用しましたが保存に失敗しました');
                this.onStorageError?.('2点キャリブレーション保存', result.reason);
                this._setStepUi('idle', '保存失敗のため、必要に応じて再実行してください。');
                this.onStatusCode?.('CAL2P_SAVE_FAILED');
                return;
            }
            this.onToast?.('2点キャリブレーション完了');
            this._setStepUi('completed', '完了しました。必要に応じて再実行できます。');
            this.onStatusCode?.('CAL2P_DONE');
            return;
        }

        if (!result.ok) {
            if (result.reason === 'not_stable') {
                this._setStepUi(state.step, '静止状態を維持してから再試行してください。');
                this.onToast?.('静止状態で実行してください（安定化中または確定値の状態）');
                this.onStatusCode?.('CAL2P_NOT_STABLE');
                return;
            }
            if (result.reason === 'timeout') {
                this._setStepUi('idle', 'タイムアウトしました。最初からやり直してください。');
                this.onToast?.('2点キャリブレーションがタイムアウトしました。最初からやり直してください');
                this.onStatusCode?.('CAL2P_TIMEOUT');
                return;
            }
            this._setStepUi('idle', '開始できませんでした。最初からやり直してください。');
            this.onToast?.('2点キャリブレーションを開始できませんでした');
            this.onStatusCode?.('CAL2P_FAILED');
            return;
        }

        if (result.step === 'awaiting_second') {
            this.onFlashCalibrated?.();
            this._setStepUi(
                'awaiting_second',
                'iPhoneを表向きのまま180度回転し、静止後にボタンを押して2点目を記録してください。'
            );
            this.onToast?.('1点目を記録しました。2点目を記録してください');
            this.onStatusCode?.('CAL2P_STEP2_PENDING');
        }
    }

    _setStepUi(step, guide) {
        if (this._els.stepText) {
            this._els.stepText.textContent = STEP_TEXT[step] ?? STEP_TEXT.idle;
        }
        if (this._els.guideText) {
            this._els.guideText.textContent = guide;
        }
        if (this._els.twoPointButton) {
            this._els.twoPointButton.childNodes.forEach((node) => {
                if (node.nodeType === 3) {
                    node.remove();
                }
            });
            this._els.twoPointButton.append(` ${BUTTON_TEXT[step] ?? BUTTON_TEXT.idle}`);
        }
    }
}
