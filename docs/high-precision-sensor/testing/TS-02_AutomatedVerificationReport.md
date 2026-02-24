# 自動検証レポート (E2E Smoke)

作成日時: 2026-02-15 20:08 JST  
作成者: Codex+gpt-5.3-codex (codex-cli 0.101.0)
更新日: 2026-02-16

## 1. 概要

`review/RV-03_HarshCodeReview.md` を起点に実施した修正内容に対して、可能な限り自動化した検証を実施した。  
本レポートは、再現可能なコマンドと結果を記録する。

## 2. 実施コマンド

1. `npm test -- --run`
2. `npm run test:e2e-smoke`

## 3. 自動検証結果

### 3.1 Unit Test (Vitest)

- 実行結果: PASS
- Test Files: 3 passed
- Tests: 13 passed

### 3.2 E2E Smoke (Playwright + Edge Headless)

- 実行結果: PASS
- 対象URL: `http://127.0.0.1:<ephemeral-port>`
- 出力結果:

```json
{
  "checks": {
    "serviceWorkerCache": "pass",
    "sensorLossRecovery": "pass",
    "settingsSaveErrorToast": "pass",
    "offlineBoot": "pass",
    "externalFontsDisabled": "pass"
  },
  "externalFontRequests": []
}
```

## 4. 自動化対象の詳細

1. Service Workerキャッシュ  
`tilt-sensor-v4` に必須アセット（`app.js` と各モジュール、CSS、manifest、icons）が登録済みであることを検証。

2. センサー欠損/復帰  
`DeviceOrientationEvent` をモックし、無入力1.2秒後に `センサー信号待ち`、再入力後に `計測中` へ復帰することを検証。

3. 設定保存失敗通知  
`localStorage.setItem` に `QuotaExceededError` を強制し、保存失敗Toast (`設定の保存に失敗`) が表示されることを検証。

4. オフライン起動  
初回オンライン読込後に `context.setOffline(true)` で再アクセスし、画面描画（`#btn-start` 存在）を検証。

5. 外部フォント依存排除  
`fonts.googleapis.com` / `fonts.gstatic.com` へのリクエストが0件であることを検証。

## 5. 備考

- 今回の検証はローカルEdge Headlessでの自動確認であり、実機iOS Safari固有挙動（実センサーハードウェア依存）は別途実機検証が必要。
