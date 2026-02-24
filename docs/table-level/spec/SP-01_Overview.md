# 机水平ガイド 概要

作成日時: 2026-02-24 17:41:18 +09:00
作成者: Codex＋GPT-5
更新日: 2026-02-24

## 1. 対象アプリ

- アプリ名: Table Level Guide（机の水平ガイド）
- エントリーポイント: `table-level/index.html`
- Service Worker: `table-level/sw.js`

## 2. 提供機能

1. iPhoneセンサーによるピッチ/ロール計測
2. 静止判定後の自動確定（`measuring`）
3. タイムアウト時の手動確定
4. 4隅ボルト回転量の計算表示
5. 音声読み上げ（対応環境のみ）

## 3. 主要モジュール

1. `table-level/assets/js/app.js`
   - UI制御、測定フロー管理、設定保存/復元
2. `table-level/assets/js/sensor.js`
   - Kalman/EMA/共通静止判定処理（`shared/js/HybridStaticUtils.js` を利用）
3. `table-level/assets/js/hybrid-static-utils.js`
   - 静止判定・バッファ管理の共通ユーティリティ（`shared/` からの再エクスポート）
4. `table-level/assets/js/calculator.js`
   - ボルト回転量算出ロジック
5. `table-level/assets/js/settings.js`
   - 設定のサニタイズと永続化
6. `table-level/assets/js/voice.js`
   - 読み上げ音声の制御

## 4. モード遷移

1. `active`
   - 計測中（静止判定未成立）
2. `locking`
   - 静止判定成立、平均サンプル収集中
3. `measuring`
   - 平均サンプル到達、結果確定可能

## 5. ドキュメント境界

1. 本アプリに関する資料は `docs/table-level/` のみに記載する。
2. 高精度傾斜角センサー本体の資料は `docs/high-precision-sensor/00_INDEX.md` を参照する。
