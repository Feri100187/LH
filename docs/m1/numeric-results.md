# M1 真实引擎数值结果

自动生成：`node tools/testing/summarize-m1.cjs`。协议：`m1-emission-settlement-v1`。

仅汇总本轮实际 LayaAir 浏览器报告。脚本注入的触屏 DOM 事件与真实硬件输入分开记录；逻辑桩、构建报告、M0.1 和原生输入尝试不混入这些通过计数。

每个 runId 只统计一次；独立失败、未达到目标帧率的尝试和成功重试都保留。表中实际 FPS 为游戏更新次数/墙钟时长。原始断言与状态不作改写，发射与消费数相等不能替代完整 PASS。

## 运行总览

| 类型 | 视角 | 目标 FPS | 实际 FPS | 原状态 | 用例状态数 | 原始报告 |
| --- | --- | --- | --- | --- | --- | --- |
| functional | FP | 60 | 60.032 | FAIL | {"PASS":8,"FAIL":10} | [final-functional-60-fp.json](runs/20260921/final-functional-60-fp.json) |
| functional | FP | 60 | 60.045 | PASS | {"PASS":18} | [corrected-functional-60-fp.json](runs/20260921/corrected-functional-60-fp.json) |
| functional | TPS | 60 | 59.77 | PASS | {"PASS":18} | [corrected-functional-60-tps.json](runs/20260921/corrected-functional-60-tps.json) |
| continuous | FP | 15 | 15.012 | PASS | {"PASS":8} | [corrected-continuous-15-fp.json](runs/20260921/corrected-continuous-15-fp.json) |
| continuous | FP | 30 | 29.902 | PASS | {"PASS":8} | [corrected-continuous-30-fp.json](runs/20260921/corrected-continuous-30-fp.json) |
| continuous | FP | 60 | 56.263 | FAIL | {"PASS":7,"FAIL":1} | [corrected-continuous-60-fp.json](runs/20260921/corrected-continuous-60-fp.json) |
| continuous | FP | 240 | 200.169 | FAIL | {"PASS":4,"FAIL":3,"INCOMPLETE":1} | [corrected-continuous-240-fp.json](runs/20260921/corrected-continuous-240-fp.json) |
| continuous | FP | 60 | 59.902 | PASS | {"PASS":8} | [corrected-continuous-60-fp-fresh.json](runs/20260921/corrected-continuous-60-fp-fresh.json) |
| continuous | FP | 240 | 237.876 | PASS | {"PASS":8} | [corrected-continuous-240-fp-fresh.json](runs/20260921/corrected-continuous-240-fp-fresh.json) |
| continuous | TPS | 15 | 14.934 | PASS | {"PASS":8} | [corrected-continuous-15-tps.json](runs/20260921/corrected-continuous-15-tps.json) |
| continuous | TPS | 30 | 30.006 | PASS | {"PASS":8} | [corrected-continuous-30-tps.json](runs/20260921/corrected-continuous-30-tps.json) |
| continuous | TPS | 60 | 59.98 | PASS | {"PASS":8} | [corrected-continuous-60-tps.json](runs/20260921/corrected-continuous-60-tps.json) |
| continuous | TPS | 240 | 235.003 | PASS | {"PASS":8} | [corrected-continuous-240-tps.json](runs/20260921/corrected-continuous-240-tps.json) |
| functional | FP | 15 | 15.023 | PASS | {"PASS":18} | [corrected-functional-15-fp.json](runs/20260921/corrected-functional-15-fp.json) |
| route | FP | 15 | 14.977 | PASS | {"PASS":6} | [corrected-training-route-15.json](runs/20260921/corrected-training-route-15.json) |

## 连射逐模式数据

received/consumed 均为该用例开始到释放观察结束的累计计数增量；完成新增来自 completionEvents。间隔是实际发射事件时间之差。

### corrected-continuous-15-fp.json

FP，目标 15 FPS；运行原状态 **PASS**。[corrected-continuous-15-fp.json](runs/20260921/corrected-continuous-15-fp.json)，runId：`2026-09-21T10:49:21.296Z-3`。

