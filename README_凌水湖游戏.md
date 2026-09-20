# 当前功能与资源

本文件描述稳定基线的功能边界。**本轮实际验收结论见 [docs/baseline/acceptance.md](docs/baseline/acceptance.md)**；下列历史修复报告不代表本轮重新验证。

## 当前有效资源

| 项目 | 当前入口 |
|---|---|
| 引擎 / 启动场景 | LayaAir 3.4.1 / `assets/Scene.ls`；`LingshuiGame.ls` 为同内容副本 |
| 世界 | `assets/lingshui/LingshuiEnvironment.lh`，保留 native 修补和材质覆盖 |
| 世界源 | `source_art/凌水湖_游戏修复.blend` / `assets/lingshui/LingshuiLake.glb` |
| 世界玩家源 | `source_art/AnimeWatergunBoy/neck_short_20260920/AnimeWatergunBoy_NeckShort.blend/.glb` |
| 游戏玩家 | `PlayerAvatar.lh` → `AnimeWatergunPlayer-unpacked/AnimeWatergunPlayer.lh` |
| 动画 | `PlayerAnimation.controller` + `PlayerUpperBody.lavm`，21 个移动状态 + 2 个上身状态 |
| 第一人称 | `WatergunArms-unpacked/WatergunArms.lh`；源 `first_person_20260920/WatergunArms.blend/.glb` |
| 水面 | `LakeWater.lmat`、`LakeWater.shader`、`LakeReflection.ltcb` |
| 鸭群 | `assets/ducks/LakeDucks.lh`，共享 1 个模型/1K 贴图的 5 个实例 |

精确路径、UUID、动画名称和文件哈希以 [assets.manifest.json](config/assets.manifest.json) 与 [assets.lock.json](config/assets.lock.json) 为准。`rigged_20260919`、`gameplay_20260920`、`directional_20260920`、`neck_refine_20260920` 是归档制作阶段，不能替代当前完整人物源。

## 功能与参数

- 默认第一人称使用独立双臂视模，镜头在物理与动画更新后跟随；V 切换右肩视角。
- 右肩镜头：后拉 1.95 米、横向 0.65 米、抬高 0.32 米。颈部保留加厚与缩短 2.4 厘米的当前比例。
- 胶囊碰撞高 1.8 米、半径 0.32 米、台阶高 0.35 米；步行目标 1.65 米/秒、奔跑目标 4 米/秒、跳跃初速度 6.5 米/秒。后退/侧移按方向步程限速，动画跟随实际位移。
- 行走/奔跑各八方向，身体始终朝视线方向；待机和行走枪口向前，奔跑侧持。跳跃、跑跳及对应落地动作保留。
- 上身射击与腿部移动可同时播放，点按/长按触发 0.2 秒短循环。只包含动作和水流，当前没有命中、伤害、弹药、敌人或网络同步。
- 水面动态波纹、视角相关反射与静态环境倒影；鸭群小范围巡游、浮动与水痕，水位 Y=0.04。
- 触屏摇杆、跑步、跳跃、射击及切换视角按钮；失焦清空输入，第三人称相机避障、深水/越界返回安全点。

## 编辑与复现

从 [README](README.md) 执行标准命令。`assets:prepare` 的输出在 `.baseline-cache` 中；`assets:import` 用固定版本 IDE 生成缓存再核对已提交的 native 资源。世界包含人工 native 修补、植被和水面材质覆盖，整场景重新解包不能重建这些引用，不应覆盖原生 prefab。

作者配方可用于后续明确授权的资产编辑，本轮未运行 Blender 重建或改变任何角色/场景。旧 sync Python 命令只兼容为校验入口。若资源哈希不符，先检查工作区变更与 LFS 恢复，不要自动接受新哈希或生成新 UUID。

## 历史记录（仅追溯）

[场景](docs/游戏检查记录.json)、[人物绑定](docs/player_avatar/验收记录.md)、[动作与输入](docs/player_feel/修复与验收.md)、[双视角与方向](docs/player_view_direction/修复与验收.md)、[镜头与颈部](docs/player_camera_neck/修复记录.md)、[颈长](docs/player_neck_short/修复记录.md)、[鸭群](docs/lake_ducks/验收记录.md)、[场景修补](docs/site_repair/修复说明.md)、[楼入口](docs/entrance_fix/修复说明.md)。这些文档中的旧导入命令已被当前统一入口替代。

素材署名和完整鸭子 CC BY 3.0 许可由构建入口随 Web/single-html 产物复制，详见 [ASSET_CREDITS.md](ASSET_CREDITS.md)。
