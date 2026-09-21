# M0.1：LayaAir 3.4.1 角色移动与物理时间语义

核查日期：2026-09-21。范围是本机安装源码、WASM 导出表、当前项目源码与配置；没有启动 GUI，也没有运行实际碰撞模拟。本文件记录修复前调用链及建议，不能替代修复后的游戏实测。

## 结论

1. 本机 Bullet 后端的 `CharacterController.move(v)` 设置的是**每个物理子步使用的位移**，不是“本次渲染帧移动一次”。修复前 `LingshuiGame.onUpdate()` 的 `speed * renderDt` 与这个接口不匹配。
2. 应从 `world.physicsSimulation.fixedTimeStep` 取得实际步长 `h`，核对它与 `Laya.Scene3D.physicsSettings.fixedTimeStep` 相同，再传 `velocity * h`。不要硬编码 60，也不要用 `manager.dt`：后者是一轮物理更新的总时长，可以包含多个子步。
3. 当前项目配置是 `h = 0.016666666666666666`、`maxSubSteps = 4`。引擎类的默认值 `maxSubSteps = 1` 不能代替项目设置。已有发布入口也包含项目的 4 步配置；运行验收仍需读取实际 manager。
4. Scene3D 外层会保留超过本帧预算的积压时间。只删除业务 `dt` 上限、只改 `move()`，或只改 `manager.update()`，都不能解决长卡顿后的追赶。
5. 本机 WASM 没有导出角色 `setVelocityForTimeInterval` 或 `setLinearVelocity`；不能把上游 Bullet 的接口当作当前可调用的 Laya API。

## 1. `move()` 的实际调用链

以下行号相对于 `D:/a/LayaAirIDE/resources/engine/libs/`：

| 文件与行号 | 实际行为 |
|---|---|
| `laya.physics3D.js:481–483` | `CharacterController.move(movement)` 原样调用 `_collider.move(movement)`，不乘时间。 |
| `laya.bullet.wasm.js:417–420` | `btCharacterCollider.move(disp)` 写入临时向量，调用 `btKinematicCharacterController_setWalkDirection`。 |
| `laya.bullet.wasm.js:2820–2827` | 角色通过 `btDynamicsWorld_addAction` 加入物理世界，每个内部步执行角色 action。 |
| `laya.bullet.js:82578–82615` | 编译后的 `setWalkDirection` 把参数复制到角色保存的向量并打开 walk-direction 模式。后一次调用覆盖前一次，不累加。 |
| `laya.bullet.js:83835–83849` | `playerStep` 在 walk-direction 模式直接把保存的位移传给 `stepForwardAndStrafe`；另一个速度模式才乘剩余时间与当前子步时长的较小值。 |

因此，一次渲染期间发生两次物理子步时，同一个保存的 `disp` 会被使用两次。两个物理步之间的多个 `move()` 调用只保留最后一次意图。`move(Vector3.Zero)` 能停止后续水平移动，但不会清除重力和起跳产生的垂直状态。

本机 Bullet 的 `Character_SimulateGravity` capability 为 `false`（`laya.bullet.wasm.js:390`），所以 `CharacterController.onUpdate()` 内部的 `/60` 重力模拟分支（`laya.physics3D.js:341–344`）在此后端不会执行，不能拿它作为业务移动乘数的依据。

类型定义仅把 `move` 描述为位移，见 `engine/types/LayaAir.d.ts:15294–15299` 和 `49927–49932`；具体“每子步”的结论来自以上实际实现。

## 2. 两层固定步与积压

`laya.d3.js:9647–9674` 的 `Scene3D._update()`：

```text
delta = scene.timer.delta / 1000
scene._physicsStepTime += delta
steps = min(floor(scene._physicsStepTime / globalH), globalMaxSubSteps)
if steps > 0:
    physicsManager.update(steps * globalH)
    scene._physicsStepTime -= steps * globalH
更新 3D Script、Animator 等组件
onAfterSceneUpdate
```

Profiler 开启时的替代实现保持相同物理逻辑，见 `laya.d3.js:10082–10123`。

`btPhysicsManager` 在构造时复制 `physicsSettings.fixedTimeStep/maxSubSteps`，见 `laya.bullet.wasm.js:2219–2220`。Scene3D 此后读取的是全局 `Scene3D.physicsSettings`，manager 读取自己的副本；场景创建后只改其中一侧会造成两层时间配置分叉，应拒绝不一致或同步处理。

manager 在 `laya.bullet.wasm.js:2265–2269` 再调用：

```text
btDiscreteDynamicsWorld_stepSimulation(world, elapsedTime, manager.maxSubSteps, manager.fixedTimeStep)
```

