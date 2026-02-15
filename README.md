# High Precision Tilt Sensor PWA (高精度傾斜角センサー)

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Platform: iOS](https://img.shields.io/badge/Platform-iOS-blue.svg)

iPhoneの内蔵センサーを利用して、設備の傾きを高精度に測定するためのプログレッシブウェブアプリ（PWA）です。
カルマンフィルタと指数移動平均（EMA）を組み合わせた高度なノイズ除去により、安定した測定を実現しています。

## 🎯 特徴

- **高精度**: 最新のデジタルフィルタ技術で「ふらつき」を抑制（分解能 0.01°）
- **音声ガイド**: 画面を見ずに傾きを知る4方向フィードバック音（Web Audio API）
- **PWA**: アプリインストール不要。ブラウザで開くだけで動作し、ホーム画面に追加可能
- **プレミアムUI**: ダークモード、グラスモーフィズムデザイン

## 📂 ディレクトリ構成

整理された構成により、メンテナンス性を高めています。

```text
High-precision-sensor/
├── assets/          # CSS, JS, Iconリソース
├── docs/            # マニュアル、技術仕様書、ロードマップ
│   ├── 01_UserManual.md        # ユーザーガイド
│   ├── 02_TechnicalSpec.md     # フィルタロジック数式解説
│   ├── 03_AccuracyReport.md    # 精度検証レポート
│   ├── 04_VerificationMethod.md# 検証手順書
│   └── 05_Roadmap.md           # 開発計画
├── index.html       # メイン画面
└── sw.js            # PWA Service Worker
```

## 📲 インストール方法（iPhone）

1. Safariでデプロイ先URL（GitHub Pages等）を開く
2. 画面下部の共有ボタン（□↑）をタップ
3. 「ホーム画面に追加」を選択
4. ホーム画面のアイコンから起動

## 🛠️ 開発者向け

詳細な技術仕様や検証方法は `docs/` ディレクトリ内のドキュメントを参照してください。
特に `04_VerificationMethod.md` には、定盤やブロックゲージを用いた検証手順が記載されています。

## License

This project is licensed under the MIT License - see the `LICENSE` file for details.
