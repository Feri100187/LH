# 八方向持枪移动动作

保留 `gameplay_20260920` 原始文件与六个动作，本目录追加 14 个移动动作，共 20 个动作。`Walk` / `Run` 就是前进方向，其余方向使用后缀。

人物身体始终总体朝向前方；方向由脚端 IK 的支撑与抬步轨迹实现，未旋转根骨或整个角色来模拟侧移/后退。横移采用较短步程和侧向碎步，双脚不交叉；行走保持前向持枪，奔跑保留侧持。

## 方向约定

| 动作后缀 | Blender 位移方向 | GLB 本地方向 |
|---|---|---|
| 无后缀 / Forward | -Y | +Z |
| Back | +Y | -Z |
| Left | +X | +X |
| Right | -X | -X |
| ForwardLeft | (+X, -Y) | (+X, +Z) |
| ForwardRight | (-X, -Y) | (-X, +Z) |
| BackLeft | (+X, +Y) | (+X, -Z) |
| BackRight | (-X, +Y) | (-X, -Z) |

`Left` / `Right` 是人物自身的解剖左右。原始 `R` 腿位于 Blender 负 X；本项目摄像机相对右移动对应人物本地负 X。斜向向量需单位化。

## 匹配速度

| 方向 | Walk 参考速度 (m/s) | Run 参考速度 (m/s) |
|---|---:|---:|
| Forward | 1.636363636 | 3.947368421 |
| Back | 1.208333333 | 2.181818182 |
| Left / Right | 0.806451613 | 1.785714286 |
| ForwardLeft / ForwardRight | 1.250000000 | 2.232558140 |
| BackLeft / BackRight | 0.937500000 | 1.719367589 |

动作倍率 = 实际水平速度 / 对应参考速度。横移和后退的允许移动速度宜相应降低，避免将侧向碎步快放至直线冲刺速度。

## 验证记录

- `qa/directional_motion_quality.json`：全部新增动作逐帧汇总，包括脚底、手腕/踝 IK、环路、脚踝横向间距与真实支撑阶段速度拟合。
- `qa/*_all_frames.json`：每一帧的详细数据。
- `qa/bind_compatibility.json`：静态骨骼 TRS 和 inverse bind 矩阵与上版完全相同。
- `previews/`：14 个新增方向各两张实际 Blender 渲染；已逐方向检查主要姿势。

重建脚本为 `tools/author-directional-motion.py`，输入使用上一版 gameplay .blend，不会覆盖上一版源文件。
