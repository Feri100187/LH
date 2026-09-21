# M1：3.4.1 射线、枪口和训练区依据

核对日期：2026-09-21。本文件记录安装版源码、最终资产数据和独立 Bullet WASM 数值实验；这些证据不代替浏览器中完整游戏的验收。未修改任何既有模型、场景或 UUID。

## 1. 查询必须匹配双向分组

安装目录为 `D:/a/LayaAirIDE/resources/engine/libs/`。

- `laya.bullet.wasm.js:2574`：`rayCast(ray, out, distance, collisionGroup, collisionMask)`；方向会归一化，distance 是世界距离。
- `:2617`：`rayCastAll` 同样传入查询 group/mask；先清空 out，然后从 Bullet 结果复制 point、normal、hitFraction。**未排序**，命中对象由结果池复用；挑最小 fraction，并在下一次查询前复制要保留的数值。
- `:2669`：`shapeCast` 同样支持查询 group/mask，但当前包装器 `:2711/:2714` 对 point.x / normal.x 取反，而 rayCast 不取反。因此不要直接把 shapeCast 的 point 当水花世界坐标；可用 fraction 沿已知起终点重建位置，或用射线结果。
- 对照同版本可读 `laya.bullet.js:98525` 的 `RayResultCallback::needsCollision`、`:99070` 的 `ConvexResultCallback::needsCollision`，条件是 `(queryMask & colliderGroup) != 0 && (colliderMask & queryGroup) != 0`，不是单向的 layer 筛选。
- `LingshuiGame.ts` 的静态 mesh、box、树干均为 **group=1 / mask=2**；玩家 CharacterController 为 **group=2 / mask=1**。

查询场景和同组训练靶应使用 **query group=2 / mask=1**。此组合会命中墙体并自然排除玩家胶囊。若训练靶另用 group=4，则 query mask 需要 `1 | 4`，且靶的 mask 仍必须包含 query group=2。不能仅查靶组，否则会穿墙。

`HitResult.collider` 实际是 `btCollider` 后端对象，而不是用户添加的 PhysicsCollider 组件：`:2596/:2650` 从 `_physicObjectsMap` 取得对象，`:111` 的 `setOwner(node)` 保存 `owner`。可使用 `hit.collider.owner` 取 Sprite3D；根据独立靶节点映射判断目标，不依赖展示文字或模糊名称。自体额外过滤应沿 owner.parent 检查玩家/双臂祖先。

## 2. 内部起点不会可靠地产生命中

本次在 Node 中直接 `WebAssembly.compile/instantiate` 安装版 `bullet.wasm`，按引擎相同构造顺序创建 collision configuration、dispatcher、DBVT broadphase、solver、dynamics world；以 `btCollisionWorld_rayTest` 查询。未模拟命中函数，也未操作 GUI。

测试对象为中心 `(0,0,0)`、半尺寸 `(1,1,1)` 的原生 btBoxShape，碰撞组 1 / 2：

| 射线 | 查询 group/mask | 真实 WASM 结果 |
|---|---:|---|
| `(-2,0,0) → (2,0,0)` | 2 / 1 | hit，fraction=0.25，point=(-1,0,0) |
| `(0,0,0) → (2,0,0)` | 2 / 1 | 无命中 |
| `(0,0,0) → (0.5,0,0)` | 2 / 1 | 无命中 |
| `(2,0,0) → (0,0,0)` | 2 / 1 | hit，fraction=0.5，point=(1,0,0) |
| `(-2,0,0) → (2,0,0)` | 1 / 1 | 无命中，墙被错误分组过滤 |

随后替换为 x=0 平面的一个 btBvhTriangleMeshShape 三角形：从前后两面穿过均命中 fraction=0.5；**起点恰在面上并向外则无命中**。单三角形实验不证明任意闭合 mesh 的所有内部语义，但已经证明“枪口向外射线没有 hit”不能推断枪口未嵌入墙。

