# LH 当前资源基线核对

核对时间：2026-09-20T11:31:24.216Z。只读解析当前文件与.meta UUID，实际比较GLB accessor及native二进制；未用历史报告替代当前数据，未操作UI或修改项目资产。

## 核心结论

- 启动场景是 assets/Scene.ls；LingshuiGame.ls内容逐字节相同，但UUID不同，是独立副本。场景挂载LingshuiGame.ts，Main.ts没有挂载。
- 世界804个网格节点；14个site_fixed网格加1个入口网格单独绑定。当前GLB已经包含相同的位置数据，以及按Laya每primitive反序后相同的索引，但native UUID、材质覆写与独立碰撞仍必须保留。
- 角色有效源是neck_short：44网格、20源动作→24游戏clips；外部移动层21状态、上身2状态，45条mask路径全部有效。
- FPS有效源为first_person_20260920的连续袖管版：15网格、Idle/Shoot两clip；袖管网格13当前3520顶点记录、6712三角形。
- 鸭群共5实例共享单鸭资源；源Duck.glb与游戏GLB逐字节一致，native底色图实际为1024×1024。
- 运行引用未解析UUID：0；项目.meta重复UUID：0。

## 入口与关键UUID

| 用途/路径 | UUID |
|---|---|
| assets/Scene.ls | e13ac28a-6bc3-4a66-b660-a19c07c4ef7e |
| assets/LingshuiGame.ls | 482d8130-7c2c-428c-a196-e35801bed1b4 |
| assets/lingshui/LingshuiEnvironment.lh | 761ed02f-fa79-41bc-b5f5-fda957facc9b |
| assets/lingshui/LingshuiLake.glb | 43275236-c4e9-4834-bbd2-1dde45172e6e |
| assets/resources/LingshuiCollision.json | 3870065b-ca93-4596-9e47-082fd7b2a160 |
| assets/lingshui/LakeWater.lmat | 32cda929-d7cc-4361-8cdc-067cd0b53450 |
| assets/lingshui/LakeWater.shader | c8dcaf2f-fb32-41ad-8270-bdc25c5e6f97 |
| assets/lingshui/LakeReflection.ltcb | e02dac6a-2cce-4d6a-8332-8cc6e9eec8de |
| assets/characters/PlayerAvatar.lh | e85fe60a-f535-4c66-b60d-9152dcd80153 |
| assets/characters/AnimeWatergunPlayer-unpacked/AnimeWatergunPlayer.lh | 22760ead-afd0-48cf-8155-7a1974793221 |
| assets/characters/PlayerAnimation.controller | 6210875d-04b6-4547-aff9-8d27801db747 |
| assets/characters/PlayerUpperBody.lavm | a642fce1-47a2-4d7a-a690-42f0281c87bc |
| assets/characters/WatergunArms-unpacked/WatergunArms.lh | 8ffde5eb-70bb-405c-9625-b001db920911 |
| assets/ducks/LakeDucks.lh | 3846e38d-77a3-4fd6-8e87-af451a6f9834 |
| assets/ducks/Duck-unpacked/Duck.lh | 2565d79f-2c4f-4888-ba14-c6cf63715c51 |

天空DefaultSkyProcedural.lmat与隐藏胶囊Capsule.lm的UUID已从本机LayaAir3.4.1内置.meta核实，属于引擎资源。碰撞JSON经TypeScript静态导入，不在普通res://引用链里，manifest必须显式列入。

## 世界和水面必须保留的派生资源

