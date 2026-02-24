# 2点キャリブレーション設計書

作成日時: 2026-02-16 00:27:20 +09:00  
作成者: Codex＋GPT-5  
更新日: 2026-02-16

## 1. 目的

現行の1点キャリブレーション（現在値を0に合わせる）に加えて、同一面で iPhone を表向きのまま 180 度回転させて2点取得し、オフセット誤差をより安定に推定する。

## 2. 想定ユーザーフロー

1. センサーをほぼ水平な面に「表向き」で置く。
2. `2点校正` ボタンを押す（1点目取得）。
3. iPhone を表向きのまま 180 度回転させる。
4. 同じ `2点校正` ボタンを再度押す（2点目取得・完了）。

## 3. アルゴリズム

### 3.1 モデル

- 1点目観測値: `m1 = t + b`
- 2点目観測値: `m2 = -t + b`
- `t`: 実際の傾き成分、`b`: センサーオフセット

2式の平均より:

- `b = (m1 + m2) / 2`

Pitch/Roll それぞれに適用し、既存の `calibPitch`, `calibRoll` に加算する。

### 3.2 取得条件

- 取得時は `measurementMode` が `locking` または `measuring`（静止判定成立中）であること。
- 非静止時は取得を拒否し、UIで再試行を促す。

### 3.3 タイムアウト

- 1点目取得後、30秒以内に2点目を取得できなければキャンセル。

## 4. 状態設計

`SensorEngine` 内に2点校正ステートを持つ。

- `idle`: 未開始
- `awaiting_first`: 開始済み、1点目待ち
- `awaiting_second`: 1点目取得済み、2点目待ち

補助データ:

- `firstPoint: { pitch, roll } | null`
- `startedAt: number (ms epoch)`
- `timeoutMs: number`

## 5. 公開API設計

- `startTwoPointCalibration()`
  - 状態を `awaiting_first` に初期化
- `captureTwoPointCalibrationPoint()`
  - `awaiting_first` なら1点目取得して `awaiting_second`
  - `awaiting_second` なら補正計算・保存・完了
- `cancelTwoPointCalibration()`
  - 状態を `idle` に戻す
- `getTwoPointCalibrationState()`
  - 現在状態、経過時間、残り時間を返す

## 6. UI/UX設計

### 6.1 ボタン

- 既存 `キャリブレーション`（1点）は維持
- 追加 `2点校正` ボタン（専用）

### 6.2 トースト文言

- 1点目成功:
  - `2点校正 1/2 完了。iPhoneを表向きのまま180度回転して再度押してください`
- 完了:
  - `2点キャリブレーション完了`
- 非静止:
  - `静止状態で実行してください（LOCKING...またはMEASURING）`
- タイムアウト:
  - `2点キャリブレーションがタイムアウトしました。最初からやり直してください`

## 7. 永続化設計

- 既存キー `sensor_calibration_v1` を継続使用
- 保存内容は `calibPitch`, `calibRoll` を必須とし、後方互換を維持

## 8. テスト設計

### 8.1 ユニットテスト（`tests/SensorEngine.test.js`）

- 正常系: 1点目 -> 2点目で完了し、補正値が更新される
- 異常系: 非静止で `not_stable` を返す
- 異常系: タイムアウトで `timeout` を返す
- 制御系: `cancelTwoPointCalibration` 後に `idle` へ戻る

### 8.2 E2Eスモーク（`tests/e2e-offline-smoke.mjs`）

- `#btn-calibrate-2pt` が表示される
- 既存スモーク項目（起動/センサー欠損復帰/保存失敗通知/オフライン起動）が回帰しない

## 9. 実装対象ファイル

- `assets/js/modules/SensorEngine.js`
- `assets/js/modules/AppEventBinder.js`
- `assets/js/app.js`
- `index.html`
- `assets/css/style.css`（必要最小限）
- `tests/SensorEngine.test.js`
- `tests/e2e-offline-smoke.mjs`
- `docs/high-precision-sensor/01_UserManual.md`
- `docs/high-precision-sensor/02_TechnicalSpec.md`
- `docs/high-precision-sensor/06_DevGuide.md`
