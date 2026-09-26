import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerCameraFollow } from "./PlayerCameraFollow";
import { Point3, ShotGate, TrainingTarget, SurfaceHit, resolveWatergunShot } from "./WatergunHit";
const { regClass } = Laya;

const WORLD_GROUP = 1;
const PLAYER_QUERY_GROUP = 2; // Existing world colliders accept this group.
const TARGET_GROUP = 4;       // Existing player movement mask stays unchanged.
const RANGE = 20;
const TARGETS = [
    { id: "near", label: "近靶", position: [-26.14, 2.2, 31.89] },
    { id: "middle", label: "中靶", position: [-23.17, 2.2, 28.66] },
    { id: "occluded", label: "遮挡靶", position: [-19.03, 2.2, 24.76] }
];
const vector = (p: Point3) => new Laya.Vector3(p.x, p.y, p.z);
const point = (p: Laya.Vector3): Point3 => ({ x: p.x, y: p.y, z: p.z });

/** Opt-in training Scene component. Does not own movement, firing cadence or input. */
@regClass()
export class WatergunTraining extends Laya.Script {
    private world: Laya.Scene3D;
    private camera: Laya.Camera;
    private player: Laya.Sprite3D;
    private avatar: PlayerAvatar;
    private worldMuzzle: Laya.Sprite3D;
    private viewMuzzle: Laya.Sprite3D;
    private viewMount: Laya.Sprite3D;
    private follower: PlayerCameraFollow;
    private previousFollow: () => void;
    private followHook: () => void;
    private installed = false;
    private failed = false;
    private gate = new ShotGate();
    private root: Laya.Sprite3D;
    private targets = new Map<string, { state: TrainingTarget; material: Laya.BlinnPhongMaterial; label: string }>();
    private targetNodes = new Map<Laya.Node, string>();
    private ownedMaterials: Laya.Material[] = [];
    private ownedMeshes: Laya.Mesh[] = [];
    private pulseRenderers: { renderer: Laya.MeshRenderer; enabled: boolean; reference: Laya.MeshRenderer }[] = [];
    private lines: Laya.PixelLineSprite3D;
    private beam: { from: Point3; to: Point3; until: number } | null = null;
    private splash: Laya.MeshSprite3D;
    private splashUntil = 0;
    private panel: HTMLDivElement;
    private progress: HTMLDivElement;
    private message: HTMLDivElement;
    private marker: HTMLDivElement;
    private resetButton: HTMLButtonElement;
    private latest = "尚未射击";
    private processedShots = 0;
    private lastResult: { id: number; kind: string; targetId?: string; point: Point3 } | null = null;

    onStart() { this.tryInstall(); }
    onUpdate() { if (!this.installed && !this.failed) this.tryInstall(); }

    private find(node: Laya.Node, name: string): Laya.Sprite3D | null {
        if (!node) return null;
        if (node.name === name) return node as Laya.Sprite3D;
        for (let i = 0; i < node.numChildren; i++) {
            const found = this.find(node.getChildAt(i), name);
            if (found) return found;
        }
        return null;
    }

    private referenceRenderer(node: Laya.Node): Laya.MeshRenderer | null {
        if (!node || node.name === "FX_WaterPulse") return null;
        const renderer = node.getComponent(Laya.MeshRenderer);
        if (renderer) return renderer;
        for (let i = 0; i < node.numChildren; i++) {
            const found = this.referenceRenderer(node.getChildAt(i));
            if (found) return found;
        }
        return null;
    }