| 模式 | 原状态 | 实际 FPS | 帧率目标 | 输入秒 | emit | received Δ | consumed Δ | accepted | 靶命中 | 完成新增 | 释放后发射 | 间隔 min/max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | PASS | 14.986 | ACHIEVED | 2.0019 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 133.3/266.7 |
| moving | PASS | 15.468 | ACHIEVED | 2.0041 | 10 | 10 | 10 | 10 | 4 | 1 | 0 | 199.9/263.8 |
| jumping | PASS | 14.977 | ACHIEVED | 2.0031 | 10 | 10 | 10 | 10 | 8 | 1 | 0 | 133.3/266.7 |
| perspective-switch | PASS | 14.923 | ACHIEVED | 2.0103 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 199.9/200.1 |


### corrected-continuous-30-fp.json

FP，目标 30 FPS；运行原状态 **PASS**。[corrected-continuous-30-fp.json](runs/20260921/corrected-continuous-30-fp.json)，runId：`2026-09-21T10:52:26.876Z-4`。

| 模式 | 原状态 | 实际 FPS | 帧率目标 | 输入秒 | emit | received Δ | consumed Δ | accepted | 靶命中 | 完成新增 | 释放后发射 | 间隔 min/max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | PASS | 30.413 | ACHIEVED | 2.0057 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 199.9/215.4 |
| moving | PASS | 30.428 | ACHIEVED | 2.0047 | 10 | 10 | 10 | 10 | 4 | 1 | 0 | 199.3/214.9 |
| jumping | PASS | 30.454 | ACHIEVED | 2.003 | 10 | 10 | 10 | 10 | 8 | 1 | 0 | 192.1/212.7 |
| perspective-switch | PASS | 30.232 | ACHIEVED | 2.0177 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 199.9/220.1 |


### corrected-continuous-60-fp.json

FP，目标 60 FPS；运行原状态 **FAIL**。[corrected-continuous-60-fp.json](runs/20260921/corrected-continuous-60-fp.json)，runId：`2026-09-21T10:54:08.171Z-5`。

| 模式 | 原状态 | 实际 FPS | 帧率目标 | 输入秒 | emit | received Δ | consumed Δ | accepted | 靶命中 | 完成新增 | 释放后发射 | 间隔 min/max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | PASS | 59.369 | ACHIEVED | 2.0044 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 195.7/214.2 |
| moving | FAIL | 59.399 | ACHIEVED | 2.0034 | 10 | 10 | 10 | 10 | 4 | 1 | 0 | 166.1/233.9 |
| jumping | PASS | 58.923 | ACHIEVED | 2.0026 | 10 | 10 | 10 | 10 | 8 | 1 | 0 | 191.7/213.2 |
| perspective-switch | PASS | 59.301 | ACHIEVED | 2.0067 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 195.9/212.3 |

- moving 持射2秒 / 释放500ms：**FAIL**；实际发射间隔符合射速和帧量化。

### corrected-continuous-240-fp.json

FP，目标 240 FPS；运行原状态 **FAIL**。[corrected-continuous-240-fp.json](runs/20260921/corrected-continuous-240-fp.json)，runId：`2026-09-21T10:56:01.817Z-6`。

| 模式 | 原状态 | 实际 FPS | 帧率目标 | 输入秒 | emit | received Δ | consumed Δ | accepted | 靶命中 | 完成新增 | 释放后发射 | 间隔 min/max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | FAIL | 217.315 | ACHIEVED | 2.0017 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 159.4/241.3 |
| moving | FAIL | 218.171 | ACHIEVED | 2.0076 | 11 | 11 | 11 | 11 | 4 | 1 | 0 | 158.9/241.2 |
| jumping | INCOMPLETE | 215.687 | NOT TESTED | 2.0029 | 10 | 10 | 10 | 10 | 8 | 1 | 0 | 199.9/201.3 |
| perspective-switch | FAIL | 210.551 | NOT TESTED | 2.1135 | 11 | 11 | 11 | 11 | 11 | 1 | 0 | 173.5/228.8 |

