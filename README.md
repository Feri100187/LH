# LH · 凌水湖

LayaAir **3.4.1** 三维漫游项目：湖区场景、动漫水枪玩家、八方向动画、第一人称/右肩视角、水面与 5 只鸭子。当前水枪只有动作和水流表现，尚无命中、伤害或敌人玩法。

## 从全新目录开始

前置条件：Git + Git LFS、Node.js 20 或更高、Python 3.10 或更高、LayaAir IDE **3.4.1**。TypeScript 通过仓库锁文件安装，无需全局安装。

```powershell
git clone https://github.com/Feri100187/LH.git LH
```

```powershell
cd LH
git lfs install --local
git lfs pull
git lfs fsck --objects
npm ci
$env:LAYA_IDE_PATH = '填写本机 LayaAirIDE 安装目录'
npm run doctor
npm run assets:check
npm run assets:import
npm test
npm run build
npm run serve -- --port 18765
```

浏览器打开终端显示的本地地址。也可在 LayaAir 3.4.1 中打开 `LH.laya`，运行启动场景 `assets/Scene.ls`。`启动游戏.cmd` 继续用于启动已经生成的 `release/web`。

IDE 路径也可通过各命令的 `--ide` 参数或不入库的 `project.local.json` 设置，格式见 `project.local.example.json`；共享脚本不包含固定磁盘路径。

项目不再把编辑器 MCP 插件 `com.layabox.layamcp` 列为构建依赖，冷导入无需登录素材商店下载它。MCP 是可选的本机编辑器辅助工具，不参与游戏。`.gitattributes` 保留原始字节，避免 Windows 换行转换破坏资源哈希。

## 唯一资源入口

- [资源清单](config/assets.manifest.json)：当前场景、模型、动画、第一人称资源及来源。
- [资源锁文件](config/assets.lock.json)：原生网格、材质、动画和 `.meta` 的 SHA-256。不要删除或重建 `.meta`。
- `npm run assets:prepare`：从清单中的最新源在临时目录生成候选，逐字节核对当前游戏副本。
- `npm run assets:import`：上述核对 + LayaAir 3.4.1 实际导入 + native 缓存一致性校验；不会覆盖场景人工修补和资源 UUID。
- `source_art` 中较早的人物版本是制作历史，不是默认导入来源。作者配方和旧 sync 入口的用途见[稳定基线说明](docs/baseline/BASELINE.md)。

## 验证与操作

- [M0.1 跨帧率修复验收](docs/m0.1/acceptance.md)、[数值前后对比](docs/m0.1/numeric-results.md)
- [修复说明与复测入口](docs/m0.1/implementation.md)、[3.4.1 物理子步语义](docs/m0.1/physics-semantics.md)
- [M0 稳定基线历史验收](docs/baseline/acceptance.md)
- [测试分类与依赖](docs/baseline/testing.md)、[构建入口](docs/baseline/build.md)、[实际运行测试](docs/baseline/runtime-testing.md)
- [当前功能与资源说明](README_凌水湖游戏.md)、[第三方素材许可](ASSET_CREDITS.md)

WASD 移动，Shift 奔跑，Space 跳跃，左键/F 长按或点射，V 切换视角，Esc 释放鼠标。触屏提供摇杆和操作按钮；桌面加 `?controls=touch` 可检查触屏布局。

每次验证写入新的 `.test-reports/` 子目录；历史 `docs` 报告仅用于追溯，不参与本轮 PASS 判断。缓存、发布产物、机器配置不提交 Git；模型源文件与运行二进制通过 Git LFS 管理。
