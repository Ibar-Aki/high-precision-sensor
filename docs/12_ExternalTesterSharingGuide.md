# 外部テスター共有ガイド（高精度傾斜角センサー）

- 作成日時: 2026-02-15 22:03:35 +09:00
- 作成者: Codex＋GPT-5
- 更新日: 2026-02-16

## 1. 目的

このドキュメントは、外部テスターに本アプリを安全かつ確実に試してもらうための手順をまとめたものです。  
対象は `High-precision-sensor` プロジェクトです。

## 2. 現在の確認状況（2026-02-15 時点）

- ローカルテストは成功済みです。
- `npm test --silent` は全件成功（13 tests）。
- `npm run test:e2e-smoke --silent` は全チェック成功。
- Git ブランチは `main`。
- GitHub remote 設定済み: `https://github.com/Ibar-Aki/high-precision-sensor.git`
- `main` への push 完了（`88e2c72` / 2026-02-15 22:12:37 +09:00）。

## 3. 推奨公開方式

外部テスト配布は、次の順で推奨します。

1. GitHub Pages（推奨）
2. Netlify / Cloudflare Pages（代替）
3. 一時トンネル（短期確認のみ）

理由:
- iPhone の `DeviceOrientation` は HTTPS 前提のため、恒久公開URLが必要です。
- GitHub Pages は無料で安定し、再現性が高いです。

## 4. GitHub Pages で公開する手順

### 4.1 事前準備（ユーザー側）

1. GitHubでリポジトリを用意します。  
2. 本プロジェクトは以下に push 済みです。  
   `https://github.com/Ibar-Aki/high-precision-sensor`

### 4.2 ローカルから push（PowerShell、以後の更新時）

`C:\Users\AKIHIRO\.gemini\antigravity\High-precision-sensor` で以下を実行します。

```powershell
git status
git add .
git commit -m "Prepare external tester distribution"
git push -u origin main
```

補足:
- 既に `origin` 設定済みのため `git remote add origin ...` は不要です。
- 認証は GitHub ログインまたは PAT（Personal Access Token）を使います。

### 4.3 Pages有効化（GitHub画面）

1. リポジトリの `Settings` を開きます。
2. 左メニューの `Pages` を開きます。
3. `Build and deployment` で以下を設定します。
4. `Source`: `Deploy from a branch`
5. `Branch`: `main` / `(root)`
6. `Save` を押します。
7. 数分待って公開URLを取得します。  
   例: `https://<your-account>.github.io/high-precision-sensor/`

## 5. テスターに送る案内文（テンプレート）

以下をそのまま共有できます。

```text
【テストURL】
https://<your-account>.github.io/high-precision-sensor/

【テスト環境】
- iPhone
- Safari

【実施手順】
1) URLをSafariで開く
2) 「センサーを有効にする」をタップ
3) センサー許可ダイアログで「許可」
4) 数値が動くことを確認
5) 必要に応じて右上設定から音量・表示桁数を調整

【不具合時の確認】
- iPhone設定 > Safari > モーションと画面の向きのアクセス がONか
- LOCKが有効化されていないか
```

## 6. テスター回収フォーマット（推奨）

フィードバックは次の形式で回収してください。

```text
端末:
iOSバージョン:
Safariバージョン:
日時:

実施内容:
期待結果:
実際結果:
再現手順:
スクリーンショット/動画:
```

## 7. こちら側で対応可能な範囲

対応済み:
- 配布手順の具体化
- テスター向け案内テンプレート作成
- 回収フォーマット作成
- 配布前のテスト確認結果の整理
- GitHub `main` への push 実施

ユーザー操作が必要:
- Pages有効化（Web画面操作）

## 8. 短期テスト用（一時トンネル）

恒久公開の前に短時間だけ共有する場合の方法です。

```powershell
npm run iphone:test
```

注意:
- PC停止でURLが無効になります。
- 長期利用には非推奨です。
- `iphone:test` はローカルサーバー（4173）と `localtunnel` を同時起動します。
- 代替として2ターミナル構成も可能です。

```powershell
# ターミナル1
npm run serve:iphone

# ターミナル2
npm run tunnel:iphone
```