- static 持射2秒 / 释放500ms：**FAIL**；实际发射间隔符合射速和帧量化。
- moving 持射2秒 / 释放500ms：**FAIL**；实际发射间隔符合射速和帧量化。
- jumping 持射2秒 / 释放500ms：**INCOMPLETE**；目标帧率未达到或记录不完整。
- perspective-switch 持射2秒 / 释放500ms：**FAIL**；实际发射间隔符合射速和帧量化。

### corrected-continuous-60-fp-fresh.json

FP，目标 60 FPS；运行原状态 **PASS**。[corrected-continuous-60-fp-fresh.json](runs/20260921/corrected-continuous-60-fp-fresh.json)，runId：`2026-09-21T10:59:00.240Z-1`。

| 模式 | 原状态 | 实际 FPS | 帧率目标 | 输入秒 | emit | received Δ | consumed Δ | accepted | 靶命中 | 完成新增 | 释放后发射 | 间隔 min/max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | PASS | 59.856 | ACHIEVED | 2.0048 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 199.9/200.1 |
| moving | PASS | 59.958 | ACHIEVED | 2.0014 | 10 | 10 | 10 | 10 | 4 | 1 | 0 | 183.5/216.5 |
| jumping | PASS | 59.847 | ACHIEVED | 2.0051 | 10 | 10 | 10 | 10 | 8 | 1 | 0 | 183.4/216.6 |
| perspective-switch | PASS | 58.9 | ACHIEVED | 2.0034 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 199.9/200.1 |


### corrected-continuous-240-fp-fresh.json

FP，目标 240 FPS；运行原状态 **PASS**。[corrected-continuous-240-fp-fresh.json](runs/20260921/corrected-continuous-240-fp-fresh.json)，runId：`2026-09-21T11:00:05.602Z-1`。

| 模式 | 原状态 | 实际 FPS | 帧率目标 | 输入秒 | emit | received Δ | consumed Δ | accepted | 靶命中 | 完成新增 | 释放后发射 | 间隔 min/max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | PASS | 238.44 | ACHIEVED | 2.0005 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 199.9/203.8 |
| moving | PASS | 240.356 | ACHIEVED | 2.0012 | 10 | 10 | 10 | 10 | 5 | 1 | 0 | 200/203.3 |
| jumping | PASS | 240.344 | ACHIEVED | 2.0013 | 10 | 10 | 10 | 10 | 8 | 1 | 0 | 199.7/201.8 |
| perspective-switch | PASS | 231.32 | ACHIEVED | 2.0102 | 11 | 11 | 11 | 11 | 11 | 1 | 0 | 199.4/203.4 |


### corrected-continuous-15-tps.json

TPS，目标 15 FPS；运行原状态 **PASS**。[corrected-continuous-15-tps.json](runs/20260921/corrected-continuous-15-tps.json)，runId：`2026-09-21T11:04:17.625Z-2`。

| 模式 | 原状态 | 实际 FPS | 帧率目标 | 输入秒 | emit | received Δ | consumed Δ | accepted | 靶命中 | 完成新增 | 释放后发射 | 间隔 min/max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | PASS | 14.99 | ACHIEVED | 2.0014 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 199.9/200.1 |
| moving | PASS | 14.954 | ACHIEVED | 2.0061 | 10 | 10 | 10 | 10 | 6 | 1 | 0 | 199.9/200.1 |
| jumping | PASS | 14.987 | ACHIEVED | 2.0018 | 10 | 10 | 10 | 10 | 8 | 1 | 0 | 133.4/266.6 |
| perspective-switch | PASS | 14.912 | ACHIEVED | 2.0118 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 199.9/200.1 |


### corrected-continuous-30-tps.json

TPS，目标 30 FPS；运行原状态 **PASS**。[corrected-continuous-30-tps.json](runs/20260921/corrected-continuous-30-tps.json)，runId：`2026-09-21T11:05:29.958Z-3`。