实施建议：先取当前帧准星方向确定瞄准点，再做当前帧世界枪口到瞄准点的路径查询；还应从玩家身体内侧的可靠锚点到枪口检查被枪身跨过的墙。后者用于阻止近墙时枪口已伸入/越过墙的穿墙结算。射程以世界路径距离限制，每次发射最多结算一个最近可达靶；流水终点必须使用实际阻挡位置。

## 3. 中心准星的相机射线

`laya.d3.js:8991` 确有 `normalizedViewportPointToRay`，但当前实现把 `point.x * pixelRatio * normalizedViewport.width` 送入实际像素 viewport；默认 normalizedViewport.width=1，直接传 `(0.5,0.5)` 不会成为常规像素视口中心。不能凭方法名认为它已正确实现归一化坐标。

使用 `viewportPointToRay`（`:8983`）配实际舞台/Canvas 中心坐标，或相机当前世界 forward 作为中心方向。应在浏览器中以视口中心投射/可见靶心作一次一致性验证。已有游戏相机 forward 是 `(sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))`，但若取缓存 yaw/pitch 必须保证与当前帧相机和物理位置同步。

## 4. 最终资产枪口位置

TPS 和 FPS 原生 prefab 都具有以下骨骼：

```text
AWB_Animated/AWB_Rig/root/pelvis/spine/chest/weapon/water_jet
```

两份最终 `.lh` 中 `water_jet` 相对 weapon 的 localPosition 都是：

```text
(0.053000256419181824, 0.43499991297721863, -2.51730210010237e-8)
```

**可直接取 water_jet.transform.position 作为世界枪口**。也可用 weapon.worldMatrix 变换上述局部点。不要用 water_jet.worldMatrix 再变换较长的局部偏移：待机 clip 将其 scale 缩到 0.0001，射击也会动态改变它。射向沿 weapon 的局部 +Y（现有 getUp 使用相同约定）。

特别纠正早期建模坐标的误读：`scripts/30_watergun.py` 的唇口 X=.446 是缩放前数据；`scripts/51_finish_shape.py:22` 后来以 pivot=(.030,-.337,1.265)、scale=.84、Z offset=-.045 统一缩放道具和手。最终唇口 Blender X 为 `.030 + (.446-.030)*.84 = .37944`，而水流起点 X=.380，二者只差 **0.00056m**，不是 .066m。

本次还直接读取最终 TPS/FPS GLB 的橙色枪口 mesh POSITION accessor，并乘 weapon 对应 inverseBindMatrix，结果两者一致：

| weapon 局部轴 | 最小值 | 最大值 |
|---|---:|---:|
| X | .004720 | .099018 |
| Y（枪口前向） | .352120 | **.434440** |
| Z | -.049497 | .049497 |

水流骨骼原点 Y=.435 位于真实最前缘外 0.56mm，适合作为几何枪口。`40_export_and_measure.py` 仅清理重复点/退化面并重绑 water_jet，不改变该原点；最新脖子缩短资产也保留相同武器几何。

FPS 挂载层级为 `PlayerCamera/FirstPersonArms/ArmsRig`；场景中 ArmsRig 的 position=(0,-1.6,-.2)、Euler=(0,180,0)，FirstPersonArms.update 另加跑动摆动。因此不能把 TPS 的世界枪口或固定 camera offset 当作 FPS 可见枪口。世界矩阵会包含这些挂载变换。

枪口采样应放在当前帧 physics、Animator、PlayerAvatar.onAfterSceneUpdate 的上身瞄准和相机跟随后；否则会出现发射点来自上一姿态、准星来自新姿态的问题。只在原实际 emitShot 时记录唯一 ID/单调时间，再由约定的本帧末尾结算一次，不重新建立射速计时器。

## 5. 禁用原演示水流

两份资产均有独立 skinned renderer 节点 `FX_WaterPulse`；水流 clip 通过 water_jet scale 控制，只是约 .8m 的展示动画，不能表示真实命中。

