type WaterPoint = [number, number, number];
export interface WaterShotVisual {
    origin: WaterPoint;
    end: WaterPoint;
    hit?: { normal: WaterPoint } | null;
}

interface WaterBurst {
    root: Laya.Sprite3D;
    beam: Laya.MeshSprite3D;
    drops: Laya.MeshSprite3D[];
    material: Laya.BlinnPhongMaterial;
    startedAtMs: number;
    end: WaterPoint;
    normal: WaterPoint;
    tangent: WaterPoint;
    bitangent: WaterPoint;
    hasHit: boolean;
    length: number;
}

/** Small fixed pool of purely visual bursts. One show call represents one already-resolved shot. */
export class WaterShotEffects {
    readonly root = new Laya.Sprite3D("M1_WaterShotEffects");
    private readonly beamMesh = Laya.PrimitiveMesh.createCylinder(1, 1, 8);
    private readonly dropMesh = Laya.PrimitiveMesh.createSphere(1, 5, 8);
    private readonly pool: WaterBurst[] = [];
    private next = 0;
    private destroyed = false;

    constructor(world: Laya.Scene3D) {
        world.addChild(this.root);
        for (let i = 0; i < 4; i++) {
            const root = new Laya.Sprite3D(`WaterBurst${i}`);
            this.root.addChild(root);
            const material = new Laya.BlinnPhongMaterial();
            material.renderMode = Laya.BlinnPhongMaterial.RENDERMODE_TRANSPARENT;
            material.albedoColor = new Laya.Color(.22, .78, 1, .72);
            material.shininess = .7;
            const beam = new Laya.MeshSprite3D(this.beamMesh, "ResolvedWaterSegment");
            root.addChild(beam);
            beam.meshRenderer.sharedMaterial = material;
            const drops: Laya.MeshSprite3D[] = [];
            for (let j = 0; j < 8; j++) {
                const drop = new Laya.MeshSprite3D(this.dropMesh, `ImpactDrop${j}`);
                root.addChild(drop);
                drop.meshRenderer.sharedMaterial = material;
                drops.push(drop);
            }
            root.active = false;
            this.pool.push({ root, beam, drops, material, startedAtMs: -Infinity,
                end: [0, 0, 0], normal: [0, 1, 0], tangent: [1, 0, 0], bitangent: [0, 0, 1],
                hasHit: false, length: 0 });
        }
    }

    show(result: WaterShotVisual, nowMs: number): void {
        if (this.destroyed || !Number.isFinite(nowMs) || !result.origin.every(Number.isFinite)
            || !result.end.every(Number.isFinite)) return;
        const burst = this.pool[this.next++ % this.pool.length];
        const delta = result.end.map((v, i) => v - result.origin[i]) as WaterPoint;
        const fullLength = Math.hypot(...delta);
        burst.length = fullLength;
        const direction = fullLength > 1e-6 ? delta.map(v => v / fullLength) as WaterPoint : [0, 1, 0] as WaterPoint;
        burst.end = [...result.end] as WaterPoint;
        burst.startedAtMs = nowMs;
        burst.hasHit = !!result.hit;
        burst.root.active = true;
        burst.beam.transform.localPosition = new Laya.Vector3(...result.origin.map((v, i) =>
            v + direction[i] * burst.length * .5) as WaterPoint);
        burst.beam.transform.localRotation = this.yAxisRotation(direction);
        burst.beam.transform.localScale = new Laya.Vector3(.018, burst.length, .018);
        let normal = result.hit?.normal || [0, 1, 0] as WaterPoint;
        const size = Math.hypot(...normal);
        normal = Number.isFinite(size) && size > 1e-6 ? normal.map(v => v / size) as WaterPoint : [0, 1, 0];
        burst.normal = normal;
        const axis: WaterPoint = Math.abs(normal[1]) > .9 ? [1, 0, 0] : [0, 1, 0];
        const tangent = this.cross(normal, axis), tLength = Math.hypot(...tangent);
        burst.tangent = tangent.map(v => v / tLength) as WaterPoint;
        burst.bitangent = this.cross(normal, burst.tangent);
        this.updateBurst(burst, nowMs);
    }

    update(nowMs: number): void {
        if (this.destroyed || !Number.isFinite(nowMs)) return;
        for (const burst of this.pool) if (burst.root.active) this.updateBurst(burst, nowMs);
    }

    clear(): void {
        for (const burst of this.pool) {
            burst.root.active = false;
            burst.startedAtMs = -Infinity;
        }
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.root.destroy(true);
        this.pool.forEach(burst => burst.material.destroy());
        this.beamMesh.destroy();
        this.dropMesh.destroy();
        this.pool.length = 0;
    }

    private updateBurst(burst: WaterBurst, nowMs: number) {
        const age = nowMs - burst.startedAtMs;
        if (age < 0 || age >= (burst.hasHit ? 300 : 95)) { burst.root.active = false; return; }
        burst.beam.active = age < 95 && burst.length > 1e-6;
        const phase = age / 300;
        burst.material.albedoColor = new Laya.Color(.22, .78, 1, .72 * (1 - phase));
        burst.drops.forEach((drop, index) => {
            drop.active = burst.hasHit;
            if (!burst.hasHit) return;
            const angle = index * Math.PI / 4;
            const spread = .025 + phase * (.17 + (index % 3) * .025);
            // All drops stay on the visible side of the collision plane. No water behind walls.
            const outward = .04 + Math.sin(phase * Math.PI) * .1;
            const point = burst.end.map((v, i) => v + burst.normal[i] * outward
                + (burst.tangent[i] * Math.cos(angle) + burst.bitangent[i] * Math.sin(angle)) * spread) as WaterPoint;
            drop.transform.localPosition = new Laya.Vector3(...point);
            const radius = .026 * (1 - phase * .65);
            drop.transform.localScale = new Laya.Vector3(radius, radius, radius);
        });
    }

    private cross(a: WaterPoint, b: WaterPoint): WaterPoint {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }

    private yAxisRotation(direction: WaterPoint) {
        if (direction[1] < -.999999) return new Laya.Quaternion(1, 0, 0, 0);
        const x = direction[2], z = -direction[0], w = 1 + direction[1];
        const length = Math.hypot(x, z, w);
        return new Laya.Quaternion(x / length, 0, z / length, w / length);
    }
}
