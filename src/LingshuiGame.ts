import collisionData from "../assets/resources/LingshuiCollision.json";
import { MobileInput } from "./MobileInput";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerCameraFollow } from "./PlayerCameraFollow";
import { FirstPersonArms } from "./FirstPersonArms";
import "./LakeDuck";
const { regClass, property } = Laya;

/** 凌水湖场景入口。单位为米，Y 轴向上。 */
@regClass()
export class LingshuiGame extends Laya.Script {
    @property({ type: Number, caption: "步行速度（米/秒）" }) walkSpeed = 1.65;
    @property({ type: Number, caption: "奔跑速度（米/秒）" }) runSpeed = 4.0;
    @property({ type: Number, caption: "跳跃初速度" }) jumpSpeed = 6.5;
    @property({ type: Number, caption: "鼠标灵敏度" }) sensitivity = 0.002;
    @property({ type: Number, caption: "触屏灵敏度" }) touchSensitivity = 1;
    @property({ type: Number, caption: "越肩距离" }) shoulderDistance = 1.95;
    @property({ type: Number, caption: "右肩偏移" }) shoulderOffset = 0.65;
    @property({ type: Number, caption: "越肩抬高（米）" }) shoulderHeight = 0.32;

    private world: Laya.Scene3D;
    private player: Laya.Sprite3D;
    private body: Laya.MeshRenderer;
    private avatar: PlayerAvatar;
    private motor: Laya.CharacterController;
    private camera: Laya.Camera;
    private cameraFollow: PlayerCameraFollow;
    private firstPersonArms: FirstPersonArms;
    private keys = new Set<string>();
    private yaw = 0.32;
    private pitch = 0.025;
    private thirdPerson = false;
    private locked = false;
    private jumpQueued = false;
    private shootQueued = false;
    private mouseHeld = false;
    private mousePointer: number = null;
    private previousPlayerPosition = new Laya.Vector3();
    private actualSpeed = 0;
    private speedSamples: { distance: number; seconds: number }[] = [];
    private speedDistance = 0;
    private speedTime = 0;
    private statusElapsed = 0;
    private canvas: HTMLCanvasElement;
    private hud: HTMLDivElement;
    private prompt: HTMLDivElement;
    private modeLabel: HTMLDivElement;
    private mobileInput: MobileInput;
    private ready = false;
    private safePoint = new Laya.Vector3(-26, 1.88, 37.2);
    private move = new Laya.Vector3();
    private forward = new Laya.Vector3();
    private right = new Laya.Vector3();
    private anchor = new Laya.Vector3();
    private target = new Laya.Vector3();
    private desired = new Laya.Vector3();
    private cameraPoint = new Laya.Vector3();
    private hit = new Laya.HitResult();
    private cameraSphere: Laya.SphereColliderShape;
    private cameraLength = this.shoulderDistance;
    private elapsed = 0;
    private sampleFrames = 0;
    private sampleTime = 0;
    private fps = 0;
    private waterMaterials = new Set<Laya.Material>();
    private rippleTransform = new Laya.Matrix3x3();
    private rippleTime = 0;