| 模式 | 原状态 | 实际 FPS | 帧率目标 | 输入秒 | emit | received Δ | consumed Δ | accepted | 靶命中 | 完成新增 | 释放后发射 | 间隔 min/max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | PASS | 29.969 | ACHIEVED | 2.0021 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 166.8/233.4 |
| moving | PASS | 30.354 | ACHIEVED | 2.0096 | 11 | 11 | 11 | 11 | 6 | 1 | 0 | 199.9/200.1 |
| jumping | PASS | 29.906 | ACHIEVED | 2.0063 | 10 | 10 | 10 | 10 | 8 | 1 | 0 | 199.9/233.2 |
| perspective-switch | PASS | 29.883 | ACHIEVED | 2.0078 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 199.9/200.1 |


### corrected-continuous-60-tps.json

TPS，目标 60 FPS；运行原状态 **PASS**。[corrected-continuous-60-tps.json](runs/20260921/corrected-continuous-60-tps.json)，runId：`2026-09-21T11:06:28.482Z-4`。

| 模式 | 原状态 | 实际 FPS | 帧率目标 | 输入秒 | emit | received Δ | consumed Δ | accepted | 靶命中 | 完成新增 | 释放后发射 | 间隔 min/max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | PASS | 60.193 | ACHIEVED | 2.0102 | 11 | 11 | 11 | 11 | 11 | 1 | 0 | 183.3/216.7 |
| moving | PASS | 60.373 | ACHIEVED | 2.0042 | 10 | 10 | 10 | 10 | 6 | 1 | 0 | 199.8/214.6 |
| jumping | PASS | 59.925 | ACHIEVED | 2.0025 | 10 | 10 | 10 | 10 | 8 | 1 | 0 | 183.4/216.6 |
| perspective-switch | PASS | 60.223 | ACHIEVED | 2.0092 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 199.9/212.8 |


### corrected-continuous-240-tps.json

TPS，目标 240 FPS；运行原状态 **PASS**。[corrected-continuous-240-tps.json](runs/20260921/corrected-continuous-240-tps.json)，runId：`2026-09-21T11:08:05.185Z-5`。

| 模式 | 原状态 | 实际 FPS | 帧率目标 | 输入秒 | emit | received Δ | consumed Δ | accepted | 靶命中 | 完成新增 | 释放后发射 | 间隔 min/max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | PASS | 232.048 | ACHIEVED | 2.0039 | 10 | 10 | 10 | 10 | 10 | 1 | 0 | 198.1/202.4 |
| moving | PASS | 234.566 | ACHIEVED | 2.0037 | 10 | 10 | 10 | 10 | 6 | 1 | 0 | 197.4/203.7 |
| jumping | PASS | 238.558 | ACHIEVED | 2.0079 | 10 | 10 | 10 | 10 | 8 | 1 | 0 | 195.2/203.5 |
| perspective-switch | PASS | 238.119 | ACHIEVED | 2.0074 | 11 | 11 | 11 | 11 | 11 | 1 | 0 | 199.8/201.6 |


## 功能与路线逐项结果

### final-functional-60-fp.json

functional / FP / 目标 60 FPS / 实际 60.032 FPS / **FAIL**。[final-functional-60-fp.json](runs/20260921/final-functional-60-fp.json)。

观测结算 11；同帧 11；射程内 11。逐项断言在 JSON 中保留。

| 用例 | 原状态 | 断言状态数 | 失败或缺口 |
| --- | --- | --- | --- |
| 功能验收起始重置 | PASS | {"PASS":2} | — |
| 近距离命中 | FAIL | {"PASS":10,"FAIL":1} | 命中指定靶 |
| 重复命中近靶 | FAIL | {"PASS":10,"FAIL":1} | 命中指定靶 |
| 重复靶完成只计一次 | FAIL | {"FAIL":1} | 完成事件不重复 |
| 中距离命中 | FAIL | {"PASS":10,"FAIL":1} | 命中指定靶 |
| 出生点射击掩体后的靶 | PASS | {"PASS":11} | — |
| 绕行点命中掩体靶 | FAIL | {"PASS":10,"FAIL":1} | 命中指定靶 |
| 三个靶全部完成 | FAIL | {"FAIL":1} | 3个不同目标完成 |
| 朝天空脱靶 | PASS | {"PASS":11} | — |
| 超射程不得命中 | PASS | {"PASS":11} | — |
| 近墙不能穿透掩体 | PASS | {"PASS":11} | — |
| 连续重置 1/3 | PASS | {"PASS":2} | — |
| 连续重置 2/3 | PASS | {"PASS":2} | — |
| 连续重置 3/3 | PASS | {"PASS":2} | — |
| 重置后重新命中 near | FAIL | {"PASS":10,"FAIL":1} | 命中指定靶 |
| 重置后重新命中 medium | FAIL | {"PASS":10,"FAIL":1} | 命中指定靶 |
| 重置后重新命中 covered | FAIL | {"PASS":10,"FAIL":1} | 命中指定靶 |
| 第二轮可正常完成 | FAIL | {"FAIL":1} | 再次3/3完成 |

