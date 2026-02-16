# テスト詳細解説（目的・内容・結果1例）

作成日時: 2026-02-15 20:09:54 +09:00  
作成者: Codex+gpt-5.3-codex (codex-cli 0.101.0)
更新日: 2026-02-16

## 1. 本ドキュメントの目的

本ドキュメントは、今回追加・実行したテストについて、以下を「1テストずつ」明確化するための資料です。

1. テスト目的（なぜこのテストが必要か）
2. テスト内容（何をどう確認するか）
3. テスト結果（1例）（実行時にどう確認できたか）

対象は、Unit Test（Vitest）と E2E Smoke（Playwright）です。

---

## 2. E2E Smoke テスト詳細

### 2.1 Service Worker キャッシュ完全性

**テスト目的**

- PWAの致命傷である「オフライン時に必要JSが不足して起動不能」を防ぐため。
- `sw.js` の `ASSETS` に必須資産が漏れなく登録されていることを保証するため。

**テスト内容**

- ブラウザ起動後、`navigator.serviceWorker.getRegistration()` でSW登録を確認。
- `caches.open('tilt-sensor-v4')` からキー一覧を取得。
- 以下資産がすべてキャッシュに存在することを検証。
  - `index.html`
  - `assets/css/style.css`
  - `assets/js/app.js`
  - `assets/js/modules/*.js`（SensorEngine, AudioEngine, UIManager, DataLogger, KalmanFilter1D, SettingsManager）
  - `manifest.json`
  - `icon-192.svg`, `icon-512.svg`

**テスト結果（1例）**

- E2E実行結果JSONの `serviceWorkerCache: "pass"` を確認。
- 欠落がある場合は `ServiceWorkerキャッシュ不足: <path>` で即時失敗する設計。

---

### 2.2 センサー欠損時ステータス遷移

**テスト目的**

- センサー値が途切れた際に、ユーザーへ明示的に異常状態を通知できることを保証するため。
- 「計測中のまま固まって見える」UX不具合を防ぐため。

**テスト内容**

- `DeviceOrientationEvent` をモックし、起動後に1回だけ正常イベントを送信。
- その後、1.2秒間イベント無送信状態にして、ステータス表示を確認。
- `#sensor-status .status-text` が `センサー信号待ち` へ遷移することを検証。

**テスト結果（1例）**

- 無入力1.2秒後に `センサー信号待ち` へ遷移し、E2E判定 `sensorLossRecovery` の前半が成功。

---

### 2.3 センサー復帰時ステータス復帰

**テスト目的**

- 一時的なセンサー喪失後、再入力で正常状態に戻ることを保証するため。
- 異常通知が復帰後も残留し続ける不具合を防ぐため。

**テスト内容**

- 欠損状態確認後、再度 `deviceorientation` イベントを送信。
- `#sensor-status .status-text` が `計測中` に戻ることを確認。

**テスト結果（1例）**

- 復帰イベント送信後に `計測中` を再表示、`sensorLossRecovery: "pass"` を確認。

---

### 2.4 設定保存失敗時Toast通知

**テスト目的**

- `localStorage` 保存不可（容量不足や制限モード）時に、サイレント失敗を防ぐため。
- ユーザーが「設定が保存された」と誤解するリスクを低減するため。

**テスト内容**

- `Storage.prototype.setItem` をモックし、`tilt-sensor-settings` 保存時だけ `QuotaExceededError` を強制発生。
- スライダー入力 + `beforeunload` 発火で `_saveSettings()` を実行。
- `#toast` の文言に `設定の保存に失敗` を含むことを待機確認。
- 併せて `setItem` 呼び出し回数を確認し、テストが実際に保存処理を通過したことを保証。

**テスト結果（1例）**

- Toast文言出現を確認し、`settingsSaveErrorToast: "pass"` になったことを確認。

---

### 2.5 オフライン起動確認

**テスト目的**

- PWAとしての中核要件である「一度読み込んだ後のオフライン起動」を保証するため。