    onStart() {
        this.world = (this.owner as Laya.Scene).scene3D || Laya.stage.getChildByName("LingshuiWorld") as Laya.Scene3D;
        this.player = this.world.getChildByName("PlayerCapsule") as Laya.Sprite3D;
        this.camera = this.world.getChildByName("PlayerCamera") as Laya.Camera;
        this.body = this.player.getComponent(Laya.MeshRenderer);
        this.avatar = this.player.getChildByName("PlayerAvatar")?.getComponent(PlayerAvatar);
        if (!this.avatar) throw new Error("玩家人物预制体未绑定，请检查 PlayerCapsule 下的 PlayerAvatar。");
        const model = this.world.getChildByName("LingshuiEnvironment") as Laya.Sprite3D;
        if (!model) throw new Error("凌水湖模型未加载，请检查场景中的 LingshuiEnvironment 资源引用。");

        let colliders = 0, renderers = 0;
        const visit = (node: Laya.Node, collision = false) => {
            collision = collision || node.name === "99_Collision" || node.name.startsWith("COL__");
            const sprite = node as Laya.Sprite3D;
            const renderer = sprite.getComponent?.(Laya.MeshRenderer);
            const mesh = sprite.getComponent?.(Laya.MeshFilter)?.sharedMesh;
            if (renderer && mesh) {
                if (collision) {
                    renderer.enabled = false;
                } else {
                    renderer.receiveShadow = true;
                    renderer.castShadow = !/水面|湖床|远山|低山/.test(sprite.name);
                    if (sprite.name.indexOf('水面') >= 0) for (const mat of renderer.sharedMaterials) this.waterMaterials.add(mat);
                    renderers++;
                }
            }
            for (let i = 0; i < node.numChildren; i++) visit(node.getChildAt(i), collision);
        };
        visit(model);
        const physicalWorld = new Laya.Sprite3D("场景碰撞_分区简化网格");
        this.world.addChild(physicalWorld);
        const makeCollider = (name: string, shape: Laya.Physics3DColliderShape, position?: Laya.Vector3) => {
            const node = new Laya.Sprite3D(name);
            physicalWorld.addChild(node);
            if (position) node.transform.position = position;
            const c = node.addComponent(Laya.PhysicsCollider);
            c.collisionGroup = 1; c.canCollideWith = 2; c.colliderShape = shape;
            colliders++;
        };
        for (const chunk of collisionData.chunks) {
            const mesh = Laya.PrimitiveMesh._createMesh(Laya.VertexMesh.getVertexDeclaration("POSITION"),
                new Float32Array(chunk.vertices), new Uint16Array(chunk.indices));
            const shape = new Laya.MeshColliderShape();
            shape.mesh = mesh;
            makeCollider(chunk.name, shape);
        }
        for (const box of collisionData.boxes) {
            makeCollider(box.name, new Laya.BoxColliderShape(box.size[0], box.size[1], box.size[2]),
                new Laya.Vector3(box.center[0], box.center[1], box.center[2]));
        }
        for (const trunk of collisionData.trunks) {
            makeCollider("树干碰撞", new Laya.CylinderColliderShape(trunk[3], 3.6),
                new Laya.Vector3(trunk[0], trunk[1], trunk[2]));
        }

        this.motor = this.player.addComponent(Laya.CharacterController);
        this.motor.radius = 0.32;
        this.motor.height = 1.8;
        this.motor.centerOffset = new Laya.Vector3(0, 0, 0);
        this.motor.stepHeight = 0.35;
        this.motor.maxSlope = 48;
        this.motor.gravity = new Laya.Vector3(0, -18, 0);
        this.motor.jumpSpeed = this.jumpSpeed;
        this.motor.collisionGroup = 2;
        this.motor.canCollideWith = 1;
        this.cameraSphere = new Laya.SphereColliderShape(0.18);
        const capsuleMaterial = new Laya.BlinnPhongMaterial();
        capsuleMaterial.albedoColor = new Laya.Color(0.12, 0.45, 0.55, 1);
        capsuleMaterial.shininess = 0.18;
        this.body.sharedMaterial = capsuleMaterial;
        // Shared primitive dimensions are 1 x 2 x 1; use the exact motor dimensions.
        this.player.getComponent(Laya.MeshFilter).sharedMesh = Laya.PrimitiveMesh.createCapsule(0.32, 1.8, 12, 16);
        this.body.castShadow = true;
        this.body.enabled = false;
        this.avatar.initialize();
        const armsMount = this.camera.getChildByName("FirstPersonArms") as Laya.Sprite3D;
        if (!armsMount) throw new Error("PlayerCamera 下缺少第一人称双臂预制体。");
        this.firstPersonArms = new FirstPersonArms(armsMount);
        this.cameraFollow = this.camera.addComponent(PlayerCameraFollow);
        this.cameraFollow.follow = () => this.followAfterPhysics();
        this.player.transform.position.cloneTo(this.previousPlayerPosition);
        this.camera.nearPlane = 0.06;
        this.camera.farPlane = 700;
        this.camera.fieldOfView = 72;
        this.setupInput();
        this.setupHud();
        this.mobileInput = new MobileInput(this.canvas, this.hud, {
            look: this.handleTouchLook,
            jump: () => { this.jumpQueued = true; },
            shoot: () => { this.shootQueued = true; },
            perspective: () => { this.setPerspective(!this.thirdPerson); },
            modeChanged: this.updateInputPresentation
        });
        this.updateInputPresentation();
        this.setPerspective(false);
        this.ready = true;
        this.updateCamera(1);
        // Read-only status is useful for automated regression checks and local debugging.
        (window as any).lingshuiGame = this;
        console.info(`[凌水湖] 已加载 ${renderers} 个渲染网格、${colliders} 个静态碰撞网格。第一人称已就绪。`);
    }

