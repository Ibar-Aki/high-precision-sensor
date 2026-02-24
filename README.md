# High Precision Tilt Sensor PWA (高精度傾斜角センサー)

更新日: 2026-02-24

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Platform: iOS](https://img.shields.io/badge/Platform-iOS-blue.svg)

iPhoneの内蔵センサーを利用した、2つのPWAを同一リポジトリで管理しています。

1. `High Precision Tilt Sensor`（高精度傾斜計）
2. `Table Level Guide`（机水平ガイド）

## 🎯 特徴

- **高精度計測**: Kalman + EMA + Deadzone + 静止平均ハイブリッド
- **音声案内**: 通常音/読み上げ音の切替
- **PWA対応**: オフライン起動、ホーム画面追加
- **2アプリ運用**: 計測用途と机水平用途を分離

## 📂 ディレクトリ構成

```text
High-precision-sensor/
├── index.html
├── assets/                         # High Precision Tilt Sensor の実装
├── table-level/                    # Table Level Guide の実装
├── shared/js/                      # 両アプリ共通モジュール
│   ├── KalmanFilter1D.js           #   1Dカルマンフィルタ
│   └── HybridStaticUtils.js        #   静止判定・バッファ管理ユーティリティ
├── docs/
│   ├── INDEX.md
│   ├── high-precision-sensor/      # 高精度傾斜計のドキュメント
│   └── table-level/                # 机水平ガイドのドキュメント
├── tests/
│   ├── *.test.js                   # ユニットテスト (47件)
│   ├── e2e-offline-smoke.mjs
│   └── e2e-table-level-smoke.mjs
├── .editorconfig                   # コードスタイル定義
├── .gitattributes                  # Git 改行コード制御
└── sw.js
```

## 🚀 起動入口

- 高精度傾斜計: `/index.html`
- 机水平ガイド: `/table-level/index.html`

## 🧪 テスト

```bash
npm test -- --run
npm run test:e2e-smoke
npm run test:e2e:table-level
```

## 📚 ドキュメント

- 入口: `docs/INDEX.md`
- 高精度傾斜計: `docs/high-precision-sensor/`
- 机水平ガイド: `docs/table-level/`

## License

This project is licensed under the MIT License - see the `LICENSE` file for details.
