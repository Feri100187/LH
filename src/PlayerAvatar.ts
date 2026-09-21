const { regClass, property } = Laya;

export enum PlayerMotion {
    Idle, Walk, Run, Jump, RunJump, Land, RunLand,
    WalkBack, WalkLeft, WalkRight, WalkForwardLeft, WalkForwardRight, WalkBackLeft, WalkBackRight,
    RunBack, RunLeft, RunRight, RunForwardLeft, RunForwardRight, RunBackLeft, RunBackRight
}
export const GAIT_REFERENCE_SPEEDS: Record<string, number> = {
    Walk: 1.636363636, Run: 3.947368421,
    WalkBack: 1.208333333, WalkLeft: .806451613, WalkRight: .806451613,
    WalkForwardLeft: 1.25, WalkForwardRight: 1.25, WalkBackLeft: .9375, WalkBackRight: .9375,
    RunBack: 2.181818182, RunLeft: 1.785714286, RunRight: 1.785714286,
    RunForwardLeft: 2.232558140, RunForwardRight: 2.232558140, RunBackLeft: 1.719367589, RunBackRight: 1.719367589
};
const DIRECTION_SUFFIXES = ["", "ForwardRight", "Right", "BackRight", "Back", "BackLeft", "Left", "ForwardLeft"];
/** Camera-relative directions; a small dead band prevents joystick boundary chatter. */
export function movementSector(right: number, forward: number, previous = 0) {
    if (Math.hypot(right, forward) < 1e-6) return previous;
    const angle = Math.atan2(right, forward);
    const delta = angle - previous * Math.PI / 4;
    if (Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) < Math.PI / 8 + .07) return previous;
    return (Math.round(angle / (Math.PI / 4)) + 8) % 8;
}
export interface PlayerMotionFrame {
    speed: number; running: boolean; moving: boolean; grounded: boolean; jumped: boolean;
    yaw: number; pitch: number; moveX: number; moveZ: number;
    /** Monotonic milliseconds. Omit only for deterministic dt-driven callers. */
    nowMs?: number;
}

export interface PlayerShotEvent { readonly id: number; readonly atMs: number; }

/** Presentation follows the existing CharacterController. Physics owns all root motion. */
@regClass()
export class PlayerAvatar extends Laya.Script {
    @property({ type: Laya.AnimatorController, caption: "玩家动画状态机" }) controller: Laya.AnimatorController;
    private animator: Laya.Animator;
    private baseLayer: Laya.AnimatorControllerLayer;
    private upperLayer: Laya.AnimatorControllerLayer;
    private renderers: { renderer: Laya.MeshRenderer; head: boolean }[] = [];
    private spine: Laya.Sprite3D;
    private rootBone: Laya.Sprite3D;
    private weaponBone: Laya.Sprite3D;
    private weaponDirection = new Laya.Vector3();
    private ready = false;
    private motion = PlayerMotion.Idle;
    private moveSector = 0;
    private airborne = false;
    private sawAir = false;
    private runningJump = false;
    private airTime = 0;
    private fallDelay = 0;
    private landingTime = 0;
    private triggerHeld = false;
    private pendingShot = false;
    private firing = false;
    private fireClock = 0;
    private fireDuration = 0.2;
    private shotClockMs = 0;
    private shotClockInitialized = false;
    private fireStartedAtMs = 0;
    private nextShotAtMs = 0;
    private shotEvents: { id: number; atMs: number }[] = [];
    private shotEventCursor = 0;
    private fireCount = 0;
    private shotListener: ((event: PlayerShotEvent) => void) = null;
    private burstCount = 0;
    private upperWeight = 0;
    private heading = Math.PI;
    private viewYaw = 0;
    private viewPitch = 0;
    private thirdPerson = false;
    private obscured = false;
    private rotation = new Laya.Vector3();
    private aimAxis = new Laya.Vector3();
    private aimRotation = new Laya.Quaternion();
    private spineRotation = new Laya.Quaternion();
    private lastObservedState = "";
    private stateHistory: { base: string; upper: string; time: number }[] = [];

