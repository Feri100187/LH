凌水湖已作为可运行的 3D 游戏场景接入此 LayaAir 3.4.1 项目。

打开 `LH.laya`，运行 `assets/Scene.ls`；它已设为启动场景。也可以双击 `启动游戏.cmd` 查看 `release/web` 中已构建的版本。修改源码或场景后，需要在 LayaAir 中重新构建 Web 版本。

操作：

- 点击游戏画面锁定鼠标，移动鼠标转向。
- W/A/S/D 移动，Space 跳跃，Shift 奔跑。
- 鼠标锁定后，左键或 F 点射，按住连续射击；触屏射击按钮也支持长按，走动、奔跑和跳跃时均可使用。
- 默认第一人称；V 在第一人称与右肩第三人称之间切换。
- 右肩镜头后拉距离为 1.95 米，横向偏移为 0.65 米，越肩高度偏移为 0.32 米。
- 身体始终跟随视线朝向；S 为后退，A/D 为横移，组合键对应斜向步态。
- 屏幕中央显示四线加中心点的十字准星。
- Esc 释放鼠标；切换窗口时清空按键状态。
- 第三人称相机会避开墙体和栏杆。进入深水或越出场地会回到最后的安全落脚点。
- 触屏：左侧摇杆移动，右侧空白区拖动转向；右下角提供跑步、跳跃、射击按钮和视角切换。

主要文件：

- `assets/Scene.ls`：当前启动场景、人物、相机和晴天灯光。`LingshuiGame.ls` 保留同一完成版副本。
- `assets/lingshui/LingshuiEnvironment.lh`：可继续编辑的场景预制体，按地形、水体、桥梁、建筑、栈道、植被等分类。
- `assets/lingshui/LingshuiLake.glb`：从 Blender 导入的共享网格和材质资源。
- `assets/lingshui/Foliage.lmat`：启用顶点色的植被材质。
- `assets/lingshui/LakeWater.lmat`、`LakeWater.shader`、`LakeReflection.ltcb`：动态波纹、视角相关反射和静态环境倒影。
- `assets/resources/LingshuiCollision.json`：不带装饰倒角的分区碰撞数据、建筑包络和树干碰撞。
- `src/LingshuiGame.ts`：人物、输入、相机、准星和碰撞初始化。
- `assets/characters/PlayerAvatar.lh`：已绑定的动漫水枪玩家预制体。
- `assets/characters/PlayerAnimation.controller`：可在 IDE 编辑的移动与上身射击双层动画状态机。
- `assets/characters/PlayerUpperBody.lavm`：上身骨骼遮罩，使射击与腿部动作同时播放。
- `src/PlayerAvatar.ts`：根据物理运动驱动动画、平滑转向及第一/第三人称显示。
- `source_art/凌水湖_场景.blend`：保留的 Blender 源场景。
- `docs/游戏检查记录.json`、`docs/previews/`：检查结果和实际运行截图。

玩家显示为已蒙皮的动漫水枪男生，隐藏的胶囊负责物理碰撞。胶囊高 1.8 米、半径 0.32 米；步行目标速度 1.65 米/秒，奔跑 4 米/秒；可跨越 0.35 米台阶。动画频率按实际移动速度调整。主要控制参数可在游戏场景根节点的脚本属性中调整。

场景使用共享网格；树叶、枝条适当减面。程序化表面颜色已转换为游戏纹理；植被顶点色转换为 RGBA，以兼容当前引擎导入器。碰撞使用分区简化网格，楼体的部分封闭外墙使用包络体，适合目前的室外漫游。游戏灯光和水面效果采用实时实现，与 Blender 的 Cycles 离线渲染存在差异。

已验证默认视角、移动、奔跑、斜向速度、跳跃落地、鼠标转向、双向视角切换、相机避障、西北台阶登顶、栈道接入凉亭、红桥通行、Esc 释放、失焦停止输入和准星居中。地标通行检查先把人物放到测试起点，再使用真实键盘事件移动。

导入前备份位于 `backups/before_lingshui_20260915_190736/`。原空白 `Scene.ls` 另存于 `backups/before_scene_restore_20260916_175735/`，原 Blender 文件保留。

2026-09-20 已修复临湖楼入口：门廊回墙、顶板、固定玻璃、门槛和入口碰撞已同步更新。详见 docs/entrance_fix/修复说明.md。

## 动漫玩家与动画状态机（2026-09-20）

移动层由实际运动与接地状态切换 `Idle / Walk / Run / Jump / RunJump / Land / RunLand`；上身层使用 `UpperIdle / Shoot`。原地跳跃和跑跳分别连接对应的落地动作，射击层带淡入淡出。模型根位移已在游戏副本中移除，避免动画与物理移动叠加。

