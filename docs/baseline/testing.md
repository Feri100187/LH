# 测试入口与报告边界

## 环境

- Node.js 20 或更高版本，以及 npm。
- 先运行 `npm ci`。项目只使用 `package-lock.json` 锁定的 **TypeScript 5.9.3**，不读取 IDE 内置编译器，也不支持 `TYPESCRIPT_PATH` 替代版本。
- 检出需要包含真实的模型和纹理文件；若使用 Git LFS，应先完成 LFS 文件取回。
- 完整验收需要安装 **LayaAir IDE 3.4.1**。测试只读取其引擎源码，不启动 IDE，不操作正在运行的窗口。

```powershell
npm ci
npm test -- --ide "C:\Tools\LayaAirIDE"
```

将示例安装目录换成实际路径。也可以通过环境变量配置：

```powershell
$env:LAYA_IDE_PATH = "C:\Tools\LayaAirIDE"
npm test
```

IDE 路径统一由 `tools/project-config.cjs` 解析，优先级为 `--ide`、`LAYA_IDE_PATH`、本机 `project.local.json` 的 `layaIdePath`，最后是 PATH / 常见安装目录发现。测试不依赖项目位于某个固定目录，也不假定 IDE 位于项目的 `../../LayaAirIDE`。

## 执行内容

`npm test` 依次执行当次类型检查及五套测试：

| 步骤 | 当前数量 | 主要覆盖 |
|---|---:|---|
| TypeScript 类型检查 | 1 | 当前项目源码与已检入的类型定义 |
| `test-player-avatar.cjs` | 19 | 真实角色类的状态、跳跃恢复、朝向、射击节奏 |
| `test-player-input.cjs` | 25 | 真实输入处理、连发与释放、速度滑窗、指针捕获源码契约 |
| `test-player-directional.cjs` | 24 | 八方向、相位、FPS 可见性、相机跟随与引擎更新顺序 |
| `test-lake-ducks.cjs` | 10 | 实际预制体、原生顶点、水面三角形、真实鸭子运动方法 |
| `testing/asset-entry-contract.cjs` | 11 | 真实资产/构建入口的失败传播、新报告匹配、清单配置和零资产写入 |

五套共 89 项，加类型检查共 90 项。测试均读取本次检出的源码和资产；鸭子测试直接解析当前水面 GLB，重新计算路线包络，不读取历史 `placement_audit.json` 的 PASS 或几何测量结果。

资产入口测试把当前受保护文件复制到本轮报告目录，用真实 Node 入口测试旧 source 参数、源文件哈希变化、缺失/过期报告和导入失败。它只替换 IDE 进程边界及故意破坏的 checker 输出，不启动 IDE；结果归类为工具契约，不能作为原生导入或渲染成功证据。全部通过后删除该副本，保留逐项报告与日志；失败时保留副本供排查。

可单独执行某套，也可以只检查类型：

```powershell
npm run typecheck
node tools/test-player-input.cjs --ide "C:\Tools\LayaAirIDE"
```

## 新报告目录

默认每次创建独立目录：

```text
.test-reports/<UTC 时间>-<本次运行 ID>/
```

也可指定本次的准确输出目录：

```powershell
npm test -- --ide "C:\Tools\LayaAirIDE" --report-dir ".test-reports\run-001"
```

`TEST_REPORT_DIR` 环境变量也可设置报告目录，命令行参数优先。显式目录必须不存在或为空；非空目录会被拒绝，防止覆盖旧结果。测试不会修改 `docs/player_avatar/`、`docs/lake_ducks/` 中的历史报告。

目录内容：

- `run.json`：本次运行 ID 与开始时间。
- `summary.json`：类型检查、各套状态、分类统计及未验证事项。
- `typecheck.json`：编译器版本、退出状态及诊断。
- 五套独立 JSON 与日志：当次源码哈希、资产证据、所用引擎文件路径/哈希和逐项结果。
- `asset-entry-cases/`：真实入口的成功/预期失败报告及日志。

统一入口只收集当前运行 ID 对应的报告。缺少某套新报告、子进程异常或报告与退出状态不一致都会导致失败。

## 如何解释结果

聚合结果将检查分为：

- `typecheck`：静态类型检查。
- `logic`：转译真实 TypeScript 类，在轻量替身中执行其方法。
- `asset_contract`：检查当前场景绑定、原生模型数据和水面几何。
- `engine_contract`：读取已配置的真实 LayaAir 3.4.1 引擎源码，并检查回调/调用顺序契约。
- `tooling_contract`：在隔离资产副本上执行真实入口，核对失败传播、报告新鲜度、配置传递和原始文件不变。

缺少 IDE 或所需引擎源码时，相关项目标为 **NOT TESTED**；统一运行标为 **INCOMPLETE**，并返回非零状态。不会用替身替代引擎契约后宣布全量通过。显式配置了错误路径或不支持的 IDE 版本会直接报告配置失败。

Node 测试入口的退出值为：`0` 全部要求项通过，`1` 失败，`2` 要求项存在未验证。调用方应将 npm 的任何非零状态视为未完成验收。

`PASS` 仅针对上述要求项。`summary.json.not_verified` 明确保留以下 **NOT TESTED** 项：真实浏览器/操作系统交互、实际 Laya 渲染、Bullet 物理执行、跨帧率移动速度、纹理/变形画面及完整湖岸障碍与视线审计。这些需要独立的 IDE 或运行版验收。

## 可迁移性验证

测试辅助代码使用模块位置确定项目根目录，使用本地 npm 依赖和统一 IDE 配置；报告可以输出到项目外的新目录。运行测试无需历史 QA JSON、`library/`、`release/` 或邻接的 IDE 安装目录。新检出位置应先执行 `npm ci`，再显式配置 IDE 进行完整测试。
