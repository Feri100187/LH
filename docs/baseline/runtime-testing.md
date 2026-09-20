# 浏览器运行基线探针

探针是独立验收工具，不属于游戏玩法。只有开发服务显式使用 `--probe` 时，服务器才在返回的 `index.html` 中临时加入 `/__baseline__/runtime-probe.js`；磁盘中的构建产物和普通服务响应保持原样。

## 使用

先完成本次 Web 构建，再使用一个空闲端口启动服务，例如：

```powershell
node tools/serve.cjs --root release/web --port 18766 --probe
```

在支持真实 Pointer Lock 的桌面浏览器打开服务打印的地址。探针默认只显示右上角可收起面板，每 100 毫秒读取公开 HUD，不会自动按键、采样帧率或改变人物。

### 自动按键冒烟测试

1. 先让人物处于空旷平地。测试使用真实游戏移动路径，因此障碍、水域或人工输入会影响结果。
2. 如鼠标已经锁定，先按 Esc。点击“自动按键冒烟测试”，再点击原游戏入口取得真实鼠标锁定。
3. 探针最多等待 60 秒获得 `ready`、桌面输入模式、页面焦点和真实鼠标锁定。满足后自动执行约 18 秒的按键回路。
4. 测试结束后按 Esc 释放鼠标，即可查看面板或下载 JSON。执行中按 Esc 或点击“停止”会中止测试。

测试顺序：

| 阶段 | 输入 | 主要证据 |
|---|---|---|
| 就绪/待机 | 不按键，750 ms | `ready`、角色加载、地面待机状态 |
| 前后左右 | W、S、A、D，各 850 ms | 原生动作名、实际速度、输入方向上的位移 |
| 四个斜向 | W+A、S+D、W+D、S+A，各 850 ms | 对应斜向动作、实际位移、身体朝向保持与视线一致 |
| 奔跑 | Shift+W，850 ms | `Run` 原生动作、速度和位移 |
| 跳跃/落地 | Space，750 ms，再观察 1800 ms | 起跳前在地面、腾空、高度增加、再次落地 |
| 长按连射 | F，1000 ms | 至少三次发射计数增长、射击和扳机状态 |
| 松开射击 | 不按键，850 ms | 射击停止、尾段计数稳定 |
| 两次视角切换 | V，各 750 ms | `firstPerson` 改变、世界角色与第一人称双臂互斥显示 |

输入通过 `document.dispatchEvent(new KeyboardEvent(...))` 进入现有游戏监听，报告明确标记 **`synthetic-input`**。探针不调用游戏控制器、不直接设位置/相机、不伪造鼠标锁定，也不把人物传送回测试起点。成功执行两次 V 会返回原视角；中途取消保留当时状态。

所有持有键在每个阶段结束以及最终 `finally` 中释放。失焦、进入后台、丢失鼠标锁定、人工按键、Esc 和停止按钮也会中止并释放探针持有的键。锁定等待和实际执行分别有 60 秒时限。

**验收边界：** 合成键盘测试可以证明游戏在真实运行页中响应相应事件，不能证明物理键盘、鼠标点击、Pointer Lock 获取流程、`setPointerCapture`、手机硬件或多指操作全部正确。真实鼠标锁定仅是运行前置条件，不能据此声称指针捕获已经通过测试。画面质量仍需人工观察。

### 触屏合成冒烟测试

通过游戏已有的 `?controls=touch` 入口显示触屏控件，确认人物在空旷平地、奔跑开关关闭、控件已松开，然后点击“触屏合成冒烟测试”。它不要求也不伪造 Pointer Lock。运行期间保持页面前台，避免同时手动点击、拖动、滚动或按键；人工输入、失焦、后台、Esc 或停止按钮会中止本轮。

该按钮复用上表的 15 个阶段和断言回路，但实际事件为 **`synthetic-touch-input`**：

- 向公开 `.touch-stick` 派发 `pointerdown`，向 `document` 派发 `pointermove`/`pointerup`，完成八方向满幅摇杆移动。
- 使用 `.touch-run` 的 `pointerdown`/`pointerup` 开关奔跑，再推前方摇杆。
- 使用 `.touch-jump`、`.touch-shoot`、`.touch-view` 的 `pointerdown`/`pointerup` 测试跳跃、长按连射和两次视角切换。
- 不访问转向区，不自动旋转镜头，不直接修改玩家或控制器。每阶段结束及最终清理都会释放本轮合成指针，关闭本轮开启的奔跑开关。

**报告中的 W/S/A/D、Shift、Space、F、V 是复用的动作标签与 `equivalentKeys`，触屏测试实际派发的是 `PointerEvent`，没有发送真实或合成键盘按键。** 控件运行前已开启奔跑或仍被其他指针占用时，报告 `INCOMPLETE`，不会擅自接管已有输入。

合成指针可通过控件监听和 `document` 后续事件验证真实运行中的游戏反应。浏览器不会把这些事件当成真实活动触点，因此原控件中 `setPointerCapture` 对合成 pointer ID 的异常由现有回退处理捕获；**本测试通过不能证明原生指针捕获已验证**。