| 当前native网格 | UUID | GLB mesh | 位置/按Laya反序索引一致 |
|---|---|---:|---|
| assets/lingshui/site_fixed/SiteFixed_00.lm | 3cabf3cc-5726-4690-8de1-587ed8f37f51 | 0 | 是 |
| assets/lingshui/site_fixed/SiteFixed_02.lm | 67f87770-135a-458a-891e-79c7ae380f00 | 2 | 是 |
| assets/lingshui/site_fixed/SiteFixed_03.lm | c3c54473-bd59-45db-9511-ef788698936e | 3 | 是 |
| assets/lingshui/site_fixed/SiteFixed_05.lm | 0bf1a631-af4e-44cc-96e3-cac454302846 | 5 | 是 |
| assets/lingshui/site_fixed/SiteFixed_08.lm | 7eb543a9-8553-4872-9e43-3f19fae5d572 | 8 | 是 |
| assets/lingshui/site_fixed/SiteFixed_10.lm | 0baa4cef-9fe5-4729-9194-6dccd5d714f0 | 10 | 是 |
| assets/lingshui/site_fixed/SiteFixed_11.lm | cc8a65f1-a3aa-4316-9153-e31bc6fc8f04 | 11 | 是 |
| assets/lingshui/site_fixed/SiteFixed_12.lm | 6deb2e86-f35f-48c4-8c85-dfca6f3eac33 | 12 | 是 |
| assets/lingshui/site_fixed/SiteFixed_14.lm | 71af6786-444c-418a-8966-201d067239a6 | 14 | 是 |
| assets/lingshui/site_fixed/SiteFixed_19.lm | 1c761ad4-da22-4670-9c37-9be4b2dce103 | 19 | 是 |
| assets/lingshui/site_fixed/SiteFixed_23.lm | b0c3a8df-f9f5-41ab-8992-f487aa6deeeb | 23 | 是 |
| assets/lingshui/site_fixed/SiteFixed_25.lm | 58c76bec-34ac-4062-bad0-bfdd8c42c237 | 25 | 是 |
| assets/lingshui/site_fixed/SiteFixed_27.lm | 2655af91-2d43-4051-9265-1bcd3d30b65a | 27 | 是 |
| assets/lingshui/site_fixed/SiteFixed_29.lm | 73c8ee7e-2358-4c2b-9334-0059ea4d9dd5 | 29 | 是 |
| assets/lingshui/LingshuiEntrance_Fixed.lm | de10a742-3ae6-428a-b6e9-695f1ed44ecb | 37 | 是 |

有效编辑源为source_art/凌水湖_游戏修复.blend。LingshuiLake.glb有85网格、56材质、31图像。分区碰撞包含1361网格块、5包围盒、204树干，合计1570静态碰撞体。293处植被材质绑定使用启用顶点色的Foliage.lmat。

两个水面均使用LakeWater.lmat→LakeWater.shader→LakeReflection.ltcb。当前shader名称LingshuiLakeWater20260920，波纹由u_Time解析计算；倒影为原生LAYATEXTURECUBE:0000二进制，probe位置[-20,0.4,8]；cube实际为256×256、6面、9级mipmap。LakeRipple.png当前未被使用，遗留u_NormalMapTransform设置也不被此shader读取。

未在仓库tools/source_art找到世界完整重导、碰撞导出或cube烘焙的正式入口。现有补丁几何虽已在GLB中，完整运行效果仍依赖native UUID映射、索引顺序约定、材质覆写、cube和collision；应作为冻结基线一起保留。

## 角色和FPS的实际一致性

- 最新neck_short源与游戏角色只有衣服22、裤子27的COLOR_0不同：VEC3转VEC4并补偿Laya gamma。其余几何、默认TRS和IB一致；20源动作的保留通道逐字节一致，去除根位移，再增加4个腾空/落地裁切clip。
- 当前44个角色native网格与24个native clips均逐文件匹配当前导入缓存。Jump/RunJump两个原始整段clip保留但未直接绑定状态，状态用裁切版本。
- native prefab内嵌Movement层仍为旧7状态；真正生效的是两个UUID引用指向的外部21状态controller。PlayerAvatar.initialize明确赋值外部controller并检查所有方向动作，不能删掉该绑定。资源类型必须保持AnimationController。
- FPS源与游戏副本仅袖管13的COLOR_0适配不同；15native网格和2clip匹配当前缓存。当前构建脚本明确使用两条连续42×40环截面，并在袖口重叠10mm；源GLB只包含15个袖管/手/枪网格。实际按几何位置合并后，袖管连通分量=2、边界边=0、非流形边=0。
- FPS独立挂在PlayerCamera/FirstPersonArms/ArmsRig，局部位置[0,-1.6,-0.2]、Y旋转180°。其Idle/Shoot保留root平移轨道，与世界角色去根位移流程不同，不能混用导入规则。

## 鸭群与许可

两场景各引用LakeDucks.lh一次，组内5实例中心水位Y=0.04。路线/比例/相位来自当前prefab，完整数值见JSON。单鸭网格和材质共享，native纹理实际为1K。

ASSET_CREDITS.md、source_art/LakeDucks/ATTRIBUTION.md及original/LICENSE_CC_BY_3.0.txt实际存在。来源https://poly.pizza/m/frSLi6b6Vid，作者Poly by Google，CC BY3.0。正式发布步骤须复制署名与完整许可证，不能依赖现成但被Git忽略的release副本。