    private tryInstall() {
        if (this.installed || this.failed) return;
        this.world = (this.owner as Laya.Scene).scene3D;
        if (!this.world) return;
        this.camera = this.world.getChildByName("PlayerCamera") as Laya.Camera;
        this.player = this.world.getChildByName("PlayerCapsule") as Laya.Sprite3D;
        this.avatar = this.player?.getChildByName("PlayerAvatar")?.getComponent(PlayerAvatar);
        this.follower = this.camera?.getComponent(PlayerCameraFollow);
        if (!this.avatar || !this.follower?.follow || !this.avatar.getStatus().loaded) return;
        try {
            if (!this.world.physicsSimulation?.rayCast) throw new Error("M1 requires the configured 3.4.1 physics rayCast API.");
            if (this.world.getChildByName("M1TrainingRuntime")) throw new Error("Only one M1 training component may be installed.");
            this.worldMuzzle = this.find(this.avatar.owner, "water_jet");
            this.viewMount = this.camera.getChildByName("FirstPersonArms") as Laya.Sprite3D;
            this.viewMuzzle = this.find(this.viewMount, "water_jet");
            if (!this.worldMuzzle || !this.viewMuzzle) throw new Error("Missing authored water_jet muzzle bone; refusing to guess an origin.");
            this.gate = new ShotGate(this.avatar.getStatus().shots);
            this.root = new Laya.Sprite3D("M1TrainingRuntime");
            this.world.addChild(this.root);
            this.makeRange();
            this.makeHud();
            for (const parent of [this.avatar.owner, this.viewMount]) {
                const pulse = this.find(parent, "FX_WaterPulse");
                const renderer = pulse?.getComponent(Laya.MeshRenderer);
                if (renderer) this.pulseRenderers.push({ renderer, enabled: renderer.enabled, reference: this.referenceRenderer(parent) });
            }
            // Keep the original physical/animation camera ordering; restore it on teardown.
            this.previousFollow = this.follower.follow;
            this.followHook = () => { this.previousFollow?.(); this.afterCamera(); };
            this.follower.follow = this.followHook;
            this.installed = true;
            this.publish();
        } catch (error) {
            this.dispose(); this.failed = true;
            console.error("[M1] Training initialization failed; original roaming controller is unchanged.", error);
            throw error;
        }
    }

    private material(color: Laya.Color) {
        const material = new Laya.BlinnPhongMaterial();
        material.albedoColor = color; material.shininess = 0.12;
        this.ownedMaterials.push(material);
        return material;
    }
    private mesh(mesh: Laya.Mesh, name: string, position: Laya.Vector3, material: Laya.Material) {
        this.ownedMeshes.push(mesh);
        const node = new Laya.MeshSprite3D(mesh, name);
        node.transform.position = position;
        node.meshRenderer.sharedMaterial = material;
        node.meshRenderer.castShadow = false;
        this.root.addChild(node);
        return node;
    }
    private makeRange() {
        for (const item of TARGETS) {
            const material = this.material(new Laya.Color(1, .45, .08, 1));
            const node = this.mesh(Laya.PrimitiveMesh.createSphere(.48, 12, 16), `M1_${item.id}`,
                new Laya.Vector3(item.position[0], item.position[1], item.position[2]), material);
            const collider = node.addComponent(Laya.PhysicsCollider);
            collider.collisionGroup = TARGET_GROUP; collider.canCollideWith = PLAYER_QUERY_GROUP;
            collider.colliderShape = new Laya.SphereColliderShape(.48);
            this.targetNodes.set(node, item.id);
            this.targets.set(item.id, { state: new TrainingTarget(item.id), material, label: item.label });
        }
        const shield = this.mesh(Laya.PrimitiveMesh.createBox(1.35, 1.5, .16), "M1_遮挡板",
            new Laya.Vector3(-19.64, 2.2, 25.8), this.material(new Laya.Color(.22, .3, .38, 1)));
        const collider = shield.addComponent(Laya.PhysicsCollider);
        collider.collisionGroup = WORLD_GROUP; collider.canCollideWith = PLAYER_QUERY_GROUP;
        collider.colliderShape = new Laya.BoxColliderShape(1.35, 1.5, .16);
        this.lines = new Laya.PixelLineSprite3D(1);
        this.root.addChild(this.lines);
        this.splash = this.mesh(Laya.PrimitiveMesh.createSphere(.07, 8, 8), "M1_WaterImpact", new Laya.Vector3(),
            this.material(new Laya.Color(.12, .8, 1, 1)));
        this.splash.active = false;
    }

