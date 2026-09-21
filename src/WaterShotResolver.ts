/** Engine-independent shot geometry. The adapter must return the closest solid
 * world/target hit, include world collision group 1, and exclude the shooter.
 * Ties between a world surface and a target must resolve to the world surface. */
export type Vec3Tuple = [number, number, number];
export interface WaterShotHit {
    distance: number;
    point: Vec3Tuple;
    normal: Vec3Tuple;
    kind: "world" | "target";
    targetId?: string;
    colliderId?: number;
}
export type Hit = WaterShotHit;
export type WaterShotQuery = (origin: Vec3Tuple, direction: Vec3Tuple, maxDistance: number) => WaterShotHit | null;
export type Query = WaterShotQuery;
export interface WaterShotInput {
    cameraOrigin: Vec3Tuple;
    cameraDirection: Vec3Tuple;
    muzzleOrigin: Vec3Tuple;
    /** A point on the player's safe side of the weapon, used to detect a barrel
     * extending through a wall. It must not be the camera behind the player. */
    muzzleAnchor: Vec3Tuple;
    range: number;
}
export interface WaterShotResult {
    outcome: "target" | "world" | "miss" | "out-of-range" | "muzzle-blocked";
    origin: Vec3Tuple;
    end: Vec3Tuple;
    aimPoint: Vec3Tuple;
    hit: WaterShotHit | null;
    targetId?: string;
    distance: number;
}
const EPS = 1e-7;
const copy = (v: Vec3Tuple): Vec3Tuple => [v[0], v[1], v[2]];
const sub = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (v: Vec3Tuple) => Math.hypot(v[0], v[1], v[2]);
const along = (o: Vec3Tuple, d: Vec3Tuple, t: number): Vec3Tuple => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
function vector(v: Vec3Tuple, label: string): void {
    if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) throw new Error(`Invalid ${label}`);
}
function unit(v: Vec3Tuple): Vec3Tuple {
    const n = length(v);
    if (!(n > EPS)) throw new Error("Shot direction must be nonzero");
    return [v[0] / n, v[1] / n, v[2] / n];
}
function cast(query: WaterShotQuery, origin: Vec3Tuple, direction: Vec3Tuple, distance: number): WaterShotHit | null {
    const hit = query(copy(origin), copy(direction), distance);
    if (!hit) return null;
    vector(hit.point, "hit point"); vector(hit.normal, "hit normal");
    if (!Number.isFinite(hit.distance) || hit.distance < 0 || hit.distance > distance + EPS
        || (hit.kind !== "target" && hit.kind !== "world")
        || (hit.kind === "target" && !hit.targetId)) throw new Error("Invalid shot query hit");
    // Fail closed on inconsistent adapter output instead of drawing an unrelated
    // endpoint or awarding a target outside the segment that was actually cast.
    if (length(sub(hit.point, along(origin, direction, hit.distance))) > 1e-3) throw new Error("Shot hit point is off the queried segment");
    return { ...hit, point: copy(hit.point), normal: copy(hit.normal) };
}

/** Resolve exactly one actual emission; this module has no timer or listeners. */
export function resolveWaterShot(input: WaterShotInput, query: WaterShotQuery): WaterShotResult {
    vector(input.cameraOrigin, "camera origin"); vector(input.cameraDirection, "camera direction");
    vector(input.muzzleOrigin, "muzzle origin"); vector(input.muzzleAnchor, "muzzle anchor");
    if (!(input.range > 0) || !Number.isFinite(input.range)) throw new Error("Shot range must be finite and positive");
    const cameraDirection = unit(input.cameraDirection);
    // This includes every camera-axis point that could lie within muzzle range,
    // including a third-person camera offset behind the player.
    const aimDistance = input.range + length(sub(input.cameraOrigin, input.muzzleOrigin));
    const cameraHit = cast(query, input.cameraOrigin, cameraDirection, aimDistance);
    const aimPoint = cameraHit ? copy(cameraHit.point) : along(input.cameraOrigin, cameraDirection, aimDistance);
    const anchorDelta = sub(input.muzzleOrigin, input.muzzleAnchor), anchorDistance = length(anchorDelta);
    if (anchorDistance > EPS) {
        const blocked = cast(query, input.muzzleAnchor, unit(anchorDelta), anchorDistance);
        if (blocked) return { outcome: "muzzle-blocked", origin: copy(input.muzzleAnchor), end: copy(blocked.point),
            aimPoint, hit: blocked, distance: blocked.distance };
    }
    const muzzleDelta = sub(aimPoint, input.muzzleOrigin), targetDistance = length(muzzleDelta);
    // If the camera is aimed at/behind the gun, a reverse shot would hit the
    // player or reward a target behind the intended forward firing direction.
    const forward = muzzleDelta[0] * cameraDirection[0] + muzzleDelta[1] * cameraDirection[1] + muzzleDelta[2] * cameraDirection[2];
    if (targetDistance <= EPS || forward <= 0) return { outcome: "muzzle-blocked", origin: copy(input.muzzleOrigin),
        end: copy(input.muzzleOrigin), aimPoint, hit: null, distance: 0 };
    // The camera hit determines aim direction, not the end of the water path.
    // Different origins/angles can put the convex muzzle intersection slightly
    // after that surface point. Query the full weapon range and let its nearest
    // world/target hit stop the stream; never extend range or query tolerance.
    const direction = unit(muzzleDelta), queryDistance = input.range;
    const hit = cast(query, input.muzzleOrigin, direction, queryDistance);
    if (hit) return { outcome: hit.kind, origin: copy(input.muzzleOrigin), end: copy(hit.point), aimPoint,
        hit, targetId: hit.kind === "target" ? hit.targetId : undefined, distance: hit.distance };
    return { outcome: cameraHit && targetDistance > input.range + EPS ? "out-of-range" : "miss",
        origin: copy(input.muzzleOrigin), end: along(input.muzzleOrigin, direction, queryDistance),
        aimPoint, hit: null, distance: queryDistance };
}
