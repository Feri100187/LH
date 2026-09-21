/** M1 rules only: no renderer, input handling or second firing clock. */
export interface Point3 { x: number; y: number; z: number; }
export interface ShotRecord { readonly id: number; readonly atMs: number; }
export interface AimRay { origin: Point3; direction: Point3; }
export interface SurfaceHit { point: Point3; normal: Point3; targetId?: string; }
export type CastRay = (origin: Point3, direction: Point3, distance: number, worldOnly: boolean) => SurfaceHit | null;
export interface ShotResolution extends SurfaceHit { kind: "hit" | "blocked" | "miss" | "invalid"; }

const EPSILON = 1e-6;
const copy = (p: Point3): Point3 => ({ x: p.x, y: p.y, z: p.z });
const finite = (p: Point3): boolean => !!p && [p.x, p.y, p.z].every(Number.isFinite);
const subtract = (a: Point3, b: Point3): Point3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (p: Point3): number => Math.hypot(p.x, p.y, p.z);
const scale = (p: Point3, n: number): Point3 => ({ x: p.x * n, y: p.y * n, z: p.z * n });
const endpoint = (p: Point3, d: Point3, n: number): Point3 => ({ x: p.x + d.x * n, y: p.y + d.y * n, z: p.z + d.z * n });
const ZERO: Point3 = { x: 0, y: 0, z: 0 };

/** Consume an authoritative emission at most once. Never replay stale/pause-time shots. */
export class ShotGate {
    private lastId: number;
    constructor(initialId = 0) { this.lastId = initialId; }
    accept(shot: ShotRecord | null | undefined, nowMs: number): boolean {
        if (!shot || !Number.isSafeInteger(shot.id) || shot.id <= this.lastId) return false;
        // Consumed even when stale: a later clock change must not resurrect this event.
        this.lastId = shot.id;
        return Number.isFinite(nowMs) && Number.isFinite(shot.atMs) && shot.atMs >= 0
            && nowMs >= shot.atMs && nowMs - shot.atMs <= 250;
    }
    get consumedId(): number { return this.lastId; }
}

/** Reset progress without making already-consumed emissions valid again. */
export class TrainingTarget {
    private lastShotId = 0;
    private count = 0;
    constructor(readonly id: string, readonly requiredHits = 3) {
        if (!id || !Number.isSafeInteger(requiredHits) || requiredHits < 1)
            throw new Error("A training target needs an id and a positive integer hit count.");
    }
    hit(shotId: number): boolean {
        if (!Number.isSafeInteger(shotId) || shotId <= this.lastShotId) return false;
        this.lastShotId = shotId;
        if (this.complete) return false;
        this.count++;
        return true;
    }
    reset(): void { this.count = 0; }
    get hits(): number { return this.count; }
    get complete(): boolean { return this.count >= this.requiredHits; }
}

/**
 * Aim with the camera; resolve obstruction and range from the WORLD muzzle.
 * The chest-to-muzzle guard also catches a gun protruding through a thin wall.
 * cast() must return the closest eligible surface and must ignore the player.
 */
export function resolveWatergunShot(aim: AimRay, muzzle: Point3, guard: Point3, range: number, cast: CastRay): ShotResolution {
    const invalid = (): ShotResolution => ({ kind: "invalid", point: finite(muzzle) ? copy(muzzle) : copy(ZERO), normal: copy(ZERO) });
    if (!aim || !finite(aim.origin) || !finite(aim.direction) || !finite(muzzle) || !finite(guard)
        || !Number.isFinite(range) || range <= EPSILON) return invalid();
    const directionLength = length(aim.direction);
    if (directionLength <= EPSILON) return invalid();
    const aimDirection = scale(aim.direction, 1 / directionLength);
    const outcome = (hit: SurfaceHit): ShotResolution => {
        if (!finite(hit.point) || !finite(hit.normal)) return invalid();
        return { kind: hit.targetId ? "hit" : "blocked", point: copy(hit.point), normal: copy(hit.normal), targetId: hit.targetId };
    };

    const guardDelta = subtract(muzzle, guard), guardDistance = length(guardDelta);
    if (guardDistance > EPSILON) {
        const blocked = cast(copy(guard), scale(guardDelta, 1 / guardDistance), guardDistance, true);
        if (blocked) {
            const result = outcome(blocked);
            // A guard query can NEVER damage a target, even if an adapter mislabels it.
            return result.kind === "invalid" ? result : { kind: "blocked", point: result.point, normal: result.normal };
        }
    }

    // Camera setback must not shorten the range available from the muzzle.
    const cameraRange = range + length(subtract(aim.origin, muzzle));
    const aimedSurface = cast(copy(aim.origin), aimDirection, cameraRange, false);
    if (aimedSurface && (!finite(aimedSurface.point) || !finite(aimedSurface.normal))) return invalid();
    const aimPoint = aimedSurface ? aimedSurface.point : endpoint(aim.origin, aimDirection, cameraRange);
    const delta = subtract(aimPoint, muzzle), distance = length(delta);
    if (distance <= EPSILON || delta.x * aimDirection.x + delta.y * aimDirection.y + delta.z * aimDirection.z <= EPSILON)
        return { kind: "blocked", point: copy(muzzle), normal: copy(ZERO) };
    const direction = scale(delta, 1 / distance);
    // A 1 mm endpoint tolerance avoids losing a camera-selected surface to rounding.
    // Never extend past the configured muzzle range.
    const travel = Math.min(range, distance + 0.001);
    const actual = cast(copy(muzzle), direction, travel, false);
    return actual ? outcome(actual) : { kind: "miss", point: endpoint(muzzle, direction, travel), normal: copy(ZERO) };
}