    private cast = (origin: Point3, direction: Point3, distance: number, worldOnly: boolean): SurfaceHit | null => {
        const hit = new Laya.HitResult();
        const ray = new Laya.Ray(vector(origin), vector(direction));
        const success = this.world.physicsSimulation.rayCast(ray, hit, distance, PLAYER_QUERY_GROUP,
            worldOnly ? WORLD_GROUP : WORLD_GROUP | TARGET_GROUP);
        if (!success) return null;
        const owner = hit.collider?.owner as Laya.Node;
        return { point: point(hit.point), normal: point(hit.normal), targetId: worldOnly ? undefined : this.targetNodes.get(owner) };
    };

    private afterCamera() {
        if (!this.installed) return;
        const now = performance.now();
        // The old short mesh pulse has no obstruction test. Suppress it only in this
        // opt-in scene; use the resolved impact/trace instead. Original files stay intact.
        for (const item of this.pulseRenderers) {
            // Track normal sibling visibility so teardown after a view switch restores
            // the current presentation, not the presentation at installation time.
            if (item.reference && !item.reference.destroyed) item.enabled = item.reference.enabled;
            item.renderer.enabled = false;
        }
        this.lines.clear();
        if (this.beam && now < this.beam.until && !document.hidden) {
            const color = new Laya.Color(.15, .8, 1, 1);
            this.lines.addLine(vector(this.beam.from), vector(this.beam.to), color, color);
        }
        this.splash.active = now < this.splashUntil && !document.hidden;
        this.marker.style.opacity = now < this.splashUntil ? "1" : "0";
        if (!this.avatar.isShooting) return;
        // M0.1 already emits at most once per real update. Use its monotonic id and
        // actual emission time; never infer shots from held input or replay its ring.
        const status = this.avatar.getStatus();
        const event = status.shotEvents[status.shotEvents.length - 1];
        if (!this.gate.accept(event, now) || document.hidden || !document.hasFocus()) return;
        const ray = new Laya.Ray(new Laya.Vector3(), new Laya.Vector3());
        this.camera.normalizedViewportPointToRay(new Laya.Vector2(.5, .5), ray);
        const body = this.player.transform.position;
        const muzzle = point(this.worldMuzzle.transform.position);
        const resolution = resolveWatergunShot({ origin: point(ray.origin), direction: point(ray.direction) },
            muzzle, { x: body.x, y: body.y + .45, z: body.z }, RANGE, this.cast);
        this.processedShots++;
        this.lastResult = { id: event.id, kind: resolution.kind, targetId: resolution.targetId, point: resolution.point };
        const target = resolution.targetId ? this.targets.get(resolution.targetId) : null;
        const accepted = resolution.kind === "hit" && !!target?.state.hit(event.id);
        if (accepted) target.material.albedoColor = target.state.complete
            ? new Laya.Color(.12, .85, .4, 1) : new Laya.Color(1, .75, .15, 1);
        this.latest = accepted ? `${target.label}：${target.state.hits}/${target.state.requiredHits}`
            : resolution.kind === "hit" ? "此靶已完成"
            : resolution.kind === "blocked" ? "水流被遮挡" : resolution.kind === "invalid" ? "射击数据无效" : "未命中";
        if (resolution.kind !== "invalid") {
            const visualOrigin = point((this.viewMount.active ? this.viewMuzzle : this.worldMuzzle).transform.position);
            const dx = resolution.point.x - visualOrigin.x, dy = resolution.point.y - visualOrigin.y, dz = resolution.point.z - visualOrigin.z;
            const length = Math.hypot(dx, dy, dz);
            // Viewmodel only chooses the cosmetic start. It cannot change a hit.
            const visualBlock = length > .001 ? this.cast(visualOrigin, { x: dx / length, y: dy / length, z: dz / length }, length, true) : null;
            this.beam = { from: visualOrigin, to: visualBlock ? visualBlock.point : resolution.point, until: now + 90 };
            this.lines.clear();
            const color = new Laya.Color(.15, .8, 1, 1);
            this.lines.addLine(vector(this.beam.from), vector(this.beam.to), color, color);
            if (resolution.kind !== "miss") {
                this.splash.transform.position = vector(resolution.point);
                this.splashUntil = now + 160;
                this.splash.active = true;
                this.marker.style.color = accepted ? "#61ffac" : "#ffca70";
                this.marker.style.opacity = "1";
            }
        }
        this.publish();
    }

