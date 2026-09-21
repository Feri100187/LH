import { PlayerAvatar, PlayerShotEvent } from "./PlayerAvatar";
import { PhysicsWaterQuery, WATER_QUERY_GROUP, WATER_QUERY_MASK } from "./PhysicsWaterQuery";
import { TrainingProgress } from "./TrainingProgress";
import { TrainingRangeView, TrainingTargetSpec } from "./TrainingRangeView";
import { TrainingHud } from "./TrainingHud";
import { WeaponMuzzle } from "./WeaponMuzzle";
import { WaterShotEffects } from "./WaterShotEffects";
import { resolveWaterShot, Vec3Tuple, WaterShotResult } from "./WaterShotResolver";

export const WATER_GUN_RANGE = 18;
const spawn = [-26, 37.2];
export const TRAINING_TARGETS: TrainingTargetSpec[] = [
    { id: "near", label: "① 近靶", position: [-23, 2.3, 41] },
    { id: "medium", label: "② 中靶", position: [-12, 2.3, 42] },
    { id: "covered", label: "③ 掩体靶", position: [-33, 2.3, 40] }
].map(target => ({ ...target, position: target.position as Vec3Tuple,
    yawDegrees: Math.atan2(spawn[0] - target.position[0], spawn[1] - target.position[2]) * 180 / Math.PI }));
export const TRAINING_COVER = { center: [-31.8, 2, 39.5] as Vec3Tuple, size: [1.6, 2.4, .35] as Vec3Tuple };

interface QueuedShot extends PlayerShotEvent { frame: number; }
interface ResolvedShot extends QueuedShot {
    resolvedAtMs: number; resolvedFrame: number; firstPerson: boolean;
    cameraOrigin: Vec3Tuple; cameraDirection: Vec3Tuple; muzzleOrigin: Vec3Tuple; muzzleAnchor: Vec3Tuple;
    result: WaterShotResult; accepted: boolean; newlyCompleted: boolean; resetCount: number;
    queries: PhysicsWaterQuery["trace"];
}

/** Owns the emission → physics query → training response chain. No firing clock. */
export class WaterGunSystem {
    private readonly view: TrainingRangeView;
    private readonly progress = new TrainingProgress(TRAINING_TARGETS.map(target => target.id));
    private readonly query: PhysicsWaterQuery;
    private readonly muzzle: WeaponMuzzle;
    private readonly effects: WaterShotEffects;
    private readonly hud: TrainingHud;
    private readonly direction = new Laya.Vector3();
    private pending: QueuedShot[] = [];
    private lastEnqueuedId = 0;
    private receivedEvents = 0;
    private duplicateEvents = 0;
    private cancelledEvents = 0;
    private records: ResolvedShot[] = [];
    private destroyed = false;

    constructor(world: Laya.Scene3D, private player: Laya.Sprite3D, private camera: Laya.Camera,
        private avatar: PlayerAvatar, arms: Laya.Sprite3D, private frame: () => number, private releaseForReset: () => void) {
        this.view = new TrainingRangeView(world, TRAINING_TARGETS, TRAINING_COVER);
        this.query = new PhysicsWaterQuery(world, player, collider => this.view.targetIdForCollider(collider));
        this.muzzle = new WeaponMuzzle(avatar.owner, arms);
        this.effects = new WaterShotEffects(world);
        this.hud = new TrainingHud(TRAINING_TARGETS, () => this.reset());
        this.hud.setProgress(TRAINING_TARGETS, []);
        avatar.setShotListener(this.onShot);
    }

    private onShot = (event: PlayerShotEvent) => {
        if (this.destroyed) return;
        if (!Number.isSafeInteger(event.id) || event.id <= this.lastEnqueuedId) { this.duplicateEvents++; return; }
        this.lastEnqueuedId = event.id; this.receivedEvents++;
        this.pending.push({ id: event.id, atMs: event.atMs, frame: this.frame() });
    };

    /** Called only after this frame's Bullet, Animator and final camera follow. */
    updateAfterPhysics(nowMs: number, firstPerson: boolean) {
        if (this.destroyed) return;
        this.muzzle.suppressDemonstrationStreams();
        const pending = this.pending; this.pending = [];
        for (const event of pending) {
            // Never resolve a stored shot in a later pose or after a long gap.
            if (event.frame !== this.frame() || nowMs - event.atMs > 250 || nowMs < event.atMs) { this.cancelledEvents++; continue; }
            const camera = this.camera.transform.position, player = this.player.transform.position;
            this.camera.transform.getForward(this.direction);
            const cameraOrigin: Vec3Tuple = [camera.x, camera.y, camera.z];
            const cameraDirection: Vec3Tuple = [this.direction.x, this.direction.y, this.direction.z];
            const muzzleOrigin = this.muzzle.sample(firstPerson);
            const muzzleAnchor: Vec3Tuple = [player.x, player.y + (firstPerson ? .72 : .52), player.z];
            this.query.beginShot();
            const result = resolveWaterShot({ cameraOrigin, cameraDirection, muzzleOrigin, muzzleAnchor, range: WATER_GUN_RANGE }, this.query.cast);
            const consumed = this.progress.consume(event.id, result.targetId);
            if (consumed.accepted) {
                this.view.applyCompleted(this.progress.getStatus().completedIds);
                this.effects.show(result, nowMs);
                this.hud.setProgress(TRAINING_TARGETS, this.progress.getStatus().completedIds);
                const target = TRAINING_TARGETS.find(item => item.id === consumed.targetId);
                this.hud.showShot(result.outcome, target?.label || null, consumed.newlyCompleted, nowMs);
            }
            this.records.push({ ...event, resolvedAtMs: nowMs, resolvedFrame: this.frame(), firstPerson,
                cameraOrigin, cameraDirection, muzzleOrigin, muzzleAnchor, result, accepted: consumed.accepted,
                newlyCompleted: consumed.newlyCompleted, resetCount: this.progress.getStatus().resetCount,
                queries: this.query.trace.map(trace => ({ ...trace })) });
            if (this.records.length > 64) this.records.shift();
        }
        this.effects.update(nowMs); this.hud.update(nowMs);
    }

    cancelPending() { this.cancelledEvents += this.pending.length; this.pending.length = 0; this.effects?.clear(); }

    reset() {
        if (this.destroyed) return;
        this.releaseForReset(); this.cancelPending();
        this.progress.reset(this.avatar.getStatus().shots);
        this.view.applyCompleted([]); this.hud.setProgress(TRAINING_TARGETS, []); this.hud.clear();
    }

    getStatus() {
        return { ...this.progress.getStatus(), range: WATER_GUN_RANGE, receivedEvents: this.receivedEvents,
            duplicateEvents: this.duplicateEvents, cancelledEvents: this.cancelledEvents, pendingShots: this.pending.length,
            queryGroup: WATER_QUERY_GROUP, queryMask: WATER_QUERY_MASK,
            aimSource: "current final camera optical axis (symmetric full viewport)", phase: "afterPhysicsAndAnimationAndCamera",
            targets: this.view.getTargets(), cover: TRAINING_COVER, muzzle: this.muzzle.getStatus(),
            shots: JSON.parse(JSON.stringify(this.records)) as ResolvedShot[] };
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true; this.avatar.setShotListener(null); this.cancelPending();
        this.hud.destroy(); this.effects.destroy(); this.view.destroy();
    }
}