    private setupInput() {
        this.canvas = Laya.Browser.mainCanvas.source as HTMLCanvasElement;
        this.canvas.tabIndex = 0;
        this.canvas.addEventListener("pointerdown", this.routeLockedPointerDown, true);
        this.canvas.addEventListener("pointerdown", this.acquireMouse);
        document.addEventListener("pointerup", this.releaseMouse, true);
        document.addEventListener("pointercancel", this.releaseMouse, true);
        document.addEventListener("mouseup", this.releaseMouseButton, true);
        document.addEventListener("pointerlockchange", this.onLockChange);
        document.addEventListener("pointerlockerror", this.onLockError);
        document.addEventListener("mousemove", this.handleMouseMove);
        document.addEventListener("keydown", this.handleKeyDown);
        document.addEventListener("keyup", this.handleKeyUp);
        window.addEventListener("blur", this.releaseInput);
        document.addEventListener("visibilitychange", this.onVisibility);
        this.canvas.addEventListener("contextmenu", this.preventMenu);
    }

    private routeLockedPointerDown = (event: PointerEvent) => {
        if (document.pointerLockElement !== this.canvas) return;
        // Laya InputManager captures every canvas pointerdown. Pointer lock forbids that API.
        // Route locked mouse input here, before its target/bubble listener can attempt capture.
        if (event.pointerType === "mouse") this.acquireMouse(event);
        else this.mobileInput?.handleCanvasPointer(event);
        event.stopImmediatePropagation();
    };

