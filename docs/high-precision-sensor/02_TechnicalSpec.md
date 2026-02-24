# 高精度傾斜角センサー 技術解説書

更新日: 2026-02-18

## 1. 本書の目的

本書は、傾斜角推定アルゴリズムの理論的背景および実装上の意図を明確化し、保守・改修時の技術判断基準を提供する。

## 2. 観測モデル

DeviceOrientation API から取得される観測値を \( y_t \)、真値を \( x_t \)、観測ノイズを \( v_t \) とすると、観測は次式で表される。

\[
y_t = x_t + v_t
\]

本実装では、観測値から真値を推定するため、以下の処理を直列適用する。

1. 1次元カルマンフィルタ
2. 指数移動平均（EMA）
3. デッドゾーン処理
4. **静止平均積算（Static Average）** ← ハイブリッドモードで動的に適用

## 3. 1次元カルマンフィルタ

### 3.1 状態方程式

静的傾斜角計測を前提とし、状態遷移を次式で近似する。

\[
x_k = x_{k-1} + w_k, \quad w_k \sim N(0, Q)
\]

### 3.2 観測方程式

\[
z_k = x_k + v_k, \quad v_k \sim N(0, R)
\]

### 3.3 更新式

予測および更新は次式に従う。

\[
\hat{x}_k^- = \hat{x}_{k-1}
\]
\[
P_k^- = P_{k-1} + Q
\]
\[
K_k = \frac{P_k^-}{P_k^- + R}
\]
\[
\hat{x}_k = \hat{x}_k^- + K_k(z_k - \hat{x}_k^-)
\]
\[
P_k = (1 - K_k)P_k^-
\]

### 3.4 実装上のパラメータ

- \( Q = 0.001 \)
- \( R = 0.1 \)

上記値は「短時間で急変しない静的傾斜」を主用途とし、安定性を重視して設定している。

## 4. 指数移動平均（EMA）

カルマン推定値を \( u_t \)、EMA 出力を \( s_t \)、平滑化係数を \( \alpha \) とすると、次式となる。

\[
s_t = \alpha u_t + (1 - \alpha)s_{t-1}
\]

本実装の既定値は \( \alpha = 0.08 \) である。係数を小さくすると平滑化が強まり、追従性は低下する。

## 5. デッドゾーン処理

最終出力を \( o_t \)、EMA 出力を \( s_t \)、しきい値を \( \theta \) とする。

\[
o_t =
\begin{cases}
o_{t-1}, & |s_t - o_{t-1}| < \theta \\
s_t, & |s_t - o_{t-1}| \ge \theta
\end{cases}
\]

本実装の既定値は \( \theta = 0.005 \) である。これにより、静止時の微小揺らぎを表示上で抑制する。

## 6. 静止平均積算（Static Average / Hybrid Mode）

### 6.1 概要

建設現場での机水平調整など、「完全に静止した状態で高精度計測を行う」ユースケースに対応するため、ハイブリッドモードを導入する。システムはセンサー値の分散を常時監視し、以下の2モードを自動切替する。

| モード | 状態 | アルゴリズム |
| :--- | :--- | :--- |
| **Active Mode** | 調整中・移動中 | Kalman + EMA + Deadzone（従来方式） |
| **Static Mode** | 完全静止中 | 蓄積バッファの全平均（真値に収束） |

### 6.2 静止判定

直近 $N$ フレームの分散を計算し、閾値以下であれば「静止」と判定する。

- **静止判定閾値**: `staticVarianceThreshold`（デフォルト: 0.002、現場で要調整）
- **判定期間**: `staticDurationFrame`（デフォルト: 30フレーム / 約0.5秒）

### 6.3 平均化処理

静止と判定された時点で蓄積バッファをリセットし、以降のカルマンフィルタ通過後の値を蓄積する。サンプル数 $n$ が増えるほど、ノイズ成分は $\frac{1}{\sqrt{n}}$ で減衰し、真値に収束する。

### 6.4 実装モードとUI表示

実装では下記3状態を持つ。