导入副本为 `assets/characters/AnimeWatergunPlayer.glb`，解包后的 `.lm / .lmat / .lani` 位于 `AnimeWatergunPlayer-unpacked/`。衣服顶点色转换为 RGBA 并适配当前 Laya 着色器的颜色解码。原 `.blend` 与标准 `.glb` 保留在 `source_art/AnimeWatergunBoy/rigged_20260919/`。本次修改前备份位于 `backups/player_avatar_20260920/`。

检查记录见 `docs/player_avatar/验收记录.md`。射击包含动作及模型内水流表现，目前没有命中、伤害或敌人系统。手机按钮布局已在 390×844 浏览器视口验证，未做手机真机性能或多指硬件测试。桌面浏览器也可在地址后加 `?controls=touch` 试用触屏界面。

### 动作与操作改进

待机、行走采用枪口向前的双手持枪姿势；奔跑采用侧持姿势。步态增加髋胸反向转动、重心移动和枪体微摆，步幅与实际速度匹配。射击改为首帧出水的 0.2 秒循环，按住约每秒发射 5 次，松开后完成当前短脉冲即停止；快速再次点按会排队下一次发射。

鼠标锁定期间的按下、抬起事件由游戏输入层处理，避开 LayaAir 引擎不合法的 `setPointerCapture` / `releasePointerCapture` 调用。待机/跑动切换的速度取样使用短滑窗，避免物理固定步与渲染频率不一致造成零位移帧、动作抖动。

新动作源工程：`source_art/AnimeWatergunBoy/gameplay_20260920/AnimeWatergunBoy_Gameplay.blend`；旧源文件继续保留。导入流程：先运行 `python tools/prepare-player-assets.py --animations source_art/AnimeWatergunBoy/gameplay_20260920/AnimeWatergunBoy_Gameplay.glb`，等待 IDE 资源导入完成，再运行 `python tools/sync-player-animation-clips.py`，最后重新构建。详见 `docs/player_feel/修复与验收.md`。

### 第一人称和方向移动

当前版本使用独立的双前臂水枪视模，第一人称不绘制完整世界角色。相机在本帧物理与动画更新后跟随，视模直接继承相机的位移和俯仰；低头、跑动时不会看到胸腹或落在后面的身体。

行走和跑步各有八方向动作。移动只选择腿部步态，不再把整个人转向位移方向；切换方向保留步相。后退和横移依据各自步程适当降低速度。方向源文件位于 `source_art/AnimeWatergunBoy/directional_20260920/`；最新完整角色源为 `source_art/AnimeWatergunBoy/neck_short_20260920/AnimeWatergunBoy_NeckShort.blend/.glb`，包含加厚并缩短 2.4 厘米的颈部及全部 20 个动作。重新导入时，将该 GLB 作为 `tools/prepare-player-assets.py` 的 `--model-source` 参数。第一人称源文件位于 `source_art/AnimeWatergunBoy/first_person_20260920/`。

`src/PlayerCameraFollow.ts` 负责物理更新后的镜头跟随，`src/FirstPersonArms.ts` 控制第一人称武器动作与小幅摆动。验收见 `docs/player_view_direction/修复与验收.md`。

最新镜头与颈部比例调整见 `docs/player_camera_neck/修复记录.md`。

后续颈长缩短及导入记录见 `docs/player_neck_short/修复记录.md`。

### 湖面鸭群

出生点前方湖面新增 5 只绿头鸭：3 只近岸、2 只稍远，使用各自的小范围路线慢游，并有轻微浮动和水痕。预制体为 `assets/ducks/LakeDucks.lh`，单鸭网格与材质由 5 个实例共享；`src/LakeDuck.ts` 控制路线与浮动。实际水面高度为 Y=0.04，鸭模型原点已对齐腹部水线。

素材为 Poly by Google 的 “Mallard duck”，来自 https://poly.pizza/m/frSLi6b6Vid ，采用 CC BY 3.0。原始下载、许可证与可编辑 Blender 文件保存在 `source_art/LakeDucks/`；完整署名见 `ASSET_CREDITS.md`。进入游戏的提示界面也显示署名。分发 Web 或 single-html 时，应随附 `ASSET_CREDITS.md` 和 `LICENSE_DUCK_CC_BY_3.0.txt`；本次已复制至两个发布目录。

验收记录：`docs/lake_ducks/验收记录.md`。


2026-09-20 场景全检修复已写入项目：道路与前场连接、实体楼梯与扶手接入口、亭旁草洲、草坡净空和湖面材质。修复后的可编辑源文件为 `source_art/凌水湖_游戏修复.blend`，原始文件保留。详细修复与验证记录见 `docs/site_repair/修复说明.md`。
