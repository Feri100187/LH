# LH 当前稳定基线

本轮仅建立可复现入口与验收记录，未新增水枪命中玩法。引擎固定 **LayaAir 3.4.1**。本轮结果与未验证项见 [acceptance.md](acceptance.md)。

## 资源合同

`config/assets.manifest.json` 决定当前有效来源、入口 prefab、UUID、动画及网格数量；`config/assets.lock.json` 锁定 588 个现有资源/配置文件。哈希不一致时停止，不自动重写锁文件。

| 分组 | 默认来源 | 进入游戏的资源 | 处理方式 |
|---|---|---|---|
| 场景 | `Scene.ls` | BuildSettings 中原启动 UUID | 核对副本、引用与 hash |
| 世界 | `凌水湖_游戏修复.blend` / `LingshuiLake.glb` | `LingshuiEnvironment.lh` | 保留 14 个 site_fixed + 1 个入口 native 网格、植被/水面覆盖 |
| 人物 | `neck_short_20260920/AnimeWatergunBoy_NeckShort.glb` | `PlayerAvatar.lh` + native prefab | 44 mesh、55 骨、20 源动作 → 24 游戏 clip |
| 状态机 | `PlayerAnimation.controller` | 外部 `AnimationController` 引用 | 21 移动状态 + UpperIdle/Shoot；上身遮罩 |
| 第一人称 | `first_person_20260920/WatergunArms.glb` | `WatergunArms-unpacked/WatergunArms.lh` | 15 mesh、55 骨、Idle/Shoot；连续袖管 |
| 鸭群 | `LakeDucks/Duck.glb` | `LakeDucks.lh` + Duck native prefab | 5 实例、共享 1K 贴图，保留水线与巡游参数 |

完整逐项证据见 [resource-audit.md](resource-audit.md) 与 [resource-audit.json](resource-audit.json)。角色比例、八向步态、镜头、移动参数、场景外观及水面材质均作为既有输入保存。

## 唯一导入入口

```powershell
npm run assets:check
npm run assets:prepare
npm run assets:import -- --ide '本机IDE目录'
```

- `check` 验证 LFS 实体、源 hash、锁定文件、UUID 唯一性、场景/动画/材质引用与数量。
- `prepare` 从清单选源，在 `.baseline-cache/imports/<runId>/` 生成候选。原 `.meta` 逐字节复制；候选与批准的游戏 GLB 不同则失败，运行 assets 不被覆盖。
- `import` 执行上述检查，启动独立 LayaAir 3.4.1 CLI 导入，再比对当前缓存的 `.lm/.lani` 和已提交 native 文件。IDE 失败、版本不符、旧报告、旧来源都不接受为成功。
- `--asset player|firstPerson|ducks|world` 可缩小准备/导入范围；全项目合同仍必须满足。
- 旧 `sync-player-*.py` 兼容入口只做当前缓存/原生资源一致性检查，不写文件或生成新 UUID。缺缓存时先运行 `assets:import`。

本基线以 **Git + LFS 中已提交的 native 资源**为恢复来源。世界有人工场景补丁与反射配置，现有 Blender 作者脚本不能从零完整重建它们，不能用全场景自动解包覆盖 prefab。若未来确需改模型，另开资产变更，审查源、native、引用、清单和锁文件的配套变更。

`author-*`、`build-first-person-arms.py`、`refine/shorten-character-neck.py`、`prepare-lake-duck.py` 是归档制作配方，已从脚本位置定位工程，不能作为稳定资源导入命令；本轮未执行这些配方。历史报告中的旧命令不再生效。

## 环境、测试、构建

按根目录 [README](../../README.md) 完成 `git lfs pull`、`npm ci` 后运行：

```powershell
npm run doctor -- --ide '本机IDE目录'
npm test -- --ide '本机IDE目录'
npm run build -- --ide '本机IDE目录' --platform web
npm run build -- --ide '本机IDE目录' --platform single-html
npm run serve -- --root release/web --port 18766
```

TypeScript 精确固定为 5.9.3（仅验证依赖，不升级引擎）。Node ≥20、Python ≥3.10；可用 `PYTHON` 指定解释器。IDE 路径优先级：`--ide` > `LAYA_IDE_PATH` > 未入库的 `project.local.json` > 常见安装位置。所有脚本按自身位置定位项目，不依赖从哪个工作目录调用。

`packages/manifest.json` 与其锁文件不再声明可选编辑器 MCP 插件。新目录曾因自动安装 `com.layabox.layamcp@1.1.1` 触发素材商店未登录弹窗；移除这项非游戏依赖，使基线不依赖账号登录。原运行资源、代码和引擎版本保持不变。`.gitattributes` 的 `* -text` 保留已有 LF/CRLF 原始字节，避免系统级 Git 配置改变哈希。

`npm test` 区分逻辑、资源合同、引擎源码合同和工具入口检查。缺 IDE 的引擎检查标为 NOT TESTED，整体 INCOMPLETE，退出码 2；失败退出 1。逻辑测试不等于渲染或物理运行验收。

构建检查原生 `BuildTaskStatus.Success=1`、工程路径、引擎版本和本次 runId；同时确认 HTML 产物与署名/完整许可。新目录运行使用独立端口，启动日志写出实际服务根目录，避免打开旧构建。

## 实际运行与性能采样

可执行 `npm run serve -- --root release/web --port 18766 --probe` 加载开发验证面板；普通服务没有此面板，发布文件也不会被修改。探针通过已公开的 HUD 只读状态记录实际渲染，模拟键盘按下/抬起经过游戏输入监听器，不能替代真实鼠标/手机验证。使用方法和统计定义见 [runtime-testing.md](runtime-testing.md)。

性能是记录环境下的当前值，不是帧率承诺。HUD FPS 与浏览器 RAF 间隔分别报告；后台、遮挡、其他应用以及屏幕刷新率可能影响结果。没有 GPU 专用计时、真机压力或全场景长时间测试时，明确列为 NOT TESTED。

## 变更边界

保留：现有 `.meta` / UUID、运行控制器、场景/角色/动画/第一人称资源、碰撞配置、双视角、巡游鸭群与水面。

本轮没有命中判定、伤害、弹药、目标、联机或新动作。本轮报告只记录此次执行；`docs` 下早先各阶段验收继续保留为历史记录。
