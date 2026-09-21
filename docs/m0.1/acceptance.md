# M0.1 跨帧率移动与射击验收 · 2026-09-21

本轮基于 `31881e478c0c2a1e6d9ea6fb00c11efdbeb4bf48`，修复移动单位、射击墙钟调度、输入清理与释放观测。**已达到目标帧率的数值矩阵通过；原生页面后台恢复仍未验证。** 完整原始结果保存在 `runs/20260921/`；失败记录不会被后续成功覆盖。没有新增命中、靶子、伤害或其他 M1 玩法。

## 修复范围

- 核实安装版 **LayaAir 3.4.1** 的 `CharacterController.move()` 最终调用 Bullet `setWalkDirection`：向量会在每个固定物理子步使用。现在传入配置速度乘实际物理步长，取代配置速度乘渲染帧时间。
- 使用单调墙钟调度原有约 0.2 秒射击周期；每个真实更新最多发射一次，错过的期限不积压。
- 松开输入同步更新扳机状态；Esc、失焦、隐藏/返回和超过 250 ms 的时间间断清空输入，丢弃当前物理欠账。恢复必须重新输入。
- 保留另一合法扳机来源的发射截止时间，避免取消移动指针或另一射击指针时意外加快连射。

行走 1.65 m/s、奔跑 4 m/s、跳速 6.5、方向步程系数、相机参数、物理引擎和子步配置均未改。资产、场景、UUID、人物比例、八方向动画、双视角、水面和鸭群没有修改。[实现说明](implementation.md)、[引擎源码依据](physics-semantics.md)。

## 分层验收

| 层次 | 结果 | 本轮证据与限制 |
|---|---|---|
| 自动检查 | **125/125 PASS** | 类型 1、逻辑 99、引擎源码合同 11、资源合同 3、工具入口 11；[汇总](runs/20260921/tests-summary.json)。源码合同/子步模型不等同于真实 Bullet |
| 资源一致性 | PASS | [资源检查](runs/20260921/assets-final.json)，588 个锁定文件及引用保持一致 |
| 3.4.1 Web 冷构建 | PASS | 隔离工作目录恢复 LFS，清除构建缓存后原生 Success=1；[结果](runs/20260921/build-final-cold.json) |
| 真实引擎数值 | PASS（达到目标的采样） | 实际 15/30/60/120/240 FPS；八向 Walk/Run、距离误差、长窗速度上界、真实发射时间和松开断言；[数值汇总](numeric-results.md)、[机器可读对比](runtime-comparison.json) |
| 释放观测 | PASS | 15 FPS 松开事件返回时直接输入、Avatar 扳机和原 HUD 均清空；[修复前](runs/20260921/before-release-timing.json)、[修复后](runs/20260921/after-final-release-timing.json)。这里的 0 ms 是事件回调内同步清空，不是物理硬件延迟 |
| Esc / blur | PASS（合成事件） | [Esc](runs/20260921/final-escape-15-fp.json)、[blur](runs/20260921/final-blur-15-fp.json)。不是物理键盘/系统失焦实测 |
| 长卡顿 | PASS | [400 ms 阻塞](runs/20260921/final-stall-15-fp-v3.json)：游戏自行清空，恢复位移/补发断言通过 |
| 原生引擎暂停 | PASS | [15 FPS](runs/20260921/final-engine-pause-15.json)、[60 FPS](runs/20260921/final-engine-pause-60.json)，真正调用 `Render.paused`，暂停期间更新数为零，恢复后新输入距离通过；不等同于页面 hidden |
| 跳跃 / 跑跳 | PASS | [15 FPS](runs/20260921/final-jumps-15.json)、[60 FPS](runs/20260921/final-jumps-60.json)，真实离地/落地、原生状态、FP 相机偏移及零 respawn |
| 主要路线 | PASS（列出的运行），保留一次失败 | 白台阶上下、西台阶、临水弧形台阶、入口门槛、楼前红路、红桥、亭子均取得本轮连续通行记录；详情见下表 |
| TPS 相机避障 | PASS（入口点） | [真实 shapeCast / 距离](runs/20260921/iab-final-camera-15.json)数值通过，原报告保留 INCOMPLETE；另行完成[实际截图与手动转向检查](runs/20260921/camera-visual-review.json) |
| 浏览器真实后台恢复 | **NOT TESTED** | [Chrome 尝试](runs/20260921/final-background-v2.json)与 [IAB 规定窗口内重试](runs/20260921/iab-background-window-retry.json)均没有收到原生 hidden/返回事件，不能以合成 blur 或引擎暂停代替 |

## 方法与环境

原基线与候选均在隔离工作目录 `C:/Users/freedom/.codex/worktrees/lh-m01-verification/LH` 由本机 3.4.1 CLI 构建。本轮只读原基线 `docs/baseline/acceptance.md` 和旧 `runtime-comparison.json` 来定位问题，表中 PASS 均来自本轮运行。

官方 computer-use 操作 Chrome 153 及 Codex 内置浏览器。数值核心通过 `Render.frameInterval` 限制真实更新门限，不替换 `timer.delta`、时间或物理方法；逐项统计原 `onUpdate` 次数。位置在原物理后相机回调采集，射击时间为实际更新发射时刻，不是理论截止时间。输入为经过原触屏监听的合成 PointerEvent，人工通过可见测试按钮启动。各报告保存 viewport、DPR、实际时间和输入来源。

