# 脖子轻微加厚

本版基于 `directional_20260920/AnimeWatergunBoy_Directional.blend`，原件保持不变。

仅修改 **AWB.Neck** 网格的横向与前后截面：可见中段横宽约增加 16%，颈根约 18%，前后厚度约增加 10–11%。调整向颌下内部平滑减弱，最上端一圈保持不变。未改变高度或截面中心线，未调整头部、衣服、骨骼、权重和动作。

- Blender 网格：680 个顶点，642 个多边形，拓扑不变。
- GLB 对象名：`AWB.Neck`。
- GLB mesh index：**26**，mesh 名：`AWB.Neck.mesh.001`。
- 最大顶点移动：7.7256 毫米；最大前后移动：4.3933 毫米；竖直移动为 0。
- 仅 neck 的 `POSITION` 和 `NORMAL` 改变，索引、UV、蒙皮关节和权重保持。
- 其余 43 个网格的全部 accessor 数据逐字节一致。
- 默认节点/TRS、材质、骨骼关节顺序与 inverse bind 矩阵保持一致。
- 全部 20 个动作的输入时间与输出采样逐字节一致。

## 实际检查

`previews/` 包含正面、侧面、背面、四分之三视角的前后近景，以及 Idle、Walk、Run、Shoot、Jump、RunJump 和方向移动的姿势采样。

已查看四视角对比，以及行走、奔跑、射击、起跳/腾空时的领口和颌下连接。保持原有颈根在领口内部、上端在头部内部的重叠关系，未见本次加厚引入的露缝或穿领；没有修改领口。

## 文件

- `AnimeWatergunBoy_NeckRefined.blend`：可编辑模型，保留原有完整骨骼与 20 个动作。
- `AnimeWatergunBoy_NeckRefined.glb`：可仅提取 mesh 26 更新游戏。
- `qa/glb_neck_only_preservation.json`：逐网格、骨架、材质、动作保真检查。
- `qa/neck_shape_change.json`：各高度截面的尺寸变化。
- `qa/source_preservation_sha256.json`：源 .blend 和 .glb 的哈希。
- 重建脚本：`tools/refine-character-neck.py`。