### corrected-functional-60-fp.json

functional / FP / 目标 60 FPS / 实际 60.045 FPS / **PASS**。[corrected-functional-60-fp.json](runs/20260921/corrected-functional-60-fp.json)。

观测结算 11；同帧 11；射程内 11。逐项断言在 JSON 中保留。

| 用例 | 原状态 | 断言状态数 | 失败或缺口 |
| --- | --- | --- | --- |
| 功能验收起始重置 | PASS | {"PASS":2} | — |
| 近距离命中 | PASS | {"PASS":11} | — |
| 重复命中近靶 | PASS | {"PASS":11} | — |
| 重复靶完成只计一次 | PASS | {"PASS":1} | — |
| 中距离命中 | PASS | {"PASS":11} | — |
| 出生点射击掩体后的靶 | PASS | {"PASS":11} | — |
| 绕行点命中掩体靶 | PASS | {"PASS":11} | — |
| 三个靶全部完成 | PASS | {"PASS":1} | — |
| 朝天空脱靶 | PASS | {"PASS":11} | — |
| 超射程不得命中 | PASS | {"PASS":11} | — |
| 近墙不能穿透掩体 | PASS | {"PASS":11} | — |
| 连续重置 1/3 | PASS | {"PASS":2} | — |
| 连续重置 2/3 | PASS | {"PASS":2} | — |
| 连续重置 3/3 | PASS | {"PASS":2} | — |
| 重置后重新命中 near | PASS | {"PASS":11} | — |
| 重置后重新命中 medium | PASS | {"PASS":11} | — |
| 重置后重新命中 covered | PASS | {"PASS":11} | — |
| 第二轮可正常完成 | PASS | {"PASS":1} | — |

### corrected-functional-60-tps.json

functional / TPS / 目标 60 FPS / 实际 59.77 FPS / **PASS**。[corrected-functional-60-tps.json](runs/20260921/corrected-functional-60-tps.json)。

观测结算 11；同帧 11；射程内 11。逐项断言在 JSON 中保留。

| 用例 | 原状态 | 断言状态数 | 失败或缺口 |
| --- | --- | --- | --- |
| 功能验收起始重置 | PASS | {"PASS":2} | — |
| 近距离命中 | PASS | {"PASS":11} | — |
| 重复命中近靶 | PASS | {"PASS":11} | — |
| 重复靶完成只计一次 | PASS | {"PASS":1} | — |
| 中距离命中 | PASS | {"PASS":11} | — |
| 出生点射击掩体后的靶 | PASS | {"PASS":11} | — |
| 绕行点命中掩体靶 | PASS | {"PASS":11} | — |
| 三个靶全部完成 | PASS | {"PASS":1} | — |
| 朝天空脱靶 | PASS | {"PASS":11} | — |
| 超射程不得命中 | PASS | {"PASS":11} | — |
| 近墙不能穿透掩体 | PASS | {"PASS":11} | — |
| 连续重置 1/3 | PASS | {"PASS":2} | — |
| 连续重置 2/3 | PASS | {"PASS":2} | — |
| 连续重置 3/3 | PASS | {"PASS":2} | — |
| 重置后重新命中 near | PASS | {"PASS":11} | — |
| 重置后重新命中 medium | PASS | {"PASS":11} | — |
| 重置后重新命中 covered | PASS | {"PASS":11} | — |
| 第二轮可正常完成 | PASS | {"PASS":1} | — |

