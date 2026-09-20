# 湖面野鸭素材

这是真实下载的网上素材《Mallard duck》，作者 **Poly by Google**，不是生成模型。来源和 CC BY 3.0 署名详见 [ATTRIBUTION.md](ATTRIBUTION.md)。

## 文件

- `Duck.glb`：可直接导入游戏的单只绿头野鸭，底色贴图已嵌入。
- `Duck.blend`：可编辑工程，鸭子在独立集合中；预览水面、灯光和相机在另一集合。
- `Duck_BaseColor.png`：整理后的 1K 贴图。
- `original/`：未改动的原始 GLB、素材页快照及完整许可证。
- `previews/Duck_swimming_threequarter.png`：实际 Blender 浮水三分之四视角渲染。
- `qa/duck_asset_report.json`：尺寸、朝向、资源规模和来源记录。

## 导入参数

| 参数 | 数值 |
|---|---|
| 长度 | 0.500 m |
| 宽度 | 0.19264 m |
| 完整高度（含水下蹼足） | 0.36699 m |
| GLB 水线 | 本地 Y = 0 |
| GLB 垂直范围 | -0.12800 ～ +0.23899 m |
| GLB 前方 | 本地 +Z |
| 网格/材质 | 1 / 1 |
| 三角面 | 656 |
| 贴图 | 1024×1024 PNG，1张底色 |
| 动作 | 无，适合由游戏脚本驱动慢游、转向和轻微浮动 |

用单位缩放导入，将实例的 Y 直接设为湖面高度，围绕 Y 轴朝向移动方向。下腹和蹼足位于水面以下。模型采用保留原始自然鸭子比例的低面数外观，已实际查看侧面和三分之四视角，核对水线与材质。

重建脚本为 `tools/prepare-lake-duck.py`，运行于后台 Blender，不会更改用户正在编辑的 Blender 工程。

## 来源与许可

- 素材页：https://poly.pizza/m/frSLi6b6Vid
- 作者页：https://poly.pizza/u/Poly%20by%20Google
- 许可：https://creativecommons.org/licenses/by/3.0/
- 下载日期：2026-09-20

发布游戏时请把 `ATTRIBUTION.md` 和许可证随资源或项目署名一起保留。
