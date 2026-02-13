# iOS検証報告書（可能範囲）
作成日時: 2026-02-14 01:54:13 +09:00
作成者: Codex＋GPT-5

## 1. 検証方針
本環境では iOS 実機接続が不可能であるため、以下の範囲で代替検証を実施した。
- コード上の権限フロー実装確認
- PWA 必須資産の配信確認
- Service Worker/Manifest 参照整合確認

## 2. 実施結果

### 2.1 権限フロー（コード実装確認）
- `DeviceOrientationEvent.requestPermission()` 呼び出し実装を確認。
- 権限拒否時のアラート表示分岐を確認。
- DeviceOrientation API 非対応時のエラーハンドリングを確認。
- 重複起動防止ガードおよび無効値除外（`Number.isFinite`）実装を確認。

確認箇所:
- `app.js` の `start()` および `_onOrientation()` 実装

### 2.2 センサー追従性（代替確認）
- 実機傾斜操作による追従性評価は未実施（環境制約）。
- 代替として、フィルタ連鎖構造（Kalman -> EMA -> Deadzone）および描画ループ連続更新を確認。

### 2.3 PWA インストール前提確認
- `index.html` から `manifest.json` が参照されることを確認。
- `serviceWorker.register('./sw.js')` 実装を確認。
- ローカル HTTP 配信で主要資産が HTTP 200 を返すことを確認。

取得結果（HTTP 200）:
- `/index.html`
- `/manifest.json`
- `/sw.js`
- `/app.js`
- `/style.css`
- `/icons/icon-192.svg`
- `/icons/icon-512.svg`

## 3. 結論
- 実機検証の前提条件（実装および配信資産）は概ね成立している。
- ただし、最終判定（権限UI挙動、体感追従性、ホーム画面追加の成功）は iOS 実機でのみ確定可能である。

## 4. 未実施項目
- iOS Safari 実機での権限許諾操作
- 実傾斜時の追従性・安定性評価
- 実機でのホーム画面追加およびオフライン起動確認