| 状態 | 条件 | UIステータス表示 |
| :--- | :--- | :--- |
| `active` | 静止判定未成立 | `計測中` |
| `locking` | 静止判定成立後、`averagingSampleCount` 未満 | `LOCKING...` |
| `measuring` | 静止判定成立後、`averagingSampleCount` 以上 | `MEASURING` |

`measuring` 中は表示小数桁を通常より1桁増やし、最終読取時の分解能を高める。

### 6.5 追加パラメータ

- `averagingSampleCount`: `60`
- `staticDurationFrame`: `30`
- `staticVarianceThreshold`: `0.002`
- `maxBufferSize`: `2000`

## 7. パイプライン全体

\[
\text{Raw} \rightarrow \text{Calibration} \rightarrow \text{Kalman} \rightarrow \text{EMA} \rightarrow \text{Deadzone} \rightarrow \text{Output}
\]

上記に加え、静止判定が成立した場合は以下のパスに切り替わる。

\[
\text{Raw} \rightarrow \text{Calibration} \rightarrow \text{Kalman} \rightarrow \text{Static Average Buffer} \rightarrow \text{Output}
\]

## 8. 運用上の留意事項

- 絶対精度は端末個体差および設置条件に依存する。
- 高精度運用時は、計測対象面でのキャリブレーション実施を前提とする。
- 設定値変更時は、応答性と安定性のトレードオフを考慮して調整する。
- 建設現場等の振動環境では、静止判定閾値を現場のベースライン振動に合わせて調整する必要がある。

## 9. 2点キャリブレーション

### 9.1 概要

1点校正に加え、同一面で iPhone を表向きのまま 180 度回転して2点取得し、センサーオフセットを推定する。

### 9.2 補正式

1点目観測値を `m1`、2点目観測値を `m2`、真値を `t`、オフセットを `b` とすると:

- `m1 = t + b`
- `m2 = -t + b`

よって `b = (m1 + m2) / 2`。

Pitch/Rollそれぞれで上式を適用し、`calibPitch`, `calibRoll` に加算する。

### 9.3 取得条件

- 取得は `measurementMode` が `locking` または `measuring` のときのみ許可する。
- 1点目取得後は 30 秒以内に2点目を取得する。超過時は `timeout` として破棄する。

### 9.4 公開インターフェース

- `startTwoPointCalibration()`
- `captureTwoPointCalibrationPoint()`
- `cancelTwoPointCalibration()`
- `getTwoPointCalibrationState()`

## 10. 音声出力仕様

### 10.1 出力タイプ

音声出力は上位設定 `outputType` で切り替える。

| `outputType` | 挙動 |
| :--- | :--- |
| `normal` | Web Audio API による方向別連続音を出力する。 |
| `speech` | 10秒ごとに角度読み上げを行う。通常の連続音は停止する。 |
| `off` | 音声出力を停止する。 |

### 10.2 通常音（`outputType = normal`）

- 下位設定 `soundMode`（`continuous` / `threshold`）を適用する。
- `soundMode = threshold` のときのみ `soundThreshold` を判定に使用する。
- `soundEnabled = false`（ヘッダーの音アイコンOFF）の場合は、通常音を強制停止する。

### 10.3 読み上げ音（`outputType = speech`）

- 固定周期 `10000ms`（10秒）で読み上げを行う。
- 読み上げ対象は毎回2軸（前後・左右）の両方。
- 角度値は絶対値を `toFixed(1)` で 0.1 度単位に丸める。
- 文言フォーマット:
  - `pitch < 0`: `前上がりX.X度`
  - `pitch >= 0`: `後ろ上がりX.X度`
  - `roll < 0`: `左上がりX.X度`
  - `roll >= 0`: `右上がりX.X度`
  - 合成: `前後文言、左右文言`
- `soundEnabled = false` の場合、読み上げも停止する。

### 10.4 音量

- `masterVolume` を通常音・読み上げ音の共通音量として扱う。
- 読み上げ時は `SpeechSynthesisUtterance.volume` に `masterVolume` を適用する。
