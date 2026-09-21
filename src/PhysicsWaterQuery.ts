import { Vec3Tuple, WaterShotHit } from "./WaterShotResolver";

// Static world colliders accept group 2. Using a new projectile group would
// silently filter them out in Bullet's two-sided group/mask test.
export const WATER_QUERY_GROUP = 2;
export const WATER_QUERY_MASK = 1 | 4; // World + training faces, excludes player group 2.

export class PhysicsWaterQuery {
    private ray = new Laya.Ray(new Laya.Vector3(), new Laya.Vector3());
    private hits: Laya.HitResult[] = [];
    readonly trace: { origin: Vec3Tuple; direction: Vec3Tuple; maxDistance: number; hit: WaterShotHit | null }[] = [];

    constructor(private world: Laya.Scene3D, private player: Laya.Node,
        private targetId: (collider: Laya.PhysicsCollider) => string | null) {
        if (typeof world.physicsSimulation.rayCastAll !== "function") throw new Error("当前物理后端缺少 rayCastAll。");
    }

    beginShot() { this.trace.length = 0; }

    cast = (origin: Vec3Tuple, direction: Vec3Tuple, maxDistance: number): WaterShotHit | null => {
        this.ray.origin.setValue(...origin); this.ray.direction.setValue(...direction);
        // The small query extension only includes exact endpoints in Bullet.
        // Hits beyond the requested segment are rejected, not granted extra range.
        this.world.physicsSimulation.rayCastAll(this.ray, this.hits, maxDistance + .002, WATER_QUERY_GROUP, WATER_QUERY_MASK);
        let nearest: WaterShotHit = null;
        for (const native of this.hits) {
            if (!native.succeeded) continue;
            const collider = native.collider as any;
            let owner = collider?.owner as Laya.Node;
            let self = false;
            for (let node = owner; node; node = node.parent) if (node === this.player) { self = true; break; }
            if (self) continue;
            // 3.4.1 returns the backend btCollider, whose owner is the Sprite3D.
            const component = owner?.getComponent(Laya.PhysicsCollider);
            const id = component ? this.targetId(component) : null;
            const p = native.point;
            const distance = (p.x - origin[0]) * direction[0] + (p.y - origin[1]) * direction[1] + (p.z - origin[2]) * direction[2];
            if (!Number.isFinite(distance) || distance < -1e-5 || distance > maxDistance + 1e-5) continue;
            const bounded = Math.max(0, Math.min(maxDistance, distance));
            const hit: WaterShotHit = { distance: bounded,
                point: [origin[0] + direction[0] * bounded, origin[1] + direction[1] * bounded, origin[2] + direction[2] * bounded],
                normal: [native.normal.x, native.normal.y, native.normal.z],
                kind: id ? "target" : "world", colliderId: collider?._id, ...(id ? { targetId: id } : {}) };
            if (!nearest || hit.distance < nearest.distance - 1e-5 ||
                Math.abs(hit.distance - nearest.distance) <= 1e-5 && hit.kind === "world") nearest = hit;
        }
        this.trace.push({ origin: [...origin] as Vec3Tuple, direction: [...direction] as Vec3Tuple, maxDistance, hit: nearest });
        return nearest;
    };
}
