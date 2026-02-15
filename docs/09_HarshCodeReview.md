# 辛口コードレビュー - 高精度傾斜角センサーPWA（現状反映版）

**レビュー日**: 2026-02-15  
**更新日**: 2026-02-15  
**レビュー範囲**: リポジトリ全体（`HEAD`時点）  
**レビュアー視点**: 辛口・実害優先

---

## 1. 総合評価

### 良い点（前回からの改善）

- Service Workerのプリキャッシュがモジュール群まで拡張され、オフライン起動の致命的欠陥は解消（`sw.js:7-20`）。
- Google Fonts依存を除去し、外部フォント未依存化を確認（`index.html:15`、`assets/css/style.css:28-29`）。
- DataLoggerに10Hz間引きと上限件数が入り、無制限メモリ増加リスクを大幅に低減（`assets/js/modules/DataLogger.js:8-9`）。
- センサー欠損/復帰の状態遷移とToast通知を実装（`assets/js/app.js:181-196`）。
- 保存失敗理由を `quota_exceeded` で返却し、UI通知へ接続済み（`assets/js/modules/SensorEngine.js:75-86`、`assets/js/app.js:353-381`）。
- Unit + E2Eスモークが整備され、回帰検知ラインが強化（`tests/*.test.js`、`tests/e2e-offline-smoke.mjs`）。

---

## 2. 指摘事項（現時点）

### 2.1 重大（High Severity）

#### 🟠 H1. `app.js` の肥大化が進行し、機能追加時の回帰リスクが高い

**ファイル**: `assets/js/app.js`（479行）

**問題**:

- 1クラスで以下を同時に抱えている。
  - センサー制御
  - 音声制御
  - UIイベントバインド
  - 永続化保存
  - Toast表示
  - ライフサイクル管理
- 変更影響範囲が広く、1機能追加で副作用を起こしやすい構造。

**実害**:

- 修正時に「意図せぬ別機能の破壊」が起きやすい。
- テストで網羅しづらく、保守コストが増大する。

**最小修正案**:

1. `ToastManager` と `LifecycleManager` を分離。  
2. `bindEvents` を専用モジュールへ抽出。  
3. `App` は orchestrator（調停役）のみを担当させる。

---

#### 🟠 H2. 録画長時間運用時に `Array.shift()` による性能劣化が起こる

**ファイル**: `assets/js/modules/DataLogger.js:38-39`

```javascript
if (this.logs.length >= this.maxRecords) {
    this.logs.shift();
    this.dropped++;
}
```

**問題**:

- 上限到達後の各サンプルで `shift()` が O(n)。
- 長時間録画では、常時配列詰め直しが発生しやすい。

**実害**:

- 低スペック端末でUIフレーム落ちの温床になる。

**最小修正案**:

- 固定長リングバッファ（head index管理）へ変更し、削除操作を O(1) 化。

---

### 2.2 中程度（Medium Severity）

#### 🟡 M1. Service Workerの手動資産列挙は再発リスクが高い

**ファイル**: `sw.js:7-20`

**問題**:

- 現在は正常だが、将来アセット追加時に手動追記漏れが起こりやすい。

**実害**:

- 新規機能投入時に「オフラインだけ壊れる」回帰を再発しやすい。

**最小修正案**:

- ビルド時にプリキャッシュ一覧を自動生成（Workbox等）する。

---

#### 🟡 M2. テスト対象がロジック中心で、UI層の回帰検出力がまだ弱い

**ファイル**: `tests/` 全体

**問題**:

- `SensorEngine` / `DataLogger` / `SettingsManager` はあるが、`UIManager` と `AudioEngine` の単体テストが不足。

**実害**:

- DOM更新や音声制御の不具合が、E2E頼みになり根因特定に時間がかかる。

**最小修正案**:

- `UIManager` の表示更新ロジック（direction/色/バー幅）をjsdomで検証。
- `AudioEngine` はWebAudio依存部をモックし、`update` の分岐をテスト化。

---

#### 🟡 M3. PWAアイコンがSVGのみで互換性余地が残る

**ファイル**: `manifest.json:13-23`

**問題**:

- PNG / maskable 未提供。
- 端末・ランチャーによってはアイコン表示品質が不安定。

**最小修正案**:

- `192/512 png` と `purpose: "maskable"` のセットを追加。

---

### 2.3 軽微（Low Severity）

#### 🔵 L1. 主要ボタンに `aria-label` が不足

