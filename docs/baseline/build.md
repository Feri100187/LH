# 可复现的 LayaAir CLI 构建

## 入口

需要 Node.js 20+、LayaAir IDE **3.4.1** 和完整检出的二进制资产。IDE 路径沿用 `tools/project-config.cjs` 的 `--ide` / `LAYA_IDE_PATH` / 本机配置解析规则。

```powershell
node tools/build.cjs --ide "C:\Tools\LayaAirIDE"
node tools/build.cjs --platform single-html --ide "C:\Tools\LayaAirIDE"
```

将示例路径换成真实安装目录。平台、默认平台、输出根目录、原生构建选项与许可文件列表均读取 `config/assets.manifest.json` 的 `build` 节。当前默认平台为 `web`，默认输出为 `release/web`；单文件 HTML 默认输出为 `release/single-html`。

```powershell
node tools/build.cjs --platform web --ide "C:\Tools\LayaAirIDE" `
  --output "release\web" --report-dir ".test-reports\build-001" --timeout-ms 600000
```

`--report-dir` 必须指向新目录或空目录；未指定时自动创建带 UTC 时间与随机运行 ID 的目录。自定义输出目录须为空；项目 `release/` 下的生成目录允许重复构建。入口会解析实际目标路径，拒绝将构建输出放入源码、资产、项目根目录或项目祖先目录。

## 原生调用与冷导入

包装器通过 `spawn(..., { windowsHide: true, shell: false })` 调用官方脚本模式：

```text
LayaAirIDE --project=<绝对项目路径>
           --script=StableBaselineTools.build
           --script-args="<本轮 request.json 的绝对路径>"
```

`script-args` 的引号保留在参数值中，因此报告目录含空格也能正确传入。CLI 用独立的 `--user-data-dir` 隔离 Chromium 缓存；不向正在运行的交互式 IDE 发送操作。脚本后台执行并在结束后退出的行为见 [LayaAir 3.4 官方命令行文档](https://www.layaair.com/3.x/doc/released/commandLine/readme.html)。

`src/editor/StableBaselineTools.ts` 使用 `IEditorEnv.regClass()` 注册，仅在编辑器脚本环境中运行。它等待资产导入完成，再调用 `IEditorEnv.BuildTask.start()`，并记录 `waitForCompletion()` 返回的原生状态。

可以直接在尚无 `library/`、`local/`、`release/` 或编译 bundle 的新检出目录执行。CLI 自行完成冷导入；入口不会从另一工程复制这些目录。应使用未被交互式 IDE 打开的项目副本，不需要关闭其他项目的 IDE。

## 前置校验与结果判定

构建必须先运行 `package.json` 的 `assets:check`，并给它分配本轮独立的 `assets-check/` 报告目录与运行 ID。除了退出码，入口还核对新报告的运行 ID、项目路径、时间、完整检查结果和当前 manifest/lock 哈希。脚本缺失、报告缺失、旧报告或校验失败都会阻止原生构建。

成功需要同时满足：

1. 安装包及实际 helper 上报的版本均为 **3.4.1**。
2. 原生结果的 `runId`、项目路径、类别及完成时间属于本轮调用。
3. helper 返回 `PASS`，`nativeStatus === 1`，即原生 `BuildTaskStatus.Success`。
4. CLI 正常退出，输出目录匹配，并存在非空 HTML 入口。
5. 署名文件与完整鸭子许可成功复制，哈希与检出源文件一致。

不会仅凭 EXE 退出码或上次留下的结果文件宣布成功。超时默认 10 分钟，只终止本次启动的 PID 进程树；不会按进程名清理其他 IDE。

## 报告和许可文件

每轮目录保留：

- `run.json`：运行 ID、开始时间及构建前缓存目录是否存在。
- `request.json` / `native-result.json`：本轮请求和原生 helper 的结果。
- `ide-stdout.log` / `ide-stderr.log`：独立 CLI 日志。
- `ide-run.json`：启动参数、进程状态、原生结果核验与构建后目录状态。
- `build-summary.json`：最终判定、HTML 大小/哈希、许可复制证据及前置检查结果。
- `ide-user-data/`：该轮 CLI 独立缓存。

两个构建平台均包含：

```text
ASSET_CREDITS.md
LICENSE_DUCK_CC_BY_3.0.txt
```

单文件 HTML 指游戏代码和资源的打包形式；交付构建目录时仍应保留上述署名与完整许可。

## 共用 IDE 包装器

其他工具可复用 `tools/run-ide.cjs`：

```js
const { createIdeRun, runIdeScript } = require("./run-ide.cjs");
const run = createIdeRun({ project, category: "asset_import", reportDir });
const result = await runIdeScript({
  run,
  idePath,
  script: "StableBaselineTools.importReady",
  request: { assetPaths: ["Scene.ls", "LingshuiGame.ls"] },
  timeoutMs: 600000
});
```

包装器自行生成并覆盖请求中的运行 ID、项目路径、结果路径与预期版本。调用方应检查返回的 `status`，失败详情保留在 `ide-run.json`。本构建验收确认原生导入及打包完成；实际浏览器画面与交互仍需单独验证。