- `PlayerAvatar.applyVisibility()` 会重新写常规 renderer.enabled；只初始化时 disable 一次是不够的。
- 可以从常规 visibility 列表排除该 renderer 并设 enabled=false；或者统一 helper 把 FX 节点 active=false，并在视角改变/更新后维持 renderer.enabled=false。
- 不要删骨骼或替换资源；保留 water_jet 位置作为枪口锚点，禁用的是 FX_WaterPulse 展示节点。动画缩放不会重新激活一个 active=false 的独立网格节点。
- FPS 构造器也收集这些 renderer；需要对两套模型都处理。

## 6. 出生点附近草坪布局建议

对 `assets/resources/LingshuiCollision.json` 的现有三角形做 XZ 重心插值。每个推荐中心还采样 `dx,dz ∈ {-0.6,0,0.6}` 九点；以下覆盖均只有“连续坡地_照片湖形约束”，高度 **Y=.8**。候选区域无 box 碰撞。

| 靶 | X/Z 中心 | 距出生点水平距离 | 最近树干外缘 |
|---|---|---:|---:|
| 近距离 | (-23,41) | 4.84m | 10.39m |
| 中距离 | (-12,42) | 14.80m | 5.61m |
| 遮挡 | (-33,40) | 7.54m | 4.45m |

地面 .8，靶心可用约2.1–2.3，独立组管理。候选位于红褐湖岸路与南侧灰路之间的草坪，出生朝向主要看湖，需有训练区提示引导转身；不要改变已有出生朝向来配合测试。

已排除的看似空地：(-26,49)、(-22,44)、(-18,49) 实际属于“南岸灰色校园道路”Y=.9，不应占用。出生(-26,37.2)自身在红褐慢行道Y=.9。遮挡板应同样放草坪，不能横跨该路；具体板尺寸和从不同方向绕行仍需真实引擎/画面验收。此几何采样不声明路线通行已通过。

最终建议靶心均 Y=2.3，各自面向出生点。遮挡板中心 `(-31.8,2.0,39.5)`，轴向尺寸 `(1.6,2.4,.35)`，底面 Y=.8：在 X 的两端、中心及中间点和 Z 的两端/中心做 **15 个 footprint 采样**，全部只有草坪 Y=.8。出生点至遮挡靶的 XZ 线段在 Z=39.5 处 X=-31.75，落入板的 X 范围 [-32.6,-31.0]；板高覆盖靶心，能构成真实遮挡。

绕行候选点（每点±.6m九点采样也全部是草坪 Y=.8）：

- 左绕：先到 `(-33.5,39.0)`，可直接对 `(-33,40)` 射击；该短线位于板左边。再向 `(-33.5,40.7)` 可抵近靶后侧。
- 右绕：先到 `(-30,40.2)`，对靶的短线 Z≥40，比板后边 Z=39.675 更靠后，避免穿过板。

这些点距板边留出了大于现有玩家胶囊半径 .32m 的间隔；但仍应在游戏中用移动而非瞬移通过，验证碰撞接触和靶支架尺寸没有带来新增阻碍。

## 文件指纹

| 文件 | SHA256 |
|---|---|
| installed `laya.bullet.wasm.js` | `d5e2bfb5190888f75ce4f80de0acfb71cddcd4fbe969e3de97274830f1b71d1c` |
| installed `bullet.wasm` | `7283880f8f0568d6b703260d360ad33f425af4bf4c8b3beb35a5bdd4b5dfa648` |
| installed `laya.d3.js` | `ca8bfea4b5701283364938751cb91d9ba7a048a207dd20027d13c5be867d0dcf` |
| `assets/characters/AnimeWatergunPlayer.glb` | `b02caf88c1d207049a797757eafd7da229cdcb479109bf0db5a57258aab0cafd` |
| `assets/characters/WatergunArms.glb` | `06598a3317256ad8f2d56041611b45fc69c454f40dcffa5929275c87523ef715` |
| `assets/resources/LingshuiCollision.json` | `92d9e9cc64355264f35435546ff265428540df8b67f25fe6f615457a6dbf1ec0` |