    initialize() {
        if (this.ready) return;
        const visit = (node: Laya.Node) => {
            const sprite = node as Laya.Sprite3D;
            const animator = sprite.getComponent(Laya.Animator);
            if (animator && !this.animator) this.animator = animator;
            if (node.name === "spine") this.spine = sprite;
            if (node.name === "root") this.rootBone = sprite;
            if (node.name === "weapon") this.weaponBone = sprite;
            const renderer = sprite.getComponent(Laya.MeshRenderer);
            if (renderer) {
                renderer.castShadow = node.name !== "FX_WaterPulse";
                renderer.receiveShadow = true;
                if (renderer instanceof Laya.SkinnedMeshRenderer) {
                    // Static import bounds do not contain the expanded water pulse or bent limbs.
                    renderer.localBounds = new Laya.Bounds(new Laya.Vector3(-2, -2, -2), new Laya.Vector3(2, 3, 2));
                }
                this.renderers.push({ renderer, head: /Head sculpted|Face \||Hair|Glasses|AWB.Neck/.test(node.name) });
            }
            for (let i = 0; i < node.numChildren; i++) visit(node.getChildAt(i));
        };
        visit(this.owner);
        if (!this.animator || !this.controller) throw new Error("玩家模型或动画状态机未加载。");
        this.animator.controller = this.controller;
        this.animator.cullingMode = Laya.Animator.CULLINGMODE_ALWAYSANIMATE;
        this.animator.sleep = false;
        this.baseLayer = this.animator.getControllerLayer(0);
        this.upperLayer = this.animator.getControllerLayer(1);
        for (const name of ["Idle", "Jump", "RunJump", "Land", "RunLand", ...Object.keys(GAIT_REFERENCE_SPEEDS)]) {
            if (!this.baseLayer.getAnimatorState(name)?.clip) throw new Error(`玩家动画缺失：${name}`);
        }
        this.fireDuration = this.upperLayer.getAnimatorState("Shoot").clip.duration();
        this.upperLayer.defaultWeight = 0;
        this.animator.setParamsNumber("Motion", PlayerMotion.Idle);
        this.animator.setParamsBool("Fire", false);
        this.animator.play("Idle", 0, 0);
        this.animator.play("UpperIdle", 1, 0);
        this.ready = true;
        this.applyVisibility();
        console.info(`[玩家] 动漫角色已就绪：${this.renderers.length} 个蒙皮网格，移动/跳跃/落地 + 上身射击状态机。`);
    }

    requestShoot() {
        if (!this.ready) return false;
        this.pendingShot = true;
        return true;
    }

    clearShootRequest() { this.pendingShot = false; }

    /** One owner; replacing or removing it never replays the diagnostic history. */
    setShotListener(listener: ((event: PlayerShotEvent) => void) | null) { this.shotListener = listener; }

    setTriggerHeld(held: boolean) {
        // A released held trigger must not leave an old automatic request behind.
        // A new frame-between tap can be requested after this release is applied.
        if (this.triggerHeld && !held) this.pendingShot = false;
        this.triggerHeld = held;
    }
    get isShooting() { return this.firing; }
    get shotPhase() { return this.fireClock / this.fireDuration; }

    getMovementSpeedScale(right: number, forward: number, running: boolean) {
        this.moveSector = movementSector(right, forward, this.moveSector);
        const family = running ? "Run" : "Walk";
        // Sidesteps and backpedals use shorter authored steps, rather than fast crossed legs.
        return Math.min(1, GAIT_REFERENCE_SPEEDS[family + DIRECTION_SUFFIXES[this.moveSector]] / GAIT_REFERENCE_SPEEDS[family]);
    }

    private emitShot(nowMs: number) {
        this.fireCount++;
        const event = { id: this.fireCount, atMs: nowMs };
        if (this.shotEvents.length < 256) this.shotEvents.push(event);
        else {
            this.shotEvents[this.shotEventCursor] = event;
            this.shotEventCursor = (this.shotEventCursor + 1) % 256;
        }
        this.shotListener?.({ id: event.id, atMs: event.atMs });
    }

    private updateFire(dt: number, nowMs: number) {
        const intervalMs = this.fireDuration * 1000;
        const epsilonMs = .001; // Accommodate float32 clip duration at exact frame boundaries.
        if (!this.firing && (this.triggerHeld || this.pendingShot)) {
            this.firing = true;
            this.pendingShot = false;
            this.fireClock = 0;
            this.fireStartedAtMs = nowMs;
            this.nextShotAtMs = nowMs + intervalMs;
            this.emitShot(nowMs);
            this.burstCount = 1;
            this.animator.setParamsBool("Fire", true);
            // The clip begins in the ready pose with water already leaving the nozzle.
            this.animator.play("Shoot", 1, 0);
        } else if (this.firing) {
            this.fireClock = Math.max(0, (nowMs - this.fireStartedAtMs) / 1000) % this.fireDuration;
            if (nowMs + epsilonMs >= this.nextShotAtMs) {
                if (this.triggerHeld || this.pendingShot) {
                    this.pendingShot = false;
                    // One actual emission per frame. Expired deadlines never become queued shots.
                    this.emitShot(nowMs);
                    this.burstCount++;
                    const expired = Math.floor((nowMs - this.nextShotAtMs + epsilonMs) / intervalMs) + 1;
                    this.nextShotAtMs += expired * intervalMs;
                } else {
                    this.firing = false;
                    this.animator.setParamsBool("Fire", false);
                    console.info(`[玩家射击] 本轮 ${this.burstCount} 次，间隔 ${this.fireDuration.toFixed(3)} 秒，已释放扳机。`);
                }
            }
        }
        const wantedWeight = this.firing ? 1 : 0;
        const blendRate = this.firing ? 24 : 12;
        this.upperWeight += Math.sign(wantedWeight - this.upperWeight) * Math.min(Math.abs(wantedWeight - this.upperWeight), dt * blendRate);
        this.upperLayer.defaultWeight = this.upperWeight;
    }