**ファイル**: `index.html:200`, `index.html:207`, `index.html:214`

**問題**:

- `btn-calibrate` / `btn-reset-stats` / `btn-lock` に明示的ラベルがない。

**実害**:

- スクリーンリーダーで操作意図が伝わりにくい。

**最小修正案**:

```html
<button id="btn-calibrate" aria-label="現在の傾きをゼロとしてキャリブレーションする">
```

---

#### 🔵 L2. AudioEngineのマジックナンバーが残存

**ファイル**: `assets/js/modules/AudioEngine.js:98-135`

**問題**:

- `30`, `220`, `660`, `330`, `440`, `0.05` などが意味名なしで散在。

**実害**:

- 調整時に意図の読み違いが起きやすい。

**最小修正案**:

- 定数化 (`MAX_TILT_ANGLE_FOR_AUDIO` 等) とコメント付与。

---

#### 🔵 L3. TypeScript/JSDocの型境界が弱い

**ファイル**: JS全体

**問題**:

- モジュール間の戻り値契約（`{ok, reason}` 等）を型で拘束できていない。

**実害**:

- リファクタ時に静的検出できない不整合が残る。

**最小修正案**:

- まずはJSDoc typedef導入、次段でTS移行。

---

## 3. セキュリティ評価

### 🟢 良好

- 直接的なXSSリスクは低い（主要表示は `textContent`）。
- 外部スクリプト依存は抑制されている。

### 🟡 改善余地

- CSPヘッダー/メタの明示がないため、防御層を追加可能。

---

## 4. パフォーマンス評価

### 🟢 良好

- `requestAnimationFrame` ベースの描画更新。
- ログ取得は録画時限定 + 10Hz間引き。

### 🟡 改善余地

- `DataLogger` の `shift()` 常用領域をリングバッファ化。
- `updateAngles` の差分更新導入でDOM更新頻度をさらに最適化可能。

---

## 5. PWA完成度（現状）

| 項目 | 状態 | 評価 |
|------|------|------|
| Service Worker | ✅ 改善済み | 良 |
| オフライン動作 | ✅ E2Eで確認済み | 良 |
| 外部フォント依存 | ✅ 解消済み | 良 |
| manifest互換性 | 🟡 改善余地 | 中 |
| アップデート通知 | ❌ 未実装 | 低 |

---

## 6. 優先度付き改善タスク（現行版）

### 🔥 高優先（次リリース前）

1. `app.js` の責務分割（イベント/通知/ライフサイクル分離）
2. `DataLogger` のリングバッファ化

### 🔸 中優先

3. UIManager/AudioEngine 単体テスト追加  
4. manifest にPNG/maskableアイコン追加

### 🔹 低優先

5. aria-label整備  
6. AudioEngine定数化  
7. JSDoc/TypeScript段階導入

---

## 7. 総評

**点数**: **82/100**（前回 65/100 から改善）

**評価理由**:

- 前回の致命傷（オフライン起動不可・外部フォント依存）は解消済み。
- ただし、保守性（`app.js` 肥大化）と長時間運用性能（`shift()`）にまだ実害リスクが残る。

**辛口コメント**:
「前回の“PWAとして成立していない”状態からは明確に脱却した。一方で、今のまま機能を積み増すと `app.js` が次のボトルネックになる。今は動くが、将来の変更コストは高い。**品質は回復したが、拡張性はまだ弱い**。」

---

## 8. 対応結果（2026-02-15）

**更新日**: 2026-02-15

### 完了（今回対応）

- H1: `app.js` の責務分割（軽量）
  - `ToastManager` / `LifecycleManager` / `AppEventBinder` を追加し、`App` を調停役中心へ整理。
- H2: `DataLogger` のリングバッファ化
  - `Array.shift()` を廃止し、上限到達時の追記を O(1) 化。
- L1: 主要ボタンの `aria-label` 追加
  - `btn-calibrate` / `btn-reset-stats` / `btn-lock` に明示ラベルを付与。
- L2: `AudioEngine` のマジックナンバー定数化
  - 周波数帯・ゲイン・閾値・ランプ時間を命名定数へ集約。

### 今回見送り（別タスク）

- M1: Service Worker プリキャッシュ一覧の自動生成化（Workbox等）
- M2: `UIManager` / `AudioEngine` の単体テスト拡充
- M3: manifest への PNG / maskable アイコン追加
- L3: JSDoc / TypeScript 段階導入