**テスト内容**

- オンライン初回ロードとSWキャッシュ完了後、`context.setOffline(true)` を実施。
- 新規ページで同URLへ遷移。
- `#btn-start` が描画されることを確認し、HTML/主要資産のオフライン復元可否を判定。

**テスト結果（1例）**

- オフライン状態でも起動画面の主要要素が描画され、`offlineBoot: "pass"` を確認。

---

### 2.6 外部フォント依存排除

**テスト目的**

- Google Fonts依存によるオフライン崩れ再発を防ぐため。
- 外部ネットワーク未接続でもUI可読性を維持できることを保証するため。

**テスト内容**

- Playwright `context.on('request')` で全リクエスト監視。
- `fonts.googleapis.com` / `fonts.gstatic.com` を含むURLが1件もないことを検証。

**テスト結果（1例）**

- 実行結果JSONで `externalFontRequests: []`、`externalFontsDisabled: "pass"` を確認。

---

## 3. Unit Test（Vitest）詳細

### 3.1 DataLogger: 10Hz間引き

**テスト目的**

- 長時間運用時のCPU負荷とメモリ増加を抑えるための基礎仕様を保証するため。

**テスト内容**

- Fake Timerで時刻制御。
- 記録開始後、`0ms` で1件記録。
- `50ms` で記録要求（期待: スキップ）。
- `100ms` で記録要求（期待: 記録）。

**テスト結果（1例）**

- 保存件数が2件となり、100ms未満の呼び出しが除外されることを確認。

---

### 3.2 DataLogger: 件数上限で古いデータを削除

**テスト目的**

- 無制限蓄積によるメモリ爆発を防ぐため。

**テスト内容**

- `sampleIntervalMs = 0`、`maxRecords = 3` にして5件記録。
- 先頭（古いデータ）が削除され、最新3件だけ残ることを確認。
- `dropped` カウントが増加することを確認。

**テスト結果（1例）**

- `logs.length = 3`、`logs[0][0] = 2`、`dropped = 2` を確認。

---

### 3.3 SensorEngine: 不正値入力の拒否

**テスト目的**

- センサー値が `NaN/null` など異常値のときに内部状態を壊さないため。

**テスト内容**

- `process(NaN, 1)` を実行。
- 戻り値が `false`、`sampleCount` が増えないことを検証。

**テスト結果（1例）**

- `ok === false`、`sampleCount === 0` を確認。

---

### 3.4 SensorEngine: QuotaExceededError理由コード

**テスト目的**

- ストレージ保存失敗時に、UI側で適切なメッセージ分岐ができるようにするため。

**テスト内容**

- `localStorage.setItem` をモックし `QuotaExceededError` を送出。
- `saveCalibration()` の戻り値を検証。

**テスト結果（1例）**

- `{ ok: false, reason: 'quota_exceeded' }` を確認。

---

### 3.5 SettingsManager: 保存/読込・例外系

**テスト目的**

- 設定永続化責務を分離した `SettingsManager` の正常系/異常系を保証するため。

**テスト内容**

- 正常系: `save` 後 `load` で同値復元できることを検証。
- 異常系: `setItem` で `QuotaExceededError` を強制し、理由コードを検証。

**テスト結果（1例）**

- 正常系: `ok: true` かつ設定値一致。
- 異常系: `{ ok: false, reason: 'quota_exceeded' }` を確認。

---

## 4. 総括

- 今回の自動テストは、「PWAとして壊れやすい領域（オフライン、キャッシュ、外部依存）」と「運用時に顕在化する障害（保存失敗、センサー欠損、ログ膨張）」を重点的にカバーしています。
- 実行結果として、Unit/E2EともにPASSであり、レビューで指摘された主要リスクに対する回帰防止線を構築できています。
- 追加で実機iOS検証（ハードウェアセンサー固有挙動）を組み合わせることで、最終リリース品質をさらに高められます。
