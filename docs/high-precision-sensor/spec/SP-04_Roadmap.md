# プロジェクト・ロードマップ

更新日: 2026-02-24

本プロジェクトは「継続的改善」を前提としています。以下は現在の開発計画です。

## ✅ v1.0 : 初期リリース (Completed)

- **コア機能**:
  - 2軸（Pitch/Roll）の同時測定
  - 3段フィルタによるノイズ除去（Kalman + EMA + Deadzone）
  - デジタル角度表示（小数点以下5桁まで）
  - SVGアナログ水準器のリアルタイム描画
- **UX**:
  - 4方向音声フィードバック（Web Audio API）
  - プレミアム・ダークモードUI
- **PWA**:
  - オフライン動作（Service Worker）
  - ホーム画面追加対応

---

## ✅ v1.1 : UX/UI Micro-Improvements (Completed)

- [x] **設定永続化の強化**
  - 音量・フィルタ・表示桁数・静止判定パラメータの復元
- [x] **静止平均ハイブリッド**
  - `LOCKING...` / `MEASURING` モードの導入
- [x] **2点キャリブレーション**
  - 180度回転2点取得でオフセット補正

---

## ✅ v1.2 : Data Logging (Implemented)

- [x] **CSVエクスポート**
  - 録画開始/停止とCSVダウンロードを提供
- [x] **長時間記録耐性**
  - 上限バッファと古いデータの自動破棄を実装

---

## 📅 v1.3 : Reliability & Ops (Next)

- [ ] **2アプリ共存安定化**
  - Service Worker のキャッシュ削除範囲をアプリ単位で分離
- [ ] **E2E拡充**
  - `high-precision-sensor` と `table-level` の双方スモークを継続実行
- [ ] **ドキュメント運用整備**
  - `docs/high-precision-sensor` と `docs/table-level` の分離維持

---

## 🚀 v2.0 : Connectivity (Long-term)

- [ ] **リアルタイム通信**:
  - WebSocketを用いてPC上の親機へデータを送信
  - 遠隔地から設備の水平出しを指示可能に
- [ ] **複数台連携**:
  - 2台のiPhoneを用いて、X-Y平面だけでなくZ軸（ねじれ）も同時測定

---

## ⚠️ 既知の課題 (Known Issues)

- **iOS 13未満の非互換**: `DeviceOrientation API` の仕様変更前の端末では動作しない。
- **温度ドリフト**: センサーの温度特性補正は未実装（ハードウェア依存）。測定ごとのキャリブレーションで対応中。