    step(dt: number, input: PlayerMotionFrame) {
        if (!this.ready) return;
        const elapsedMs = Number.isFinite(dt) && dt > 0 ? dt * 1000 : 0;
        const suppliedClock = input.nowMs !== undefined;
        const validClock = !suppliedClock || (Number.isFinite(input.nowMs) && input.nowMs >= 0);
        let nowMs = suppliedClock && validClock ? input.nowMs : this.shotClockMs + elapsedMs;
        const gapMs = this.shotClockInitialized ? nowMs - this.shotClockMs : 0;
        if (!validClock || gapMs < 0 || gapMs > 250 || elapsedMs > 250) {
            this.cancelTransientActions();
            if (!validClock || gapMs < 0) nowMs = this.shotClockMs;
        }
        this.shotClockMs = nowMs;
        this.shotClockInitialized = true;
        this.viewYaw = input.yaw;
        this.viewPitch = input.pitch;
        if (input.moving) {
            const right = Math.cos(input.yaw) * input.moveX + Math.sin(input.yaw) * input.moveZ;
            const forward = Math.sin(input.yaw) * input.moveX - Math.cos(input.yaw) * input.moveZ;
            this.moveSector = movementSector(right, forward, this.moveSector);
        }
        this.updateFire(dt, nowMs);

        if (input.jumped) this.beginAir(input.running && input.moving);
        if (!input.grounded) {
            this.fallDelay += dt;
            if (this.airborne) this.sawAir = true;
            else if (this.fallDelay > 0.085) {
                this.beginAir(input.running && input.moving);
                this.sawAir = true;
            }
        } else this.fallDelay = 0;
        if (this.airborne) {
            this.airTime += dt;
            if (input.grounded && this.sawAir && this.airTime > 0.10) {
                this.airborne = false;
                this.landingTime = 0.22;
            } else if (input.grounded && !this.sawAir && this.airTime > 0.16) {
                // A low ceiling can reject a requested jump before the capsule leaves the ground.
                this.airborne = false;
                this.landingTime = 0;
            }
        }
        let next: PlayerMotion;
        if (this.airborne) next = this.runningJump ? PlayerMotion.RunJump : PlayerMotion.Jump;
        else if (this.landingTime > 0) {
            this.landingTime -= dt;
            next = this.runningJump ? PlayerMotion.RunLand : PlayerMotion.Land;
        } else next = input.moving && input.speed > 0.08
            ? PlayerMotion[((input.running ? "Run" : "Walk") + DIRECTION_SUFFIXES[this.moveSector]) as keyof typeof PlayerMotion] as PlayerMotion
            : PlayerMotion.Idle;
        if (next !== this.motion) {
            const previousName = PlayerMotion[this.motion];
            const nextName = PlayerMotion[next];
            const playState = this.baseLayer.getCurrentPlayState();
            const phase = GAIT_REFERENCE_SPEEDS[previousName] && GAIT_REFERENCE_SPEEDS[nextName]
                ? ((playState.normalizedTime % 1) + 1) % 1 : 0;
            // Native conditions remain the only transition driver. Preserve the planted-foot phase.
            for (const state of this.baseLayer.states) for (const transition of [...state.transitions, ...state.soloTransitions]) {
                if (transition.destState?.name === nextName) transition.transstartoffset = phase;
            }
            this.motion = next;
            this.animator.setParamsNumber("Motion", next);
        }
        // Authored stance-foot travel divided by stance duration gives meters per second.
        // Scale continuously for analog input and collisions so planted feet do not skate.
        for (const name of Object.keys(GAIT_REFERENCE_SPEEDS)) {
            this.baseLayer.getAnimatorState(name).speed = Math.max(0.05, Math.min(2.5, input.speed / GAIT_REFERENCE_SPEEDS[name]));
        }

        // Strafe/backpedal legs change direction; the body always follows the view heading.
        const desired = Math.PI - input.yaw;
        this.heading = Math.atan2(Math.sin(desired), Math.cos(desired));
        this.rotation.setValue(0, this.heading * 180 / Math.PI, 0);
        (this.owner as Laya.Sprite3D).transform.localRotationEuler = this.rotation;
    }