编译后的 Bullet 实现在 `laya.bullet.js:74871–74941`：先计算内部可执行步数并扣掉完整步数对应的内部余额，再截断实际执行数量。它与 Scene3D 的外层余额策略不同。不能假定 Bullet 丢弃超额时间就意味着 Scene3D 也丢弃了。

当前项目 `settings/PlayerSettings.json:15–17` 为 4 步，单帧物理预算约 66.67 毫秒。15 FPS 在数学上刚好触及预算，没有额外追赶余量；明显低于该帧率时可以接受受控慢模拟，但不能宣称仍与墙钟一致。不要设置 `maxSubSteps = 0` 试图使用 Bullet 的变步长模式：Scene3D 外层会把 `steps` 截为 0，根本不调用物理更新。

`btPhysicsManager._updateCount` 每次 `_simulate()` 只加 1，不能当作物理子步计数。验收应分别记录 manager 接收的 `elapsedTime`、固定步长、预计子步数与实际位移。

## 3. 更新顺序与读回时机

当前 `assets/Scene.ls:4–16` 把 `LingshuiGame` 脚本挂在 2D `Scene` 根节点；3D 世界是其 `Scene3D` 子场景。脚本 UUID 为 `05c791e1-eeac-4708-a700-002e211a5589`。

1. `laya.core.js:19614–19615`：组件选择 owner 所属场景的 component driver，没有专属 driver 时回退到 Stage driver。
2. `laya.core.js:26933–26942`：Stage `_runComponents()` 在所有 `Scene3D._update()` 之前执行。因此当前 2D 根脚本 `onUpdate` 可以在物理前提交意图或一次性丢弃时间。
3. `laya.bullet.wasm.js:2565–2572`：更新物理、读回角色 Transform、派发碰撞。
4. `laya.d3.js:9663–9674`：执行 3D Script、组件管理器/动画更新，最后 `callAfterSceneUpdate()`。
5. 当前 `src/PlayerCameraFollow.ts:4` 在最后一步回调主脚本相机跟随，时机正确。

`btPhysicsManager._updateCharacters()` 在 `laya.bullet.wasm.js:2490–2493` 逐角色同步 Transform。这里传入的 `0.04` 是局部形状偏移相关的高度 margin，不是“移动小于 4 厘米不更新”的阈值；实际同步实现在同文件 `224–261`。

注意：`Stage.render()` 通常在完成场景与渲染后才更新全局 timers（`laya.core.js:26967–26971`、`27063–27072`）。脚本与物理读到的 `Laya.timer.delta` 是当时引擎保留的帧样本，不能假定它就是刚进入本次 RAF 的墙钟间隔。长卡顿验收应同时记录墙钟 gap 和引擎 delta；前后物理位置配对也应使用同一轮模拟时长。

## 4. 速度接口可用性

| 接口 | 本机构建结论 |
|---|---|
| `CharacterController.move()` | 可用，按以上每子步位移语义调用。 |
| `CharacterController.getVerticalVel()` | 可用，但只有垂直速度，见 `laya.physics3D.js:478–479`、`laya.bullet.wasm.js:447–448`。 |
| 角色 `setVelocityForTimeInterval` | `bullet.wasm` 导出表不存在；`laya.bullet.wasm.js` 文本匹配为 0。 |
| 角色 `setLinearVelocity` | `bullet.wasm` 导出表不存在；不要与刚体 `btRigidBody_setLinearVelocity` 混淆。 |
| 非 WASM 编译内部速度函数 | `laya.bullet.js:82618` 有 C++ 编译内部函数，但没有对外包装/导出，不是业务可调用接口。 |

导出结论来自 `WebAssembly.Module.exports(new WebAssembly.Module(bytes))` 对本机 `bullet.wasm` 的只读枚举；没有实例化物理世界。无需重编译或修改安装目录来完成本轮位移修复。

## 5. 暂停、恢复与长卡顿的最小措施

### 公共 API 的边界

- `Laya.Render.paused` 是类型定义中的公共静态属性（`LayaAir.d.ts:69981–69986`）。暂停时 Render 不执行 Stage，并同步全局 timer 的 timestamp；恢复时标记 timers resumed。实现见 `laya.core.js:26250–26258`、`26296–26301`、`26335–26339`。这是全引擎暂停，不会清除此前已经积累的 Scene3D 余额。
- `Timer.pause()/resume()` 仅把 scale 设为 0/1（`26527–26531`）。暂停期间若仍执行 Timer `_update` 会更新 timestamp；单独 resume 不做 Render 的 resumed 标记。它同样没有清空 Scene3D 余额的功能。
- `Stage.renderingEnabled=false` 在后台可见性处理里自动设置（`26641–26643`）；Stage 根组件与 timers 仍可能执行，3D 更新被跳过。不能把它当作完整游戏暂停。
- `Stat.enablePhysicsUpdate=false` 仅跳过 manager 调用，Scene3D 仍按 cap 扣余额；长 gap 的其余积压还在。
- 本机源码与类型定义中未找到清除 `Scene3D._physicsStepTime` 的公共方法。

