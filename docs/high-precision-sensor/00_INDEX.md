# 高精度傾斜角センサー ドキュメント一覧

更新日: 2026-02-24

## 命名ルール

| プレフィックス | カテゴリ | 説明 |
|:---|:---|:---|
| `SP-` | spec/ | 仕様・ガイド |
| `DS-` | design/ | アルゴリズム設計・提案 |
| `RV-` | review/ | レビュー・品質評価 |
| `TS-` | testing/ | テスト・検証・運用 |

---

## spec/ — 仕様・ガイド

| No. | ファイル | 概要 |
|:---|:---|:---|
| SP-01 | [UserManual](spec/SP-01_UserManual.md) | ユーザー向け操作マニュアル |
| SP-02 | [TechnicalSpec](spec/SP-02_TechnicalSpec.md) | アルゴリズム理論・技術解説書 |
| SP-03 | [AccuracyReport](spec/SP-03_AccuracyReport.md) | 精度推定レポート |
| SP-04 | [Roadmap](spec/SP-04_Roadmap.md) | プロジェクトロードマップ |
| SP-05 | [DevGuide](spec/SP-05_DevGuide.md) | 開発者ガイド |

## design/ — アルゴリズム設計・提案

| No. | ファイル | 概要 |
|:---|:---|:---|
| DS-01 | [Algorithm_StepByStep](design/DS-01_Algorithm_StepByStep.md) | アルゴリズム詳細解説（ステップバイステップ） |
| DS-02 | [Accuracy_Improvement_Ideas](design/DS-02_Accuracy_Improvement_Ideas.md) | 精度向上施策の別案リスト |
| DS-03 | [Algorithm_Rationale](design/DS-03_Algorithm_Rationale.md) | 現行アルゴリズム採用理由書 |
| DS-04 | [Proposal_Hybrid_Static_Average](design/DS-04_Proposal_Hybrid_Static_Average.md) | 静止計測ハイブリッドアルゴリズム設計書 |
| DS-05 | [Optimization_and_Verification_Plan](design/DS-05_Optimization_and_Verification_Plan.md) | パラメータ調整方針・検証計画書 |
| DS-06 | [TwoPointCalibration_Design](design/DS-06_TwoPointCalibration_Design.md) | 2点キャリブレーション設計書 |
| DS-07 | [Feature_And_Spinoff_Proposals](design/DS-07_Feature_And_Spinoff_Proposals.md) | 追加機能案・派生アプリ案 |

## review/ — レビュー・品質評価

| No. | ファイル | 概要 |
|:---|:---|:---|
| RV-01 | [SelfReview](review/RV-01_SelfReview.md) | 自己レビュー（v1.2） |
| RV-02 | [AlgorithmVerification](review/RV-02_AlgorithmVerification.md) | アルゴリズム検証報告書 |
| RV-03 | [HarshCodeReview](review/RV-03_HarshCodeReview.md) | 辛口コードレビュー |
| RV-04 | [Standard_Code_Review](review/RV-04_Standard_Code_Review.md) | 標準コードレビュー（全体） |
| RV-05 | [FieldOps_Perspective_Review](review/RV-05_FieldOps_Perspective_Review.md) | 運用・現場重視レビュー |

## testing/ — テスト・検証・運用

| No. | ファイル | 概要 |
|:---|:---|:---|
| TS-01 | [VerificationMethod](testing/TS-01_VerificationMethod.md) | 詳細精度検証手順書 |
| TS-02 | [AutomatedVerificationReport](testing/TS-02_AutomatedVerificationReport.md) | 自動検証レポート（E2E Smoke） |
| TS-03 | [TestPurposeContentResult_Detail](testing/TS-03_TestPurposeContentResult_Detail.md) | テスト詳細解説（目的・内容・結果） |
| TS-04 | [ExternalTesterSharingGuide](testing/TS-04_ExternalTesterSharingGuide.md) | 外部テスター共有ガイド |
| TS-05 | [PoC_Validation_Plan](testing/TS-05_PoC_Validation_Plan.md) | 実証試験（PoC）計画 |
| TS-06 | [Performance_Fix_Report](testing/TS-06_Performance_Fix_Report.md) | パフォーマンス修正レポート |

## slides/ — プレゼンテーション資料

| ファイル | 概要 |
|:---|:---|
| [slide1_project_overview.html](slides/slide1_project_overview.html) | プロジェクト概要スライド |
| [slide2_accuracy_improvement.html](slides/slide2_accuracy_improvement.html) | 精度改善スライド |
| [slide3_future_plan.html](slides/slide3_future_plan.html) | 将来計画スライド |
| [PoC_Validation_Plan_print.html](slides/PoC_Validation_Plan_print.html) | PoC計画A4印刷版 |

## archive/ — 旧版資料

旧版の計画書・要件定義・検証レポート等を保管。
