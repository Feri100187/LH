# 第一人称双臂和水枪视模

`WatergunArms.blend` 是可编辑源工程，`WatergunArms.glb` 是带蒙皮和动作的独立视模。原 `gameplay_20260920` 及更早工程保持不变。

## 内容

- 15 个网格、41,369 个三角形、16 个材质、55 根导出骨骼。
- 仅保留双手、指甲、袖口、双袖、水枪和轻量水流。头、眼镜、头发、胸腹躯干、帽子、腿及鞋全部从此副本移除。
- FPS 双袖使用连续四边形布面，每侧 42 圈、每圈 40 顶点，带轻微褶皱、平滑法线和连续顶点色。前端沿原独立袖口轴线伸入约 10 毫米，后端平顺延伸到画面下方；没有肩部、上臂或旧裁切接缝。仅替换 FPS 袖子，原世界角色衣服保持原样。
- Idle 为 3 秒前向持枪呼吸循环；Shoot 为 0.2 秒首帧出水循环。两手沿用原握持关系。
- 模型的根节点与骨名不变，静态节点 TRS 和 inverse bind 矩阵与游戏动作源 GLB 的最大差均为 0。

## 相机接入

视模应挂在第一人称相机下方，在第一人称隐藏完整世界角色，在第三人称隐藏视模。相机俯仰带动整个视模，从而不会出现头转动而身体留在画面中的现象。

对于游戏 72° 垂直 FOV，建议视模根节点相机局部位置 **(0, -1.60, -0.20)**、绕 Y 轴 **180°**。模型单位为米，glTF 前向为 +Z。该位置相当于将原眼高 1.62 米的标准摆位向前移 0.20 米、上移 0.02 米，使储水罐和支撑手可见；枪和袖臂保持在画面底部约 38% 高度内，画面中心无模型遮挡。

`(0, -1.62, 0)` 也可使用，但枪体更靠近相机，蓝色储水罐与右手会被画面下缘裁掉。步行/跑步可在相机局部叠加小幅摆动，不能再把完整身体的位移或跑步 root 轨迹施加到视模上。

LayaAir 导入游戏副本时，袖子材质需沿用现有顶点色适配（COLOR_0 转 VEC4、对应 gamma 编码与 ENABLEVERTEXCOLOR）。此源 GLB 保留标准材质数据，不含引擎专用颜色补偿。

## 实际检查

- `previews/first_person_idle.png`、`first_person_shoot.png`：598×470 真实透视渲染，与 IDE 预览视口比例一致。左下上臂黑色凸峰已消除，枪和手保持原尺寸与位置。
- `previews/first_person_look_down.png`：相机和视模共同俯视 58°；无躯干残留、无上臂切口入画。
- `previews/glb_roundtrip_idle.png`、`glb_roundtrip_shoot.png`：GLB 重新导入 Blender 后的渲染，已人工检查。
- `qa/first_person_asset.json`：Idle/Shoot 首尾循环差为 0，手相对枪的矩阵最大差小于 3×10⁻⁷；两个动作逐帧检查中，袖管末端进入相机视锥的顶点数均为 0。
- `qa/bind_compatibility.json`：骨骼绑定兼容性。
- `qa/glb_roundtrip.json`：7 个关键采样、每个 739 顶点，GLB 回导几何最大误差约 0.00000955 米。
- `qa/sleeve_continuity.json`：源工程和回导 GLB 各检查完整 Idle 91 帧、Shoot 7 帧，并检查 75 个 Idle/Shoot 混合姿势。袖子为两个闭合连续组件，0 边界边、0 非流形边；598×470 与 1280×720 下所有样本均无袖管末端入画。袖子接入袖口处的采样点距袖口表面最大约 3.76 毫米，属于重叠的接合区。
- `qa/scope_diff.json`：与本轮备份逐项二进制比较，仅 `FP.Sleeves weighted cut` 改变；其他 14 个 mesh、材质定义、骨顺序、inverse bind、Idle/Shoot 采样均相同。该 sleeve 仍为 mesh index 13。
- `previews/continuity_*.png`：两个画幅的多帧原工程及回导混合动作渲染，已放大检查；旧长瘦折面造成的三角凹槽和断节感已消除。

复现脚本：`tools/build-first-person-arms.py`。回导检查脚本：`qa/verify_roundtrip.py`。全周期与混合检查：`qa/validate_continuity.py`。

本轮修改前的脚本、Blender 工程、GLB 和 QA 已保存在 `backups/player_camera_arm_20260920/source_fps/`。