    private beginAir(running: boolean) {
        this.airborne = true; this.sawAir = false; this.airTime = 0;
        this.runningJump = running; this.landingTime = 0;
    }

    onAfterSceneUpdate() {
        if (!this.ready) return;
        const base = this.baseLayer.getCurrentPlayState().animatorState?.name || "";
        const upper = this.upperWeight > .01 ? this.upperLayer.getCurrentPlayState().animatorState?.name || "" : "";
        const state = base + "/" + upper;
        if (state !== this.lastObservedState) {
            this.lastObservedState = state;
            this.stateHistory.push({ base, upper, time: Laya.timer.currTimer });
            if (this.stateHistory.length > 24) this.stateHistory.shift();
            console.info(`[玩家动画] ${state}`);
        }
        if (!this.spine || this.upperWeight < .001) return;
        // This hook runs after AnimatorManager, immediately before renderer updates.
        const pitch = Math.max(-.70, Math.min(.80, this.viewPitch - .087)) * this.upperWeight;
        this.aimAxis.setValue(Math.cos(this.viewYaw), 0, Math.sin(this.viewYaw));
        Laya.Quaternion.createFromAxisAngle(this.aimAxis, pitch, this.aimRotation);
        Laya.Quaternion.multiply(this.aimRotation, this.spine.transform.rotation, this.spineRotation);
        this.spine.transform.rotation = this.spineRotation;
    }

    setVisibility(thirdPerson: boolean, obscured = false) {
        if (this.thirdPerson === thirdPerson && this.obscured === obscured) return;
        this.thirdPerson = thirdPerson; this.obscured = obscured; this.applyVisibility();
    }

    private applyVisibility() {
        for (const part of this.renderers) part.renderer.enabled = this.thirdPerson && !this.obscured;
    }

    cancelTransientActions() {
        this.triggerHeld = this.pendingShot = this.firing = false;
        this.fireClock = 0;
        this.nextShotAtMs = this.fireStartedAtMs = 0;
        this.upperWeight = 0;
        if (this.upperLayer) this.upperLayer.defaultWeight = 0;
        if (this.animator) this.animator.setParamsBool("Fire", false);
    }

    resetMotion() {
        this.cancelTransientActions(); this.airborne = this.sawAir = false;
        this.airTime = this.fallDelay = this.landingTime = 0; this.motion = PlayerMotion.Idle;
        if (this.animator) { this.animator.setParamsNumber("Motion", 0); this.animator.play("Idle", 0, 0); }
    }

    getStatus() {
        const base = this.baseLayer?.getCurrentPlayState();
        const upper = this.upperLayer?.getCurrentPlayState();
        const r = this.rootBone?.transform.localPosition;
        this.weaponBone?.transform.getUp(this.weaponDirection);
        const gun = this.weaponDirection;
        return { loaded: this.ready, motion: PlayerMotion[this.motion], direction: DIRECTION_SUFFIXES[this.moveSector] || "Forward", base: base?.animatorState?.name,
            baseTime: base?.normalizedTime, upper: upper?.animatorState?.name, upperTime: upper?.normalizedTime,
            shooting: this.firing, triggerHeld: this.triggerHeld, shotQueued: this.pendingShot,
            shots: this.fireCount, shotInterval: this.fireDuration, upperWeight: this.upperWeight,
            shotEvents: [...this.shotEvents.slice(this.shotEventCursor), ...this.shotEvents.slice(0, this.shotEventCursor)]
                .map(event => ({ ...event })),
            airborne: this.airborne, rootLocal: r ? [r.x, r.y, r.z] : null,
            meshCount: this.renderers.length, visibleMeshes: this.renderers.filter(r => r.renderer.enabled).length,
            gaitRates: { walk: this.baseLayer?.getAnimatorState("Walk")?.speed, run: this.baseLayer?.getAnimatorState("Run")?.speed },
            gunDirection: this.weaponBone ? [gun.x, gun.y, gun.z] : null,
            gunForwardDotBody: this.weaponBone ? gun.x * Math.sin(this.heading) + gun.z * Math.cos(this.heading) : null,
            heading: this.heading, history: this.stateHistory };
    }
}
