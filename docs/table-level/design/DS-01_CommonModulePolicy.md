# 共通モジュール運用方針（table-level 観点）

作成日時: 2026-02-24 17:41:18 +09:00
作成者: Codex＋GPT-5
更新日: 2026-02-24

## 1. 背景

`High Precision Tilt Sensor` と `Table Level Guide` は同種の数値処理を持つため、重複実装を減らして回帰リスクを下げる。

## 2. 共通化済みモジュール

### 2.1 KalmanFilter1D（第一段）

1. `shared/js/KalmanFilter1D.js`
   - 両アプリの1Dカルマンフィルタ実装を統合
2. 各アプリ側ラッパー
   - `assets/js/modules/KalmanFilter1D.js`
   - `table-level/assets/js/kalman.js`
   - 既存 import 互換を保つため、上記2ファイルは `shared` から再エクスポートする

### 2.2 HybridStaticUtils（第二段、2026-02-24 実施）

1. `shared/js/HybridStaticUtils.js`（106行）
   - 静止判定（分散計算）、動きウィンドウ管理、静止バッファ管理、compactロジック、`toPositiveInt` を統合
   - 状態オブジェクトを引数として受け取る設計により、異なるクラス（`SensorEngine` / `TableLevelSensor`）が同一ロジックを共有
2. 各アプリ側ラッパー
   - `assets/js/modules/HybridStaticUtils.js`
   - `table-level/assets/js/hybrid-static-utils.js`
   - KalmanFilter1D と同じく再エクスポート方式
3. テスト
   - `tests/HybridStaticUtils.test.js`（94行）で共通ロジックを直接検証

## 3. 運用ルール

1. 共通化対象は `shared/js/` に配置する。
2. 既存アプリ側 API 名を維持し、呼び出し側変更を最小化する。
3. 共通モジュール変更時は、両アプリのユニットテストとE2Eを必ず実行する。
4. 互換性に影響する変更は、先にドキュメントへ記載してから実装する。

## 4. 次段候補

1. 設定サニタイズ共通ヘルパー（`_storageErrorReason()` 等の重複解消）
2. 方向ラベルや角度フォーマットの共通化
