# 技術スタック説明書: 高精度傾斜角センサー PWA
作成日時: 2026-02-14 01:54:13 +09:00
作成者: Codex＋GPT-5

## 1. 概要
本アプリケーションは、iOS Safari で動作するクライアントサイド完結型 PWA である。構成要素は HTML/CSS/JavaScript の静的配信を基本とし、ブラウザ標準 API を活用して計測・描画・音声出力を実現する。

## 2. 採用技術一覧
1. マークアップ
- HTML5 (`index.html`)

2. スタイリング
- CSS3 (`style.css`)
- Google Fonts（Inter / JetBrains Mono）

3. アプリケーションロジック
- Vanilla JavaScript（ES6+ クラス構文）
- 構成クラス: `KalmanFilter1D`、`SensorEngine`、`AudioEngine`、`UIManager`、`App`

4. センサー/音声 API
- DeviceOrientation API
- Web Audio API

5. PWA 技術
- Web App Manifest (`manifest.json`)
- Service Worker (`sw.js`)
- Cache Storage API

6. 永続化
- LocalStorage

## 3. 採用理由
1. フレームワーク非依存構成
- 起動コストを低減し、保守対象を最小化するため。

2. DeviceOrientation API
- iPhone で端末姿勢を直接取得可能であり、用途要件に整合するため。

3. Web Audio API
- 低レイテンシで周波数・音量・定位を連続制御可能であり、方向音声フィードバック要件を満たすため。

4. Service Worker + Cache Storage
- ネットワーク断時の継続利用性を確保するため。

## 4. 実装アーキテクチャ
- `SensorEngine`: センサー値の補正、フィルタ処理、統計更新
- `AudioEngine`: 方向別オシレータ生成、音色分離、閾値判定
- `UIManager`: 数値表示、方向表示、SVG 更新
- `App`: 権限フロー、イベント接続、レンダリングループ、設定保存/復元

## 5. 依存関係と運用前提
- ビルドツール: 不要（静的ファイル配信のみ）
- サーバー要件: HTTPS 配信（PWA 機能有効化のため）
- 実行環境: iOS Safari 最新系を推奨

## 6. 技術的制約
- DeviceOrientation API の実測値は端末個体差とブラウザ実装差に依存する。
- バックグラウンド時はブラウザ制約により更新頻度が低下し得る。
- LocalStorage は端末環境に依存し、消去・無効化の影響を受ける。

## 7. 保守指針
- キャッシュ資産一覧は実ファイルと常に一致させること。
- パラメータ既定値変更時は `localStorage` 復元互換性を確認すること。
- API 互換性確認時は iOS Safari 実機で最終確認を行うこと。