    private acquireMouse = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        if (document.pointerLockElement === this.canvas) {
            this.mouseHeld = true;
            this.mousePointer = event.pointerId;
            this.shootQueued = true;
        }
        this.mobileInput?.setEnabled(false);
        this.canvas.focus({ preventScroll: true });
        if (document.pointerLockElement !== this.canvas) {
            try {
                const request = this.canvas.requestPointerLock();
                if (request && typeof (request as any).catch === "function") {
                    (request as any).catch(this.onLockError);
                }
            } catch (error) { this.onLockError(); }
        }
    };
    private releaseMouse = (event: PointerEvent) => {
        if (event.pointerType === "mouse" && event.pointerId === this.mousePointer &&
            (event.type === "pointercancel" || event.button === 0 || !(event.buttons & 1))) {
            this.mouseHeld = false;
            this.mousePointer = null;
        }
        if (document.pointerLockElement === this.canvas && event.target === this.canvas) {
            // Locked input has no pointer capture. Skip Laya's unconditional pointerup release too.
            this.mobileInput?.handleCanvasPointer(event);
            event.stopImmediatePropagation();
        }
    };
    private releaseMouseButton = (event: MouseEvent) => {
        // A left-button release can occur without pointerup while another mouse button remains down.
        if (event.button === 0) {
            this.mouseHeld = false;
            this.mousePointer = null;
        }
    };
    private onLockChange = () => {
        this.locked = document.pointerLockElement === this.canvas;
        if (!this.locked) {
            this.keys.clear();
            this.mouseHeld = false;
            this.mousePointer = null;
            this.jumpQueued = false;
            if (!this.mobileInput?.enabled) this.releaseInput();
        }
        this.updateInputPresentation();
    };
    private updateInputPresentation = () => {
        const touch = this.mobileInput?.enabled || this.hud?.dataset.input === "touch";
        if (touch && document.pointerLockElement === this.canvas) document.exitPointerLock();
        if (this.prompt) this.prompt.style.display = this.locked || touch ? "none" : "flex";
    };
    private onLockError = () => {
        if (this.prompt) this.prompt.querySelector("small").textContent = "请再次点击进入；Esc 可释放鼠标";
    };
    private handleMouseMove = (event: MouseEvent) => {
        if (!this.locked) return;
        this.yaw += event.movementX * this.sensitivity;
        this.pitch = Math.max(-1.40, Math.min(1.40, this.pitch - event.movementY * this.sensitivity));
    };
    private handleTouchLook = (dx: number, dy: number) => {
        // Use CSS pixels, independent of devicePixelRatio; clamp pitch just like the desktop camera.
        const scale = 0.004 * this.touchSensitivity;
        this.yaw += dx * scale;
        this.pitch = Math.max(-1.40, Math.min(1.40, this.pitch - dy * scale));
    };
    private handleKeyDown = (event: KeyboardEvent) => {
        if (!this.locked || document.pointerLockElement !== this.canvas || !document.hasFocus() || document.hidden) return;
        if (event.code === "Escape") {
            this.releaseInput();
            document.exitPointerLock();
            return;
        }
        if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "KeyV", "KeyF"].indexOf(event.code) >= 0) event.preventDefault();
        this.keys.add(event.code);
        if (event.repeat) return;
        if (event.code === "KeyV") this.setPerspective(!this.thirdPerson);
        if (event.code === "Space") this.jumpQueued = true;
        if (event.code === "KeyF") this.shootQueued = true;
    };
    private handleKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
    private releaseInput = () => {
        this.keys.clear();
        this.jumpQueued = false;
        this.shootQueued = false;
        this.mouseHeld = false;
        this.mousePointer = null;
        this.resetActualSpeed();
        this.avatar?.setTriggerHeld(false);
        this.avatar?.cancelTransientActions();
        this.mobileInput?.reset();
        if (this.motor) this.motor.move(new Laya.Vector3());
    };
    private onVisibility = () => { if (document.hidden) this.releaseInput(); };
    private preventMenu = (event: Event) => { event.preventDefault(); };

    private updateShootInput() {
        const focused = document.hasFocus() && !document.hidden;
        const desktop = this.locked && document.pointerLockElement === this.canvas;
        const touch = !!this.mobileInput?.enabled;
        const held = focused && ((desktop && (this.mouseHeld || this.keys.has("KeyF"))) || (touch && this.mobileInput.shooting));
        this.avatar.setTriggerHeld(held);
        // Preserve taps that begin and end between render frames, without firing the lock-acquisition click.
        if (this.shootQueued && focused && (desktop || touch)) this.avatar.requestShoot();
        this.shootQueued = false;
    }

    private resetActualSpeed() {
        this.actualSpeed = this.speedDistance = this.speedTime = 0;
        this.speedSamples.length = 0;
        this.player?.transform.position.cloneTo(this.previousPlayerPosition);
    }

    private recordActualSpeed(distance: number, seconds: number, moving: boolean) {
        if (!moving || seconds <= 0 || !Number.isFinite(distance) || !Number.isFinite(seconds)) {
            this.resetActualSpeed();
            return;
        }
        // Bullet advances at fixed 60 Hz, while onUpdate may run on intervening render frames.
        // Average measured travel over at most 100 ms; a wall therefore clears motion promptly.
        const windowSeconds = 0.10;
        this.speedSamples.push({ distance, seconds });
        this.speedDistance += distance;
        this.speedTime += seconds;
        while (this.speedTime - windowSeconds > 1e-9 && this.speedSamples.length) {
            const oldest = this.speedSamples[0];
            const removedTime = Math.min(this.speedTime - windowSeconds, oldest.seconds);
            const removedDistance = oldest.distance * (removedTime / oldest.seconds);
            this.speedDistance -= removedDistance;
            this.speedTime -= removedTime;
            oldest.distance -= removedDistance;
            oldest.seconds -= removedTime;
            if (oldest.seconds < 1e-9) this.speedSamples.shift();
        }
        this.actualSpeed = this.speedTime > 1e-9 ? Math.max(0, this.speedDistance) / this.speedTime : 0;
        if (this.actualSpeed < 1e-7) this.actualSpeed = 0;
    }

    private setupHud() {
        this.hud = document.createElement("div");
        this.hud.id = "lingshui-hud";
        this.hud.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:10;color:#fff;font-family:Arial,'Microsoft YaHei',sans-serif;user-select:none";
        this.hud.innerHTML = `
            <style>
            #lingshui-hud .title{position:absolute;left:24px;top:21px;font-size:18px}
            #lingshui-hud .mode{position:absolute;right:24px;top:23px;font-size:12px;text-shadow:0 1px 4px #000}
            #lingshui-hud .reticle{position:absolute;left:50%;top:50%;width:0;height:0;filter:drop-shadow(0 1px 1px #000)}
            #lingshui-hud .reticle i{position:absolute;background:#fff;border-radius:1px;box-shadow:0 0 0 1px #0008}
            #lingshui-hud .reticle .l{width:9px;height:2px;left:-15px;top:-1px}
            #lingshui-hud .reticle .r{width:9px;height:2px;left:6px;top:-1px}
            #lingshui-hud .reticle .t{width:2px;height:9px;left:-1px;top:-15px}
            #lingshui-hud .reticle .b{width:2px;height:9px;left:-1px;top:6px}
            #lingshui-hud .reticle .dot{width:2px;height:2px;left:-1px;top:-1px}
            </style>
            <div class="title" style="text-shadow:0 2px 5px #0009;letter-spacing:2px">凌水湖<span style="font-size:11px;opacity:.8;letter-spacing:1px;margin-left:12px">大连理工大学</span></div>
            <div class="mode">第一人称</div>
            <div class="reticle"><i class="l"></i><i class="r"></i><i class="t"></i><i class="b"></i><i class="dot"></i></div>
            <div class="desktop-help" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:9px 16px;background:#13252d80;border:1px solid #ffffff20;border-radius:5px;font-size:12px">WASD 移动　 Space 跳跃　 Shift 奔跑　 左键/F 射击　 V 切换视角　 Esc 释放鼠标</div>
            <div class="capture" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;background:#0c1c2920">
              <div style="margin-top:125px;text-align:center;padding:20px 34px;background:#101b29df;border:1px solid #ffffff40;border-radius:8px;box-shadow:0 8px 32px #0003"><strong style="font-size:17px;font-weight:500">点击进入凌水湖</strong><small style="display:block;margin-top:10px;font-size:12px;color:#c1d4df">鼠标转向 · V 切换越肩视角 · Esc 释放鼠标</small></div>
            </div>`;
        document.body.appendChild(this.hud);
        this.prompt = this.hud.querySelector(".capture");
        this.modeLabel = this.hud.querySelector(".mode");
        this.prompt.addEventListener("pointerdown", this.acquireMouse);
    }

    private setPerspective(third: boolean) {
        this.thirdPerson = third;
        this.body.enabled = false;
        this.avatar?.setVisibility(third);
        this.cameraLength = this.shoulderDistance;
        if (this.modeLabel) this.modeLabel.textContent = third ? "第三人称 · 右肩" : "第一人称";
        this.mobileInput?.setPerspective(third);
    }

    onUpdate() {
        if (!this.ready) return;
        const sampleSeconds = Math.max(0, Laya.timer.delta / 1000);
        const dt = Math.min(sampleSeconds, 0.05);
        const currentPosition = this.player.transform.position;
        const measuredDistance = Math.hypot(currentPosition.x - this.previousPlayerPosition.x,
            currentPosition.z - this.previousPlayerPosition.z);
        currentPosition.cloneTo(this.previousPlayerPosition);
        this.rippleTime += dt;
        this.rippleTransform.elements[6] = (this.rippleTime * 0.018) % 1;
        this.rippleTransform.elements[7] = (this.rippleTime * 0.009) % 1;
        for (const mat of this.waterMaterials) mat.shaderData.setMatrix3x3(Laya.Shader3D.propertyNameToID('u_NormalMapTransform'), this.rippleTransform);
        this.elapsed += dt;
        this.sampleFrames++;
        this.sampleTime += Laya.timer.delta / 1000;
        if (this.sampleTime >= 1) { this.fps = this.sampleFrames / this.sampleTime; this.sampleFrames = 0; this.sampleTime = 0; }
        let x = 0, z = 0;
        if (this.locked && document.hasFocus()) {
            x = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
            z = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
        }
        if (this.mobileInput?.enabled && !document.hidden) {
            x += this.mobileInput.moveX;
            z += this.mobileInput.moveZ;
        }
        const magnitude = Math.hypot(x, z);
        this.recordActualSpeed(measuredDistance, sampleSeconds, magnitude > .05);
        const running = (this.locked && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"))) || this.mobileInput?.running;
        const speed = (running ? this.runSpeed : this.walkSpeed) * this.avatar.getMovementSpeedScale(x, z, !!running);
        // Normalize diagonal input without flattening the joystick's low-speed range.
        const amount = magnitude > 0 ? speed * dt / Math.max(1, magnitude) : 0;
        this.move.setValue((Math.cos(this.yaw) * x + Math.sin(this.yaw) * z) * amount, 0,
            (Math.sin(this.yaw) * x - Math.cos(this.yaw) * z) * amount);
        this.motor.move(this.move);
        const grounded = this.motor.isOnGround();
        const jumped = this.jumpQueued && grounded;
        if (jumped) this.motor.jump(new Laya.Vector3(0, this.jumpSpeed, 0));
        this.jumpQueued = false;
        this.updateShootInput();
        this.avatar.step(dt, { speed: this.actualSpeed, running: !!running, moving: magnitude > .05,
            grounded, jumped, yaw: this.yaw, pitch: this.pitch, moveX: this.move.x, moveZ: this.move.z });
        this.firstPersonArms.update(dt, this.actualSpeed, !!running, this.avatar.isShooting, this.avatar.shotPhase);
        const p = this.player.transform.position;
        if (this.motor.isOnGround() && p.y > 1.22 && Math.abs(p.x) < 208 && Math.abs(p.z) < 188 && this.elapsed > 0.4) {
            p.cloneTo(this.safePoint); this.elapsed = 0;
        }
        // No swimming system yet: entering deep water returns to the last dry foothold.
        if (p.y < 0.25 || Math.abs(p.x) > 210 || Math.abs(p.z) > 190) {
            this.respawn();
        }
    }

    private followAfterPhysics() {
        if (!this.ready) return;
        const dt = Math.min(Laya.timer.delta / 1000, .05);
        this.updateCamera(dt);
        this.statusElapsed += dt;
        if (this.statusElapsed > .1 && this.hud) {
            this.statusElapsed = 0;
            // Read-only DOM diagnostic for integration/interaction regression checks.
            this.hud.dataset.playerStatus = JSON.stringify(this.getStatus());
        }
    }

    private updateCamera(dt: number) {
        const cp = Math.cos(this.pitch);
        this.forward.setValue(Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
        this.right.setValue(Math.cos(this.yaw), 0, Math.sin(this.yaw));
        const p = this.player.transform.position;
        this.anchor.setValue(p.x, p.y + (this.thirdPerson ? 0.52 : 0.72), p.z);
        if (this.thirdPerson) {
            this.firstPersonArms?.setVisible(false, this.avatar.isShooting, this.avatar.shotPhase);
            this.desired.setValue(this.anchor.x + this.right.x * this.shoulderOffset - this.forward.x * this.shoulderDistance,
                this.anchor.y + this.shoulderHeight - this.forward.y * this.shoulderDistance,
                this.anchor.z + this.right.z * this.shoulderOffset - this.forward.z * this.shoulderDistance);
            let fraction = 1;
            if (this.world.physicsSimulation.shapeCast(this.cameraSphere.shape, this.anchor, this.desired, this.hit, null, null, 2, 1)) {
                fraction = Math.max(0.04, this.hit.hitFraction - 0.035);
            }
            const fullLength = Laya.Vector3.distance(this.anchor, this.desired);
            const allowed = fullLength * fraction;
            this.cameraLength = allowed < this.cameraLength ? allowed : this.cameraLength + (allowed - this.cameraLength) * Math.min(1, dt * 9);
            Laya.Vector3.lerp(this.anchor, this.desired, Math.min(1, this.cameraLength / fullLength), this.cameraPoint);
            this.camera.transform.position = this.cameraPoint;
            // A long sight line keeps the crosshair close to the intended aim direction.
            this.target.setValue(this.anchor.x + this.forward.x * 30, this.anchor.y + this.forward.y * 30, this.anchor.z + this.forward.z * 30);
            this.avatar.setVisibility(true, this.cameraLength <= 0.65);
        } else {
            this.avatar.setVisibility(false);
            this.firstPersonArms?.setVisible(true, this.avatar.isShooting, this.avatar.shotPhase);
            this.camera.transform.position = this.anchor;
            this.target.setValue(this.anchor.x + this.forward.x, this.anchor.y + this.forward.y, this.anchor.z + this.forward.z);
        }
        this.camera.transform.lookAt(this.target, Laya.Vector3.Up, false, true);
    }

    private respawn() {
        this.releaseInput();
        const p = this.safePoint.clone(); p.y += 0.1;
        this.motor.position = p;
        this.player.transform.position = p;
        this.motor.move(new Laya.Vector3());
        p.cloneTo(this.previousPlayerPosition);
        this.avatar?.resetMotion();
    }

    getStatus() {
        const p = this.player?.transform.position;
        const c = this.camera?.transform.position;
        return { ready: this.ready, firstPerson: !this.thirdPerson, locked: this.locked,
            position: p ? [p.x, p.y, p.z] : null, camera: c ? [c.x, c.y, c.z] : null,
            yaw: this.yaw, pitch: this.pitch, grounded: this.motor?.isOnGround(),
            cameraDistance: this.cameraLength, fps: Math.round(this.fps), keys: Array.from(this.keys),
            inputMode: this.mobileInput?.enabled ? "touch" : "desktop", touch: this.mobileInput?.getStatus(),
            triggerHeld: this.mouseHeld || this.keys.has("KeyF") || !!this.mobileInput?.shooting,
            speed: this.actualSpeed, avatar: this.avatar?.getStatus(), firstPersonArms: this.firstPersonArms?.getStatus(),
            cameraFollowPhase: "afterPhysicsAndAnimation",
            firstPersonCameraOffset: p && c && !this.thirdPerson ? [c.x - p.x, c.y - p.y, c.z - p.z] : null };
    }

    onDestroy() {
        this.ready = false;
        if (this.cameraFollow) { this.cameraFollow.follow = null; this.cameraFollow.destroy(); }
        this.releaseInput();
        this.canvas?.removeEventListener("pointerdown", this.routeLockedPointerDown, true);
        this.canvas?.removeEventListener("pointerdown", this.acquireMouse);
        document.removeEventListener("pointerup", this.releaseMouse, true);
        document.removeEventListener("pointercancel", this.releaseMouse, true);
        document.removeEventListener("mouseup", this.releaseMouseButton, true);
        this.canvas?.removeEventListener("contextmenu", this.preventMenu);
        document.removeEventListener("pointerlockchange", this.onLockChange);
        document.removeEventListener("pointerlockerror", this.onLockError);
        document.removeEventListener("mousemove", this.handleMouseMove);
        document.removeEventListener("keydown", this.handleKeyDown);
        document.removeEventListener("keyup", this.handleKeyUp);
        window.removeEventListener("blur", this.releaseInput);
        document.removeEventListener("visibilitychange", this.onVisibility);
        this.mobileInput?.destroy();
        this.hud?.remove();
        this.cameraSphere?.destroy();
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
        delete (window as any).lingshuiGame;
    }
}
