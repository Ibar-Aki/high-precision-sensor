# High-precision-sensor パフォーマンス修正レポート

作成日時: 2026-02-18 08:03:35 +09:00
作成者: Codex＋GPT-5
更新日: 2026-02-24

## 対象
- プロジェクト: `C:\Users\AKIHIRO\.gemini\antigravity\High-precision-sensor`
- 目的: 既存実装のパフォーマンス懸念（CPU負荷、DOM更新負荷、同期I/O負荷）を低減し、既存機能の回帰を防ぐ

## 主な問題
1. `SensorEngine` のホットパスで `shift` / `reduce` による `O(n)` 処理が毎サンプル発生
2. `UIManager` が値未変化時も毎フレームDOM書き込み（テキスト、クラス、style、SVG属性）
3. `AudioEngine` の speech/off 系で同一サイレンス命令が毎フレーム再発行
4. 設定保存がスライダー `input` ごとに `localStorage.setItem` を同期実行

## 修正内容
### 1) SensorEngine のホットパス最適化
- 変更ファイル: `assets/js/modules/SensorEngine.js`
- 内容:
  - モーションウィンドウを「先頭インデックス + 累積和/二乗和」で管理
  - 分散計算を再走査（`reduce` 2回）から増分更新へ変更
  - 静止平均バッファの先頭削除を `shift` から先頭インデックス方式へ変更
  - 先頭インデックスが進んだ際に配列を定期コンパクションしてメモリ伸長を抑制
- 効果:
  - センサーイベント高頻度時のCPU/GC負荷を低減
  - 長時間稼働時の配列再配置コストを抑制

### 2) UI更新の差分適用化
- 変更ファイル: `assets/js/modules/UIManager.js`
- 内容:
  - 数値テキスト更新を値比較後の差分書き込みへ変更
  - 方向クラス・レベルクラスの再適用を必要時のみ実施
  - バー幅、バブル座標/色、弧パスを前回値比較して差分更新
  - ステータス表示更新で同一状態/文言の再書き込みを回避
- 効果:
  - 無変化フレームのDOM操作を削減し、描画負荷とバッテリー消費を軽減

### 3) AudioEngine の不要更新抑制
- 変更ファイル: `assets/js/modules/AudioEngine.js`
- 内容:
  - `_isSilenced` フラグを導入し、既に無音状態なら `_silenceAll()` を再実行しない
  - 軸が非アクティブな場合は早期リターンして無駄なAudioParam更新を抑制
- 効果:
  - speech/off状態の毎フレーム同一命令を削減し、音声系処理負荷を低減

### 4) 設定保存のデバウンス化
- 変更ファイル: `assets/js/app.js`
- 内容:
  - `_requestSaveSettings()` を導入し、短時間連続入力を200msで集約保存
  - `beforeunload` / `hidden` では `_saveSettingsImmediate()` で即時保存
  - `destroy()` 時に保留タイマーを確実に解除
- 効果:
  - スライダー操作中の同期ストレージ書き込み回数を削減し、UI応答性を改善

## 追加テスト
- 変更ファイル: `tests/AudioEngine.test.js`
  - 読み上げモード中にサイレンス命令が重複発行されないことを検証
- 変更ファイル: `tests/SensorEngine.test.js`
  - 長時間処理でもモーションウィンドウが上限サイズを維持することを検証
  - 静止平均バッファが上限を超えて増えないことを検証

## 実行結果
- `npm test -- --run`
  - 8ファイル / 42テスト成功
- `npm run test:e2e-smoke`
  - 成功（ServiceWorkerキャッシュ、センサー欠損復帰、設定保存エラー通知、オフライン起動を確認）
- `npm run test:e2e:table-level`
  - 成功（ServiceWorkerキャッシュ、自動確定、手動確定、オフライン起動を確認）

## 備考
- 今回は挙動互換を優先して、機能仕様（角度表示、音声読み上げ仕様、キャリブレーション仕様）は変更していません。
