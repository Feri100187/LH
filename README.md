# LH · 凌水湖

LayaAir 3.4.1 三维漫游游戏，包含凌水湖场景、可控动漫水枪角色、八方向移动与射击动画，以及湖面鸭群。

## 打开工程

1. 安装 Git LFS，克隆本仓库并执行 `git lfs pull`，取得模型等二进制资源。
2. 用 LayaAir 3.4.1 打开 `LH.laya`，运行启动场景 `assets/Scene.ls`。
3. 若要通过浏览器启动，在 IDE 中构建 Web 到 `release/web`，再运行 `启动游戏.cmd`（需安装 Node.js）。

## 操作

WASD 移动，Shift 奔跑，Space 跳跃，左键/F 射击并支持长按，V 切换第一人称与右肩视角，Esc 释放鼠标。触屏提供摇杆和操作按钮。

## 内容

- `assets/`：游戏场景、预制体、模型、材质和碰撞数据；保留 `.meta` 以维持资源引用。
- `src/`、`settings/`、`packages/`：逻辑与工程配置。
- `source_art/`：可编辑 Blender 源工程、参考素材及制作脚本。
- `tools/`、`docs/`：导入、验证工具和检查记录。

缓存、发布输出、恢复备份和渲染中间帧不纳入 Git。详细项目说明见 [README_凌水湖游戏.md](README_凌水湖游戏.md)，第三方素材署名与许可见 [ASSET_CREDITS.md](ASSET_CREDITS.md)。
