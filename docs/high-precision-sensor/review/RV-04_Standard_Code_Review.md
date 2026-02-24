# 標準コードレビュー（全体）

作成日時: 2026-02-24 19:54:14 +09:00  
作成者: Codex＋GPT-5  
更新日: 2026-02-24

## 1. 対象と前提

- 対象: `High Precision Tilt Sensor` と `Table Level Guide` の両方
- 実行確認: `npm test -- --run`、`npm run test:e2e-smoke`、`npm run test:e2e:table-level` は 2026-02-24 時点で通過
- 本レビューは「重大障害の有無」よりも「将来の改修時に事故を起こしやすい構造」を重視

## 2. 総評

- 現時点で即時の致命障害は見当たりません（自動テストも緑）。
- ただし、運用拡張や機能追加時に回帰を起こしやすい中程度リスクが複数あります。
- 特に Service Worker の手動運用と UI バインディングの集中管理は、規模拡大時のボトルネックです。

## 3. 良い点（維持推奨）

1. 設定値のサニタイズが両アプリで実装済みで、安全側の値丸めができている。  
   根拠: `assets/js/modules/SettingsManager.js:46-123`, `table-level/assets/js/settings.js:77-127`
2. 机水平ガイドは描画ループをアクティブ/アイドルで間引き、無駄な更新を抑制している。  
   根拠: `table-level/assets/js/app.js:319-339`
3. 高精度傾斜計の DataLogger はリングバッファ化済みで、上限到達後も O(1) で更新できる。  
   根拠: `assets/js/modules/DataLogger.js:51-59`
4. 両アプリで E2E によるオフライン起動・主要導線の回帰検知がある。  
   根拠: `tests/e2e-offline-smoke.mjs`, `tests/e2e-table-level-smoke.mjs`

## 4. 指摘事項（優先順）

### M1. Service Worker の手動資産列挙は回帰温床

- 根拠: `sw.js:7-28`, `table-level/sw.js:8-27`
- 問題: ファイル追加時に `APP_SHELL` 追記漏れが起きると、オフラインのみ壊れる回帰が再発しやすい。
- 影響: リリース後に「通常起動はOK、オフラインだけNG」という検出しにくい障害が発生。
- 推奨: ビルド時プリキャッシュ生成（例: Workbox）へ移行し、手動配列編集を廃止。

### M2. 画面イベントとDOM ID依存が集中し、変更耐性が低い

- 根拠: `assets/js/modules/AppEventBinder.js:15-172`
- 問題: 1ファイルにイベント配線・DOM操作・トースト・設定保存トリガが集約。UI変更時に影響範囲が読みにくい。
- 影響: 些細なUI改修で意図しない設定保存やトースト文言破損が起きるリスク。
- 推奨:  
  1. `calibration`、`sound`、`settings` の3系統で binder を分割  
  2. DOM ID 直参照を `UIManager` 経由に統一  
  3. 保存トリガを集中制御（入力系のみ debounce）

### M3. ライフサイクル処理がアプリ間で不揃い

- 根拠: `assets/js/modules/LifecycleManager.js:16-27`, `table-level/assets/js/app.js:141-145`
- 問題: 一方は `beforeunload + visibilitychange`、他方は `pagehide + beforeunload`。終了時動作の設計思想が分裂。
- 影響: 端末・起動形態差で「どのイベントで何を保存するか」が曖昧になり、将来的な保存漏れ調査が難化。
- 推奨: ライフサイクル方針を共通化し、`shared` で運用契約を固定。

### M4. 高精度傾斜計の manifest は SVG アイコンのみ

- 根拠: `manifest.json:11-24`
- 問題: 一部ランチャー/端末で SVG アイコンの扱いが不安定になる可能性。
- 影響: インストール後の見栄え崩れ、採用現場での信頼低下。
- 推奨: PNG (`192/512`) と `purpose: "maskable"` 併記。

### M5. 用語・キー命名のアプリ間差分が大きい

- 根拠: `assets/js/app.js:16-18`, `table-level/assets/js/settings.js:19-24`
- 問題: `staticDurationFrame` / `staticDurationFrames` など、意味が同じ設定の命名が異なる。
- 影響: 共通モジュール化やダッシュボード統合時に変換層が増える。
- 推奨: 共通設定スキーマ（変換マップ込み）を `shared` 配下に定義。

### L1. 本番コードにデバッグログが残存

- 根拠: `assets/js/modules/DataLogger.js:26-31`, `assets/js/modules/SensorEngine.js:101-107,122-126`
- 問題: ログ増加でデバッグしやすい反面、本番でノイズ化しやすい。
- 推奨: ログレベル制御を導入し、既定で `warn/error` のみ出力。

### L2. セキュリティヘッダ/CSPが明示されていない

- 根拠: `index.html:4-16`, `table-level/index.html:3-12`
- 問題: 現在は低リスクだが、将来の外部連携追加時に防御層が薄い。
- 推奨: `Content-Security-Policy` 方針を先に定義（少なくとも `default-src 'self'` 基本線）。

## 5. 優先バックログ（実装順）

1. Service Worker プリキャッシュ自動化（M1）
2. AppEventBinder 分割 + UI参照統合（M2）
3. ライフサイクル共通契約の設計と shared 化（M3）
4. ルートアプリ manifest の PNG/maskable 対応（M4）
5. 共通設定スキーマ導入（M5）
6. ログレベル制御と CSP 基本線追加（L1/L2）

