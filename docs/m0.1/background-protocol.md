# M0.1 恢复观测、目标帧率与原生引擎暂停测试

测试脚本：`tools/testing/m01-runtime.js`。

- 数值矩阵协议保持 **`m01-postphysics-v1`**。
- 真实后台协议标记为 **`m01-native-interruption-v2`**。
- 恢复后帧率证据协议为 **`m01-recovery-observation-v3`**。
- 独立的原生引擎暂停测试为 **`m01-render-paused-v1`**。
- 旧 before/after JSON 保持原样；不能把旧协议的提示前基线与新版恢复结果直接混算。

## 纠正的测量边界

旧实现先提示操作者切换标签，并立即取得恢复检查的起点。提示与真正切到后台之间，游戏仍在前台接受已按住的移动和射击，这些合法动作会被误算为恢复时的大跳或补发。

新版在真实 `blur`、`visibilitychange` 和 `focus` 事件中读取并保存当前 `game.getStatus()` 快照，同时记录事件 `atMs`、`isTrusted`、`hidden`、焦点及当时的 afterPhysics 样本索引。

恢复检查的基线来自**提示之后首次真实 blur 或 hidden 事件**，不是提示时刻。仍要求真实 hidden 持续至少 1 秒，并取得真实返回事件；没有这些事件或缺少事件状态快照就不能通过。

`backgroundTimeline` 完整保留提示到真实中断的合法动作：提示快照、中断快照、持续时间、合法位移、合法新增发射数、每个物理后位置样本、发射事件和批次。它们单独列出，未静默删除。

## 未放宽的恢复断言

从真实返回时刻观察 550 毫秒：

- 游戏自行清空所有输入。
- 相对真实中断状态的首次恢复位移和累计位移仍不能超过 `2 × 配置速度 × 实际物理步长 + 0.02 米`。
- 发射计数不能增加，不能在同一真实游戏帧补发多枪。

首次恢复位置必须来自返回事件之后新记录的 afterPhysics 样本，避免复用返回前旧位置。

## 恢复后的新输入

只有游戏已经自行清空输入，探针才派发一个**新的前向触屏指针**，保持约 500 毫秒后正常 `pointerup`。没有再次设置位置，没有调用游戏的清输入函数，也没有清理物理累积时间。

新输入记录实际 down/up 墙钟时间、真实 afterPhysics 起止位置和期间所有位置样本；距离继续使用原公式：

```text
|实际投影距离 - 配置速度 × 实际输入时长|
≤ 3% × 配置速度 × 实际输入时长 + 2 × 配置速度 × 实际物理步长
```

同时要求新移动不引起旧射击补发，正常松开后输入已清空。若游戏没有先清空旧输入，新输入项保留未验证，不能由探针清空后再伪装通过。

## v3：功能观察与目标帧率证据分开

原来的 550 毫秒功能观察及全部位移、发射和输入阈值保持不变，断言结果单独写入 `functionalStatus`。该短窗的真实帧计数原样保留为 `transientFrameRate`，不把观察到的帧率改写成所选目标。

目标帧率另外采用预先固定的 **`[resumedAt, resumedAt + 2000 ms]`** 窗口，记录为 `targetFrameRateEvidence`。它计入窗口内所有原始 `game.onUpdate` 调用，包括恢复初期帧；不截取有利的稳定片段，也不剔除恢复帧。原目标 ±10% 判定保持不变。`frameRate` 是该完整两秒证据的兼容引用。

对后台恢复，新 500 毫秒前向输入仍在原 550 毫秒功能检查后立即开始，不能为了等帧率稳定而延后。完成新输入及原断言后，只补足观察到恢复后两秒；其余时间不增加动作。

最终状态区分两类证据：

- 功能断言失败仍为 **FAIL**，不会被两秒帧率通过覆盖。
- 功能通过但两秒实际帧率未达到目标，目标保留 **NOT TESTED**，整项为 **INCOMPLETE**。
- 功能和完整目标窗口均通过才为 **PASS**；这不表示前 550 毫秒恰好稳定在所选 FPS。

旧短窗报告没有后续两秒观测数据，不能补算或改判。本轮保留了 `final-stall-15-fp.json` 的 INCOMPLETE，并另存新版实际重测报告。

## 独立测试：原生引擎暂停/恢复

显式按钮为“原生引擎暂停/恢复”，选择器：

```text
[data-m01-action="engine-pause"]
```

它在真实触屏移动和射击仍被按住时，使用本机引擎原生接口 `Laya.Render.paused = true`，等待至少 1500 毫秒真实墙钟时间，再设为 `false`。期间不派发 keyup、blur 或 hidden，不改 `delta`、时钟或物理债务。

新增证据包括：

- 实际暂停起止时刻和持续时间。
- 暂停期间原 `game.onUpdate` 调用次数必须为 **0**。
- `firstResumedFrame.timerDeltaMs` 和首个恢复后的物理位置。恢复时的小 delta 来自原 setter 的 `_markResumed` 路径，不是探针伪造；游戏仍应依据真实单调时钟间隔识别中断并自行清输入。
- 原 v3 的 550 毫秒功能断言、紧接的新 500 毫秒前向输入和固定两秒目标 FPS 证据。
- `finally` 中恢复原 `Render.paused` 值，并在 `cleanup.renderPaused` 记录恢复结果。

用例分别命名为 `engine-pause` 和 `engine-pause-fresh-input`，汇总字段为 `nativeEnginePauseVerification`。**这项通过不等同于浏览器真实后台隐藏/恢复通过**，也不更新 `realBackgroundVerification`；报告明确记录 `doesNotVerifyNativeVisibility: true`。

## 本轮已经保存的证据

以下结论来自各报告本身，未改写旧数据：

| 报告 | 本轮结果与关键数据 |
|---|---|
| `runs/20260921/final-stall-15-fp.json` | 旧短窗报告保留 INCOMPLETE；功能断言通过，但约 550 ms 内实际 18.155 Hz，目标帧率未确认 |
| `runs/20260921/final-stall-15-fp-v3.json` | PASS；功能断言通过；短窗实际 18.178513 Hz 原样保留，两秒实际 15.5 Hz |
| `runs/20260921/final-engine-pause-15.json` | PASS；真实暂停 1504.6 ms，暂停更新次数 0，首个恢复帧 delta 约 66.7 ms；恢复及新输入通过，两秒实际 15 Hz |
| `runs/20260921/final-engine-pause-60.json` | PASS；真实暂停 1500.5 ms，暂停更新次数 0，首个恢复帧 delta 约 16.6 ms；恢复及新输入通过，两秒实际 60 Hz |
| `runs/20260921/final-background-v2.json` | INCOMPLETE；未取得任何 nativeEvents，真实浏览器 hidden/恢复继续为 NOT TESTED |

因此，本轮有原生**引擎**暂停/恢复证据，但没有原生**浏览器隐藏事件**恢复证据，二者不能相互替代。

## 数值核心未变

恢复观测和独立引擎暂停分支未更改原矩阵的移动、射击函数及阈值。函数文本 SHA-256 对照：

```text
movement: a837a5b2fccca23d75a6a532f2d0710569dc615cfcc8ff02386cc0954073e0e5
firing:   8bffe3beb254a3f5730b86d55185d7e0a1c6b239fa769cb520b15fa08498e5e6
```

协议代码通过语法检查不等于运行验收通过；尤其不能以引擎暂停结果代替尚未取得的真实浏览器切换标签事件。
