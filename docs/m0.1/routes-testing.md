# M0.1 主要路线、跳跃与相机回归工具

工具：`tools/testing/m01-routes.js`。仅在 localhost 运行，由测试服务显式注入；默认不启动任何动作、不移动起点、不调整帧率。它独立于已冻结的 `m01-runtime.js`，不会修改数值矩阵的实现。

## 接口

```text
#m01-routes-panel
[data-m01-route-field="fps"]       # 15 / 60
[data-m01-route-field="view"]      # 路线采用 FP / TPS
[data-m01-route-field="route"]     # 单选路线
[data-m01-route-action="route"]
[data-m01-route-action="jumps"]
[data-m01-route-action="camera"]
[data-m01-route-action="stop"]
[data-m01-route-action="download"]
```

完整结果位于面板的 **`data-m01-route-status`** JSON。每次显式开始生成独立 `runId`，保留最近 8 次完整结果和最多 40 次较早摘要；失败不会改写为通过。下载文件名包含 `runId`。

工具会检查 `#m01-runtime-panel` 的运行状态，拒绝与数值矩阵并行；路线运行时也会拦截数值探针的新测试按钮。运行期间不要人工输入；Esc、手动指针/按键、失焦或后台都会停止并释放本轮输入，保留当前位置。

## 主要路线

从 `docs/site_repair/运行验收.json` 提取 `start` 和 `waypoints.target` 作为路线配方；红桥另取 `docs/游戏检查记录.json` 的起终点，亭子配方取旧往返目标点及其起点高度。旧 `pass`、旧位置观测和旧截图不作为本轮验收依据。

支持：

- `red_bridge_roundtrip`
- `pavilion_roundtrip`
- `white_stairs_up`
- `white_stairs_down`，原配方名为 `white_stairs_down_final`
- `west_stairs_roundtrip`
- `waterside_arc_steps_roundtrip`
- `entrance_threshold_roundtrip`
- `building_forecourt_red_path`

每条路线只在最初执行一次、明确记录为 **test-only setup** 的 `motor.position` / `player.transform.position` 起点设置。途中只使用公开触屏控件：向 `.touch-look` 派发拖动调整朝向，向 `.touch-stick` 派发前进输入。靠近目标降低摇杆幅度，停止后再次确认与目标的水平距离不超过 **0.2 米**且已落地。

每段记录本轮物理后位置、高度范围、`grounded`、实际 `onUpdate` 帧率、最大连续无进展时间及终点。4 秒没有至少 0.025 米的接近进展，或超过该段时限，会停止并保留 FAIL；不会把人物搬到下一点。总路线最多 240 秒。

工具包装真实 `game.respawn`，始终执行原方法，只记录调用阶段及前后位置。路线、跳跃和相机测量期间要求引擎 `respawn` **0 次**；发生时立即停止并保留 FAIL，避免把自动回安全点误当成连续走通。`respawnAudit` 区分 setup 与测量期调用，`probeMeasurementTeleportCount` 与 `engineRespawnCount` 分开记录。

## 原地跳和跑跳

按钮运行两项独立用例，分别设置已确认平地起点 `[0, 1.88, 100]`。通过真实触屏视角按钮进入 FP；原地跳使用 `.touch-jump`，跑跳同时使用奔跑按钮和前进摇杆。没有直接调用跳跃控制器。

检查真实腾空与回落、原生 `Jump/RunJump` 和 `Land/RunLand` 状态、输入释放，以及全过程第一人称相机偏移 `[0, 0.72, 0]`，最大误差要求不超过 0.005 米。低天花板限制明确保持 **NOT TESTED**。

## TPS 相机避障

候选起点 `[51.9, 3.45, -30.2]` 来自入口位置资料，并重新对**当前** `assets/resources/LingshuiCollision.json` 的三角形核实：从入口玩家相机锚点向门后方向的线段命中门面约 `[51.63, 3.947923, -31.01]`；反向朝空旷门廊的线段没有命中。该静态检查仅说明起点候选可靠，不作为运行 PASS。

测试通过实际触屏 look 拖动依次使相机朝空旷门廊、靠近门面、重新展开，记录游戏自身 `updateCamera()` 调用的原 `shapeCast` 返回值和 `cameraDistance`。不直接写入 `cameraLength`，也不会额外调用 shapeCast 制造命中结果。

数值记录包括靠墙时确实命中且镜头收缩、转回后镜头展开。测试最后停在靠墙姿势，方便保存画面。**数字通过时仍标 INCOMPLETE，`numericStatus=PASS`、`visualReview.status=NOT TESTED`**：还需主智能体/用户独立检查实际画面无穿墙或近裁剪异常，再转向观察恢复并保存证据。不得只凭距离变化宣布画面已验收。

## 观测与边界

- 状态直接取自当前 `window.lingshuiGame.getStatus()`，不依赖旧 HUD 节流。
- 原 `onUpdate` 包装只记录真实调用数，作为实际帧率；不把位置采样次数当作帧率。
- 位置在原 `cameraFollow.follow` 回调执行后采样，属于物理和动画之后。
- 15/60 FPS 只通过真实 `Laya.Render.frameInterval` 与 `stage.frameRate` 设置；没有伪造 `delta`、时间或渲染帧。
- 运行达不到所选帧率时，目标帧率标 **NOT TESTED**，即使路线位置通过也不能冒称该目标下完成。
- 所有输入标为 **synthetic-input**；测试公开 UI 的运行链路，不代表真实手机、多指硬件或原生指针捕获已经通过。
- 正常结束、失败或停止都会释放本轮指针、关闭本轮开启的奔跑并恢复原帧率和被观察的方法。

## 输入中断诊断

最终探针记录输入重置原因与更新帧时间。游戏因长帧清空仍由探针持有的旧摇杆指针时，本轮立即 INCOMPLETE，不重新按下输入。失败段保留完整观测字段；旧 FAIL 记录不改写。详见 [台阶失败分析](route-failure-analysis.md)。