### corrected-functional-15-fp.json

functional / FP / 目标 15 FPS / 实际 15.023 FPS / **PASS**。[corrected-functional-15-fp.json](runs/20260921/corrected-functional-15-fp.json)。

观测结算 11；同帧 11；射程内 11。逐项断言在 JSON 中保留。

| 用例 | 原状态 | 断言状态数 | 失败或缺口 |
| --- | --- | --- | --- |
| 功能验收起始重置 | PASS | {"PASS":2} | — |
| 近距离命中 | PASS | {"PASS":11} | — |
| 重复命中近靶 | PASS | {"PASS":11} | — |
| 重复靶完成只计一次 | PASS | {"PASS":1} | — |
| 中距离命中 | PASS | {"PASS":11} | — |
| 出生点射击掩体后的靶 | PASS | {"PASS":11} | — |
| 绕行点命中掩体靶 | PASS | {"PASS":11} | — |
| 三个靶全部完成 | PASS | {"PASS":1} | — |
| 朝天空脱靶 | PASS | {"PASS":11} | — |
| 超射程不得命中 | PASS | {"PASS":11} | — |
| 近墙不能穿透掩体 | PASS | {"PASS":11} | — |
| 连续重置 1/3 | PASS | {"PASS":2} | — |
| 连续重置 2/3 | PASS | {"PASS":2} | — |
| 连续重置 3/3 | PASS | {"PASS":2} | — |
| 重置后重新命中 near | PASS | {"PASS":11} | — |
| 重置后重新命中 medium | PASS | {"PASS":11} | — |
| 重置后重新命中 covered | PASS | {"PASS":11} | — |
| 第二轮可正常完成 | PASS | {"PASS":1} | — |

### corrected-training-route-15.json

route / FP / 目标 15 FPS / 实际 14.977 FPS / **PASS**。[corrected-training-route-15.json](runs/20260921/corrected-training-route-15.json)。

观测结算 1；同帧 1；射程内 1。逐项断言在 JSON 中保留。

| 用例 | 原状态 | 断言状态数 | 失败或缺口 |
| --- | --- | --- | --- |
| 绕行验收起始重置 | PASS | {"PASS":2} | — |
| 绕行路点 1/3 | PASS | {"PASS":2} | — |
| 绕行路点 2/3 | PASS | {"PASS":2} | — |
| 绕行路点 3/3 | PASS | {"PASS":2} | — |
| 真实步行绕过掩体后命中 | PASS | {"PASS":11} | — |
| 完整训练区步行绕行 | PASS | {"PASS":1} | — |

## 保留的失败与验证边界

`final-functional-60-fp.json` 是修复前真实命中失败：枪口射线截断在相机表面点，导致靶表面交点被排除。后续 corrected 报告验证完整枪口射程修复；旧 FAIL 没有覆盖。

`corrected-continuous-60-fp.json` 包含发射间隔断言失败；`corrected-continuous-240-fp.json` 同时含间隔失败和未达到目标帧率的用例。fresh 重试作为新的 runId 单独列出，不把旧尝试计为 PASS。

- [final-functional-60-fp.json](runs/20260921/final-functional-60-fp.json)：FAIL，实际 60.032 FPS。
- [corrected-continuous-60-fp.json](runs/20260921/corrected-continuous-60-fp.json)：FAIL，实际 56.263 FPS。
- [corrected-continuous-240-fp.json](runs/20260921/corrected-continuous-240-fp.json)：FAIL，实际 200.169 FPS。

以下是各报告产生时声明的未验证项；后续独立人工/原生报告是否补齐，应看验收文档，不能由本汇总推断：

- native desktop pointer lock
- physical F key
- physical touchscreen
- native browser background/resume
- visual splash and stream review
- Physical traversal of the flank route: functional test explicitly seeds the flank

完整精度、发射 ID/时间、断言状态、数据来源及排除文件清单见 [runtime-comparison.json](runtime-comparison.json)。原始 JSON 未被修改。