三类证据需要分开记录：

1. 本按钮的触屏合成事件运行报告。
2. 官方浏览器/电脑工具实际 GUI 点击、拖动控件的观察与截图。
3. 真实手机、多指硬件、桌面鼠标锁定和物理键盘测试。

前两类都不能代替第三类。某个浏览器不能取得 Pointer Lock 时，桌面键盘测试保持 `INCOMPLETE`/未验证；触屏通过不覆盖该缺口。

### 30 秒 FPS / RAF 采样

点击对应按钮后才开始。无需锁定鼠标，也不会产生任何输入。

- 累计 **30 秒可见页面时间**，最多等待 60 秒墙钟时间。隐藏时段不计入，恢复后第一段 RAF 间隔也丢弃。
- `hudFps`：约每秒读取一次公开 `playerStatus.fps`。
- `rafIntervalMs`：相邻可见页面 `requestAnimationFrame` 回调的间隔，单位毫秒。
- 两组均报告 `n / mean / p50 / p95 / min / max`；分位数采用排序后线性插值。
- 另记墙钟时长、有效可见时长、剔除的隐藏时长、失焦时长、超过 250 ms 的 RAF 间隔及运行异常。

这些是页面调度与游戏公开帧率计数，**不是 GPU 帧时**。工具截屏、切换窗口、浏览器调度或后台限制都可能影响结果；不应把单次测量直接解释为纯渲染性能。可见但失焦的时间保留并单独标记，未把卡顿样本静默过滤掉。

没有足够有效样本、超时或超过内部 RAF 容量时报告 `INCOMPLETE`，保留已获得的部分统计。测量期间发生运行异常时报告 `FAIL`。

## 公开接口与报告

仅从以下现有 DOM 字段读取游戏状态：

```text
#lingshui-hud.dataset.playerStatus
#lingshui-hud.dataset.duckStatus
```

不会访问 `Laya` 全局、私有 Animator 数据、控制器对象或物理对象。鸭子状态只记录公开快照及数量，本探针没有将其扩展为鸭子路线/碰撞测试。

面板与按钮的稳定选择器：

```text
#baseline-runtime-probe
[data-baseline-action="smoke"]
[data-baseline-action="touch-smoke"]
[data-baseline-action="fps"]
[data-baseline-action="download"]
[data-baseline-action="stop"]
```

完整当前报告在面板的 **`data-baseline-status`** JSON 中。可通过 DOM 读取，例如在浏览器开发者工具中：

```javascript
JSON.parse(document.getElementById("baseline-runtime-probe").dataset.baselineStatus)
```

主要字段：

- `status / lastOperation / active`：最近一次操作及当前阶段。
- `environment`：测试开始时的 `userAgent`、视口宽高、`devicePixelRatio`，以及 DOM canvas 的 backing/CSS 尺寸。主 `canvas` 按 CSS 面积选择并明示规则，另保留最多 8 个 canvas；不创建或查询 GPU context。挂载、首次 ready 和每次显式开始测试时刷新。
- `latest`：最近公开玩家/鸭子状态、页面可见性、焦点、诊断内容未变化时长。
- `smoke.runId / steps / status / reason`：每阶段断言、动作与方向、起止状态、观察数量；中断时记录所在阶段。
- `touchSmoke.runId / steps / status / reason`：独立的触屏合成报告；原 `smoke` 键盘报告保留。完成时另记 `releasedAllOwnedPointers` 和 `restoredOwnedRunToggle`。
- `performance.runId / status / hudFps / rafIntervalMs`：采样统计及影响因素。
- `samples`：最近过程快照，最多 200 条；超出时记录 `droppedSamples`。完整阶段证据保留摘要，不依赖这 200 条覆盖全部过程。
- `errors`：`error`、资源错误与 `unhandledrejection`，最多保留最近 50 条，另有总数和丢弃数。探针不会拦截或吞掉原异常。
- `notVerified`：尚未覆盖的硬件交互、GPU 时间、人工画面与全场景检查。

内部 RAF 间隔最多暂存 20,000 条，仅把汇总统计写入报告，原始帧数组不进入下载文件。正常报告远小于数 MB。DOM 报告通常每 500 ms 更新，阶段切换和完成时立即更新。

“下载 JSON”生成文件名：

```text
lh-runtime-baseline-<smoke、touch-smoke 或 fps runId>-<UTC 时间>.json
```

`PASS` 只针对当次列出的断言或采样完整性。动作/位移断言失败为 `FAIL`；前置条件丢失、取消、锁定超时或状态停止更新为 `INCOMPLETE`。冒烟测试还会检查探针加载后捕获到的运行错误；有此类错误时不能得出整轮 `PASS`。未运行的操作仍为 `null`。

## 本工具的验证范围

脚本可先用 `node --check tools/testing/runtime-probe.js` 做语法检查，但这不代替浏览器运行。本文件描述验收方法，不预先宣称本次浏览器、鼠标或手机测试通过；实际结果应保存当次下载报告和必要的画面证据。