### 对主线程提出的定点 adapter 的评估

在**当前 2D 根脚本的物理前回调**，只对暂停/失焦/长 gap/恢复 latch 帧执行：

```text
scene._physicsStepTime = -scene.timer.delta / 1000
```

随后 Scene3D 使用同一个 `scene.timer.delta / 1000` 做相加，余额恰好回到 0，因此本帧不模拟；旧欠账与当前 gap 一起丢弃。这个写法比先写 0 更准确：先写 0 仍会把当前长 delta 加回来。也比在 manager.update 里截断更直接：后者不能清除 Scene3D 外层余额。

建议约束：

- 封装在一个明确针对 3.4.1 的小 adapter，核对字段存在、delta 有限且非负、实际步长有效且与全局设置一致；正常帧不写私有余额。
- 用源码契约固定调用顺序，包含普通与 Profiler 两条 Scene3D 路径；以后移动脚本到 3D 节点时必须重新核对，不能继续在物理后使用该写法。
- 丢弃帧同时清输入、水平 move、jump/shoot 队列和速度统计；不把丢弃的墙钟时间记入移动动画、射击冷却或平滑速度分母。
- hidden 时 3D 更新可能不发生，负值会暂时留存；恢复 latch 必须在第一帧的物理前，用当前 delta 再覆盖一次，避免沿用后台帧的负值。
- 保留当前 `h/maxSubSteps=4`；超出正常预算的帧选择有限模拟还是丢弃应是明确策略，不通过“补偿一次大位移”追回时间。`.25s` 是本轮建议的卡顿阈值，属于游戏策略，不是引擎固有常量。

仅检查单帧 `gap > .25s` 还有一个边界：持续 10 FPS 的每帧 0.1 秒达不到卡顿阈值，但每帧仍超过 `4*h`，会累积欠账，恢复高帧率后出现多帧追赶。如果 M0.1 只承诺至少 15 FPS，可明确记录该预算限制；若要求任意低帧率恢复都不追赶，还需给外层累计余额设置从 `maxSubSteps*h` 推导的有限上限。该策略应独立验收，不能声称单次 gap 丢弃已经覆盖。

这是对当前源码的确定性分析，私有字段方案仍需要真实引擎负例验收：正常 15/30/60/高 FPS、连续暂停恢复、>250ms 卡顿、碰墙、起跳中暂停、后台恢复以及松键后无残留移动。

## 6. 本次证据哈希

路径前缀 `IDE/` 指 `D:/a/LayaAirIDE/resources/engine/`；项目文件记录的是只读核查时的版本，主线程后续修复会改变源码哈希。

| 文件 | SHA-256 |
|---|---|
| `IDE/libs/laya.core.js` | `fdb94d646341eb297e94b93589464b06579bf3ef580a9126cf6eca7c61b7dffc` |
| `IDE/libs/laya.d3.js` | `ca8bfea4b5701283364938751cb91d9ba7a048a207dd20027d13c5be867d0dcf` |
| `IDE/libs/laya.physics3D.js` | `ffd076984767167a3ed9ce6c211ba82ac8621fa79db985025f3cd09dcad439a3` |
| `IDE/libs/laya.bullet.wasm.js` | `d5e2bfb5190888f75ce4f80de0acfb71cddcd4fbe969e3de97274830f1b71d1c` |
| `IDE/libs/laya.bullet.js` | `50ea4ecde44f71a61aad07b248b531c6314ad6e8af904e707431fdea870434a5` |
| `IDE/libs/bullet.wasm` | `7283880f8f0568d6b703260d360ad33f425af4bf4c8b3beb35a5bdd4b5dfa648` |
| `IDE/types/LayaAir.d.ts` | `6c15742fbbd7b5b63dc24bba96efaa535cd59d639c9da01dfd3f81255068fb41` |
| `settings/PlayerSettings.json` | `c4ffce9a1b1f271ef28c635c3741b93ae14a9bf864ca0e557a973238810ebd68` |
| 修复前 `src/LingshuiGame.ts` | `008b37df37c958c7cbcfc7a676c5c9a910b3347188563604cbc862d9b9d9b3e5` |
| `src/PlayerCameraFollow.ts` | `e8595c20aa7691049b035bf12356fc43f39d811d7a182317ecaf1b00ad76e76c` |