距离阈值固定为目标距离的 3% 加两个实际物理子步；0.4～0.65 秒长窗速度上界为配置速度的 105% 加一个子步。前后使用相同数值核心，不能靠 HUD、动画状态或放宽阈值获得 PASS。

候选 1 完成 FP 五档矩阵；最终候选仅追加独立扳机取消的截止时间修复，正常移动/射击核心未变。最终候选完成 TPS 15/30/60/120/240 矩阵。两者分开记录，[源码版本](runs/20260921/source-versions.json)可追溯，不把候选 1 的实测冒充最终文件逐格重跑。

## 路线与相机

下列均经过原触屏输入回路，途中没有传送、没有引擎 respawn；每段需停止在目标 0.2 米内并落地。只把旧报告坐标用作配方，没有沿用旧结果。FPS 列是目标，逐段真实更新率见原始报告。

| 路线 | 视角 / FPS | 本轮结果 |
|---|---|---|
| 白台阶上行 | FP / 15、60 | [15：6/6](runs/20260921/iab-final-white-up-15.json)、[60：6/6](runs/20260921/iab-final-white-up-60.json) |
| 白台阶下行 | FP / 60 | [7/7](runs/20260921/final-white-stairs-down-60.json) |
| 西侧台阶往返 | FP / 15 | [7/7](runs/20260921/iab-final-west-15.json) |
| 临水弧形台阶 | FP / 15 | [6/6](runs/20260921/iab-final-arc-15.json) |
| 入口门槛往返 | TPS / 15 | [6/6](runs/20260921/iab-final-entrance-15-tps.json) |
| 教学楼前场红路 | TPS / 60 | [11/11](runs/20260921/iab-final-forecourt-60-tps.json) |
| 高架红桥往返 | TPS / 15 | [2/2](runs/20260921/iab-final-bridge-15-tps.json) |
| 亭子往返 | TPS / 15 | [10/10](runs/20260921/iab-final-pavilion-15-tps.json) |

相机在入口门后受阻时实际距离约 0.565 米，转回后约 2.080 米；[靠墙画面](runs/20260921/camera-blocked.png)、[展开画面](runs/20260921/camera-restored.png)。已实际拖动转向并查看所示方向，没有观察到穿墙/近裁剪异常。不是全场景相机穷尽验证。

## 保留的失败与边界

- 原基线 15 FPS 前进过快、射击减少，120 FPS 移动不足；本轮同协议重现，见数值对比。
- 原基线松开后的直接输入已清空，但 HUD 晚约 184.6 ms 才显示；不是把 HUD 旧值误报成实际输入一直按住。
- [旧移动公式负对照](runs/20260921/movement-negative-negative-control.json)与[取消指针负对照](runs/20260921/cancel-negative-reproduction-method.json)保留失败。
- 两次 Chrome 矩阵尝试和切标签后的 IAB 120 FPS 追加尝试实际只有约 1 FPS，分别未达到 60/240/120 目标，射击为零；它们保留为失败/INCOMPLETE，不能作为目标帧率通过或目标帧率退化。新测试页达到实际目标后重新运行；未改变游戏计时或断言。
- [Chrome 白台阶上行首轮](runs/20260921/final-white-stairs-up-15.json)第二段卡住，保留 FAIL。位置样本间有 438.7 ms 与 1983.3 ms 空档，超过游戏清输入阈值；旧探针仍持有旧指针。内置浏览器同坐标连续 15/60 FPS 上行通过。[分析](route-failure-analysis.md)区分最符合证据的原因与未直接采到的状态，不把失败删掉或修改为通过。新版探针在游戏清空旧指针时明确记录 INCOMPLETE 并停止，不自动重按；[最终工具 smoke](runs/20260921/iab-final-route-observation-smoke.json)保持原路线/容差，15 FPS 6/6 通过。
- 400 ms 卡顿的首轮功能断言通过，但 550 ms 短窗统计为约 18.2 FPS，未满足 15 FPS 范围。原结果保留；v3 保持原 550 ms 功能阈值，另用预先固定的两秒窗口判断更新频率。
- 最初构建因 LFS 指针未恢复而失败；另一次候选 CLI 停在场景校验，终止该任务进程并保存缓存后冷构建通过。没有修改引擎或可选插件绕过错误。
- 当前物理配置最多每帧 4 个 1/60 秒子步。持续明显低于约 15 FPS 时允许减速并丢弃积压，不承诺无限低帧下保持墙钟速度。
- 真实键盘长按、桌面 Pointer Lock、手机多指硬件、低天花板跳跃、所有场景障碍、GPU 专用帧时及长时压力未验。本轮只构建/运行 Web，single-html 未重建验收。

已把实际验过的 Web 构建同步到主项目 `release/web`，380 个文件逐项 SHA-256 一致；原产物备份在 `.baseline-cache/pre-m01-release/web`。[同步校验](runs/20260921/local-web-delivery.json)。`启动游戏.cmd` 可继续使用此构建；发布产物和备份按原规则不入 Git。

## 复测入口

```powershell
npm test -- --ide <LayaAirIDE-3.4.1目录>
npm run build -- --ide <LayaAirIDE-3.4.1目录>
npm run serve -- --m01-probe --port 18771
```

打开本地地址并加 `?controls=touch`。测试面板仅由开发服务注入，不进入发布 bundle；默认不自动改变游戏状态。路线方法见 [routes-testing.md](routes-testing.md)，暂停/后台协议见 [background-protocol.md](background-protocol.md)。