    private makeHud() {
        this.panel = document.createElement("div");
        this.panel.id = "m1-training-hud";
        this.panel.style.cssText = "position:fixed;left:16px;top:56px;max-width:calc(100vw - 32px);padding:12px;background:#13232ee8;color:white;font:13px/1.6 sans-serif;z-index:15;pointer-events:none;box-sizing:border-box";
        const title = document.createElement("strong"); title.textContent = "M1 水枪训练 · 每靶 3 次";
        this.progress = document.createElement("div"); this.message = document.createElement("div");
        const help = document.createElement("div"); help.textContent = "第三靶有遮挡板，请移动寻找角度。Esc 后可重置。";
        this.resetButton = document.createElement("button"); this.resetButton.textContent = "重置训练靶";
        this.resetButton.style.cssText = "pointer-events:auto;min-height:36px;margin-top:6px;cursor:pointer";
        this.resetButton.addEventListener("pointerdown", this.stopPointer);
        this.resetButton.addEventListener("click", this.reset);
        for (const node of [title, this.progress, this.message, help, this.resetButton]) this.panel.appendChild(node);
        this.marker = document.createElement("div"); this.marker.textContent = "×";
        this.marker.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);font:36px monospace;opacity:0;pointer-events:none;z-index:16";
        document.body.appendChild(this.panel); document.body.appendChild(this.marker);
    }
    private stopPointer = (event: PointerEvent) => { event.stopPropagation(); };
    private reset = (event?: Event) => {
        event?.stopPropagation();
        // Do not reset the emission gate or the avatar clock.
        for (const item of this.targets.values()) {
            item.state.reset(); item.material.albedoColor = new Laya.Color(1, .45, .08, 1);
        }
        this.beam = null; this.splashUntil = 0; this.lines.clear(); this.splash.active = false;
        this.marker.style.opacity = "0"; this.latest = "训练靶已重置"; this.lastResult = null;
        this.publish();
    };
    private publish() {
        const targets = Array.from(this.targets.values()).map(item => ({ id: item.state.id, label: item.label,
            hits: item.state.hits, requiredHits: item.state.requiredHits, complete: item.state.complete }));
        const completed = targets.filter(item => item.complete).length;
        this.progress.textContent = targets.map(item => `${item.label} ${item.hits}/${item.requiredHits}`).join("　");
        this.message.textContent = completed === targets.length ? "三个训练靶已完成，可以重置重试。" : this.latest;
        this.panel.dataset.m1Status = JSON.stringify({ range: RANGE, processedShots: this.processedShots,
            consumedShotId: this.gate.consumedId, targets, completed, lastResult: this.lastResult });
    }
    private dispose() {
        if (this.follower && this.followHook && this.follower.follow === this.followHook) this.follower.follow = this.previousFollow;
        this.followHook = null; this.previousFollow = null;
        for (const item of this.pulseRenderers) if (!item.renderer.destroyed) item.renderer.enabled = item.enabled;
        this.pulseRenderers.length = 0;
        this.resetButton?.removeEventListener("pointerdown", this.stopPointer);
        this.resetButton?.removeEventListener("click", this.reset);
        this.panel?.remove(); this.marker?.remove();
        this.root?.destroy(true); this.root = null;
        for (const material of this.ownedMaterials) material.destroy();
        for (const mesh of this.ownedMeshes) mesh.destroy();
        this.ownedMaterials.length = this.ownedMeshes.length = 0;
        this.targets.clear(); this.targetNodes.clear(); this.beam = null;
        this.installed = false;
    }
    onDisable() { this.dispose(); }
    onDestroy() { this.dispose(); }
}