## 历史入口风险与当前正式入口

审计期间主任务已新增config/assets.manifest.json及lock，prepare-player-assets.py已改为approved_source并拒绝历史动画源，旧rigged无参回退在最终检查时已移除。以下列出仍可见的历史工具/文档风险，不表示新的正式入口采用这些旧路径。

### historical-readme-command：已修复

两份 README 已统一指向清单驱动的 npm 入口，历史制作报告只作追溯。当前导入器拒绝较早的 gameplay-only 来源。

### report-driven-clip-sync：已修复并归档

两个旧 sync 脚本现仅委托 node tools/assets.cjs sync --asset player 执行只读验证；旧 --indices/--backup/--report 写入参数以退出码2拒绝。旧脚本不再读取历史报告、生成资源UUID、建立备份或覆盖assets。正式验证器依据manifest/lock与当前GLB映射检查native缓存。

### embedded-controller-is-stale

External Movement has 21 effective clip states; prefab embedded Movement has 7.

Keep both external controller UUID bindings. PlayerAvatar explicitly overwrites Animator.controller at initialization.

### world-unpack-is-not-complete-scene-rebuild

14 site_fixed + entrance native UUIDs, water/foliage overrides and independent collision JSON are active.

Current GLB contains patch geometry, but re-unpacking must preserve current UUID/scene/material/collision bindings.

### world-rebake-tooling-not-in-repository

No repository-local world Blender export/collision generator/cube bake script found in tools or source_art.

Freeze current GLB, native overrides, custom materials/shader/cube, collision and repaired .blend. Do not promise one-command full rebaking.

### authoring-hardcodes-old-checkout：已修复并归档

6个Blender作者脚本现在从实际__file__严格定位项目根，并验证文件位于tools内且根目录存在LH.laya。缺失/无效__file__、虚拟文本入口和错误目录均明确失败；没有旧D盘目录回退。剔除新增定位块后，六个脚本的算法正文SHA256与修改前完全一致。

### launch-script-serves-stale-release：已明确边界

serve.cjs 已支持 --root/--port，输出实际根目录，拒绝缺失 index.html 与端口冲突。README 要求先重新构建，再用独立端口验收。启动游戏.cmd 仍只打开已有 release；它不保证旧产物与源码同步，跳过构建时仍可能打开旧版本。

### legacy-water-normal-map-description

Current water uses analytic u_Time waves and LakeReflection cube. LakeRipple is not referenced by current shader/material.

Do not restore the old normal-map recipe when rebuilding the baseline.

## 统一manifest建议字段

- schemaVersion and LayaAir version
- startupScene UUID/path and scene mirror equality policy
- canonical source Blend/GLB per asset group, SHA256, forbidden source fallbacks
- game derivative paths/UUIDs/importer flags and expected mesh/skin/clip counts
- COLOR_0 compatibility conversion, root-channel removal and four jump-cut ranges
- native mesh-index/object-name -> .lm path/UUID and clip-name/index -> .lani path/UUID mappings
- controller UUID/type, 21+2 state mappings and 45-path upper mask
- independent FPS source, 15 meshes, sleeve index13 and camera child transform
- world14 patch + entrance mapping, water/foliage material overrides and collision hash/counts
- current custom water shader/cube, probe parameters and cube hash
- duck source/license/attribution and five serialized instance routes
- per-machine executable configuration rather than hardcoded checkout paths
- build platform/output, credits/license copy steps and verification commands
- clean-cache import preconditions and native synchronization verification

本报告只核对资源依赖和文件一致性，未重新运行游戏、导出模型或修改玩法。关键文件hash、24clip UUID、状态映射、15个world override与native同步结果均在resource-audit.json。

## 旧入口退役与目录可移植性验证

- 两个旧sync入口从工程外目录实际运行均PASS：44个角色native网格、24个clips匹配，runtimeWrites=0。
- 旧写入参数两入口均拒绝，退出码2，并给出新的只读验证命令。
- 六个作者脚本全部语法检查通过；只单独执行根目录定位块，验证与工作目录无关，并验证4种缺失/错误入口会拒绝。没有运行Blender作者配方。
- 588个manifest lock保护文件在验证前后的聚合SHA256完全相同：c4e5d57dfac06804b3b255498d709bbd1f225704c7699dbc8c7227e7bd2d8090。
- git diff --check通过。验证详情和报告路径保存在JSON的toolMaintenance.validation中。
