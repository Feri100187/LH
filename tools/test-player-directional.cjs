#!/usr/bin/env node
"use strict";

// Production classes are transpiled unchanged. Small scene/animator doubles expose their decisions.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const suite = require("./testing/context.cjs").createSuite("player-directional");
const root = suite.root, ts = suite.ts;
const engine = suite.readEngineSource("laya.d3.js");
const names = ["PlayerAvatar", "LingshuiGame", "FirstPersonArms", "PlayerCameraFollow", "MobileInput", "LakeDuck", "WaterGunSystem", "PhysicsWaterQuery", "WaterShotResolver", "TrainingProgress", "TrainingRangeView", "TrainingHud", "WeaponMuzzle", "WaterShotEffects"];
const sources = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(root, "src", name + ".ts"), "utf8")]));

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.setValue(x, y, z); }
    setValue(x, y, z) { this.x = x; this.y = y; this.z = z; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    cloneTo(other) { other.setValue(this.x, this.y, this.z); }
    static distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
    static lerp(a, b, t, out) { out.setValue(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
}
Vector3.Up = new Vector3(0, 1, 0);
function cross(a, b) { return new Vector3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
function normalized(v) { const n = Math.hypot(v.x, v.y, v.z); return new Vector3(v.x / n, v.y / n, v.z / n); }
class Transform {
    constructor(owner) {
        this.owner = owner; this.local = new Vector3(); this.euler = new Vector3();
        this.right = new Vector3(1, 0, 0); this.up = new Vector3(0, 1, 0); this.back = new Vector3(0, 0, 1);
    }
    get localPosition() { return this.local.clone(); }
    set localPosition(v) { this.local = v.clone(); }
    get localRotationEuler() { return this.euler.clone(); }
    set localRotationEuler(v) { this.euler = v.clone(); }
    get position() {
        const parent = this.owner.parent?.transform;
        if (!parent) return this.local.clone();
        const p = parent.position, v = this.local;
        return new Vector3(p.x + parent.right.x * v.x + parent.up.x * v.y + parent.back.x * v.z,
            p.y + parent.right.y * v.x + parent.up.y * v.y + parent.back.y * v.z,
            p.z + parent.right.z * v.x + parent.up.z * v.y + parent.back.z * v.z);
    }
    set position(v) {
        const p = this.owner.parent?.transform.position || new Vector3();
        this.local = new Vector3(v.x - p.x, v.y - p.y, v.z - p.z);
    }
    lookAt(target, up) {
        const p = this.position, forward = normalized(new Vector3(target.x - p.x, target.y - p.y, target.z - p.z));
        this.right = normalized(cross(forward, up)); this.up = cross(this.right, forward);
        this.back = new Vector3(-forward.x, -forward.y, -forward.z);
    }
}
class Node {
    constructor(name = "") { this.name = name; this.children = []; this.components = []; this.parent = null; this.active = true; this.transform = new Transform(this); }
    addChild(node) { node.parent = this; this.children.push(node); return node; }
    get numChildren() { return this.children.length; }
    getChildAt(i) { return this.children[i]; }
    getChildByName(name) { return this.children.find(node => node.name === name); }
    getComponent(Type) { return this.components.find(component => component instanceof Type) || null; }
    addComponent(Type) { const component = new Type(); component.owner = this; this.components.push(component); return component; }
}
class MeshRenderer { constructor() { this.enabled = true; this.castShadow = true; this.receiveShadow = true; } }
class SkinnedMeshRenderer extends MeshRenderer {}
class Layer {
    constructor(names) {
        this.states = names.map(name => ({ name, speed: 1, clip: { islooping: false, duration: () => name === "Shoot" ? .2 : 1 },
            transitions: [], soloTransitions: [] }));
        this.current = this.states[0]; this.normalizedTime = 0; this.defaultWeight = 1;
        for (const state of this.states) state.transitions = this.states.filter(dest => dest !== state)
            .map(destState => ({ destState, transstartoffset: 0 }));
    }
    getAnimatorState(name) { return this.states.find(state => state.name === name); }
    getCurrentPlayState() { return { animatorState: this.current, currentState: this.current, normalizedTime: this.normalizedTime }; }
}
class Animator {
    constructor(layers = []) { this.layers = layers; this.plays = []; this.crosses = []; this.parameters = []; }
    getControllerLayer(i = 0) { return this.layers[i]; }
    play(name, layer = 0, phase = 0) {
        this.plays.push({ name, layer, phase }); this.layers[layer].current = this.layers[layer].getAnimatorState(name);
        this.layers[layer].normalizedTime = phase;
    }
    crossFade(name, duration, layer = 0, phase = 0) {
        this.crosses.push({ name, duration, layer, phase }); this.layers[layer].current = this.layers[layer].getAnimatorState(name);
        this.layers[layer].normalizedTime = phase;
    }
    setParamsBool(name, value) { this.parameters.push({ name, value }); }
    setParamsNumber(name, value) {
        const layer = this.layers[0], target = PlayerMotion[value];
        const transition = [...layer.current.transitions, ...layer.current.soloTransitions].find(t => t.destState.name === target);
        this.parameters.push({ name, value, transitionPhaseAtSet: transition?.transstartoffset });
        if (name === "Motion" && transition) {
            layer.current = transition.destState; layer.normalizedTime = transition.transstartoffset;
        }
    }
}
Animator.CULLINGMODE_ALWAYSANIMATE = 0;
const document = { hidden: false, hasFocus: () => true, pointerLockElement: null };
const window = { matchMedia: () => ({ matches: false }), location: { search: "" } };
const Laya = {
    Scene3D: { physicsSettings: { fixedTimeStep: 1 / 60, maxSubSteps: 4 } },
    Script: class {}, Sprite3D: Node, Node, MeshRenderer, SkinnedMeshRenderer, Animator, Vector3,
    Quaternion: class {}, HitResult: class {}, Matrix3x3: class { constructor() { this.elements = new Float32Array(9); } },
    Bounds: class { constructor(min, max) { this.min = min; this.max = max; } }, AnimatorController: class {},
    regClass: () => cls => cls, property: () => () => {}, timer: { delta: 1000 / 60, currTimer: 0 }
};
const modules = {};
function load(name) {
    if (modules[name]) return modules[name];
    const exports = modules[name] = {};
    const js = ts.transpileModule(sources[name], { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018, experimentalDecorators: true
    }}).outputText;
    new Function("Laya", "exports", "require", "window", "document", "console", js)(Laya, exports,
        id => id.endsWith(".json") ? {} : load(id.replace(/^\.\//, "")), window, document, { ...console, info() {} });
    return exports;
}
const { PlayerAvatar, PlayerMotion, GAIT_REFERENCE_SPEEDS, movementSector } = load("PlayerAvatar");
const { LingshuiGame } = load("LingshuiGame");
const { FirstPersonArms } = load("FirstPersonArms");
const { PlayerCameraFollow } = load("PlayerCameraFollow");

function avatarFixture() {
    const node = new Node("PlayerAvatar");
    const base = new Layer(Object.values(PlayerMotion).filter(value => typeof value === "string"));
    const upper = new Layer(["UpperIdle", "Shoot"]);
    const animator = new Animator([base, upper]); node.components.push(animator);
    for (const name of ["Head sculpted", "Body torso", "Legs", "Hands and watergun"]) {
        node.addChild(new Node(name)).components.push(new SkinnedMeshRenderer());
    }
    const avatar = new PlayerAvatar(); avatar.owner = node; avatar.controller = new Laya.AnimatorController();
    avatar.initialize(); animator.parameters.length = 0; animator.plays.length = 0;
    return { avatar, animator, base, upper, node };
}
function gameFixture() {
    const f = avatarFixture(), game = new LingshuiGame(), world = new Node("World");
    const player = world.addChild(new Node("PlayerCapsule")); player.transform.position = new Vector3(10, 2, 20); player.addChild(f.node);
    const camera = world.addChild(new Node("PlayerCamera"));
    const mount = camera.addChild(new Node("FirstPersonArms"));
    const model = mount.addChild(new Node("FPSRig"));
    const fpsAnimator = new Animator([new Layer(["Idle", "Shoot"])]); model.components.push(fpsAnimator);
    for (let i = 0; i < 15; i++) model.addChild(new Node(`FPS_mesh_${i}`)).components.push(new SkinnedMeshRenderer());
    const arms = new FirstPersonArms(mount);
    Object.assign(game, { world, player, camera, avatar: f.avatar, firstPersonArms: arms,
        body: new MeshRenderer(), motor: { move() {}, jump() {}, isOnGround: () => true },
        cameraSphere: { shape: {} }, hud: { dataset: {} }, ready: true,
        mobileInput: { enabled: false, running: false, shooting: false, setPerspective() {}, getStatus() {}, reset() {} },
        canvas: {}, locked: true });
    world.physicsSimulation = { shapeCast: () => false, fixedTimeStep: 1 / 60, maxSubSteps: 4 };
    world.timer = Laya.timer; world._physicsStepTime = 0;
    game.physicsStepSeconds = load("LingshuiGame").characterPhysicsStep(world);
    game.discardPhysicsFrame = false;
    game.monotonicNow = () => Laya.timer.currTimer;
    document.pointerLockElement = game.canvas;
    player.transform.position.cloneTo(game.previousPlayerPosition);
    const follow = new PlayerCameraFollow(); follow.owner = camera; follow.follow = () => game.followAfterPhysics(); game.cameraFollow = follow;
    const tick = (physics, seconds = 1 / 60) => {
        Laya.timer.delta = seconds * 1000; Laya.timer.currTimer += Laya.timer.delta;
        game.onUpdate(); if (physics) physics(); follow.onAfterSceneUpdate();
    };
    follow.onAfterSceneUpdate();
    return { ...f, game, world, player, camera, mount, model, arms, fpsAnimator, follow, tick };
}
function input(right, forward, yaw = 0, running = false, extra = {}) {
    const length = Math.hypot(right, forward) || 1;
    const r = right / length, f = forward / length;
    return { speed: running ? 3 : 1.2, moving: !!(right || forward), running, grounded: true, jumped: false, yaw, pitch: 0,
        moveX: r * Math.cos(yaw) + f * Math.sin(yaw), moveZ: r * Math.sin(yaw) - f * Math.cos(yaw), ...extra };
}
const angularError = (actual, expected) => expected + Math.round((actual - expected) / (2 * Math.PI)) * 2 * Math.PI - actual;
const vector = v => [v.x, v.y, v.z];
function near(a, b, tolerance = 1e-7) { assert.ok(Math.abs(a - b) <= tolerance, `${a} should equal ${b}`); }
const tests = suite.tests;
function test(name, body) {
    suite.test(name, body, name === "engine_after_scene_hook_runs_after_physics_and_animation_before_renderers"
        ? { kind: "engine_contract", dependency: engine }
        : name === "scene_asset_parents_FPS_mount_under_PlayerCamera" ? { kind: "asset_contract" } : {});
}

const directions = [
    { keys: "W", right: 0, forward: 1, suffix: "" },
    { keys: "S", right: 0, forward: -1, suffix: "Back" },
    { keys: "A", right: -1, forward: 0, suffix: "Left" },
    { keys: "D", right: 1, forward: 0, suffix: "Right" },
    { keys: "W+A", right: -1, forward: 1, suffix: "ForwardLeft" },
    { keys: "W+D", right: 1, forward: 1, suffix: "ForwardRight" },
    { keys: "S+A", right: -1, forward: -1, suffix: "BackLeft" },
    { keys: "S+D", right: 1, forward: -1, suffix: "BackRight" }
];
for (const running of [false, true]) for (const yaw of [0, Math.PI / 2, -Math.PI / 3, 9 * Math.PI + .2]) {
    test(`${running ? "run" : "walk"}_eight_directions_yaw_${yaw.toFixed(3)}`, () => {
        const results = [];
        for (const d of directions) {
            const f = avatarFixture(); f.avatar.step(1 / 60, input(d.right, d.forward, yaw, running));
            const expected = (running ? "Run" : "Walk") + d.suffix;
            assert.equal(PlayerMotion[f.avatar.motion], expected);
            near(angularError(f.avatar.heading, Math.PI - yaw), 0);
            results.push({ keys: d.keys, state: expected, body_heading: f.avatar.heading });
        }
        return { yaw, directions: results };
    });
}

for (const running of [false, true]) for (const yaw of [0, Math.PI / 2]) {
    test(`game_keyboard_eight_directions_${running ? "run" : "walk"}_yaw_${yaw.toFixed(3)}`, () => {
        const outcomes = [];
        for (const d of directions) {
            const f = gameFixture(); f.game.yaw = yaw;
            for (const key of d.keys.split("+")) f.game.keys.add("Key" + key);
            if (running) f.game.keys.add("ShiftLeft");
            const expectedVector = input(d.right, d.forward, yaw, running);
            const p = f.player.transform.position;
            p.x += expectedVector.moveX * .04; p.z += expectedVector.moveZ * .04;
            f.player.transform.position = p;
            f.tick();
            const expectedState = (running ? "Run" : "Walk") + d.suffix;
            assert.equal(PlayerMotion[f.avatar.motion], expectedState);
            const move = f.game.move, length = Math.hypot(move.x, move.z);
            near(move.x / length, expectedVector.moveX); near(move.z / length, expectedVector.moveZ);
            near(angularError(f.avatar.heading, Math.PI - yaw), 0);
            outcomes.push({ keys: d.keys, state: expectedState, normalized_world_move: [move.x / length, move.z / length] });
        }
        return { yaw, directions: outcomes };
    });
}

test("body_heading_follows_view_immediately_for_multiturn_yaw", () => {
    const f = avatarFixture(), outcomes = [];
    for (const yaw of [-200 * Math.PI - .23, -4 * Math.PI + .3, .7, 8 * Math.PI - .2, 200 * Math.PI + .9]) {
        f.avatar.step(1 / 120, input(-1, -1, yaw, true));
        near(angularError(f.avatar.heading, Math.PI - yaw), 0);
        near(f.node.transform.localRotationEuler.y * Math.PI / 180, f.avatar.heading);
        outcomes.push({ yaw, heading: f.avatar.heading });
    }
    return outcomes;
});

test("sector_hysteresis_holds_and_releases_both_boundaries", () => {
    const sectorAt = (degrees, previous) => movementSector(Math.sin(degrees * Math.PI / 180), Math.cos(degrees * Math.PI / 180), previous);
    assert.equal(sectorAt(24, 0), 0); assert.equal(sectorAt(28, 0), 1);
    assert.equal(sectorAt(21, 1), 1); assert.equal(sectorAt(18, 1), 0);
    assert.equal(sectorAt(-24, 0), 0); assert.equal(sectorAt(-28, 0), 7);
    assert.equal(sectorAt(-21, 7), 7); assert.equal(sectorAt(-18, 7), 0);
    assert.equal(movementSector(0, 0, 6), 6);
    return { boundary_chatter_rejected: true, intentional_direction_change_accepted: true };
});

test("side_and_backward_speed_scales_match_authored_gaits", () => {
    const outcomes = [];
    for (const running of [false, true]) for (const d of directions) {
        const f = avatarFixture(), family = running ? "Run" : "Walk";
        const scale = f.avatar.getMovementSpeedScale(d.right, d.forward, running);
        near(scale, GAIT_REFERENCE_SPEEDS[family + d.suffix] / GAIT_REFERENCE_SPEEDS[family]);
        assert.ok(scale > 0 && scale <= 1);
        outcomes.push({ state: family + d.suffix, scale });
    }
    return outcomes;
});

for (const scenario of [
    { from: "Walk", to: "WalkLeft", phase: 3.42, right: -1, forward: 0, running: false },
    { from: "WalkForwardRight", to: "RunBack", phase: -.25, right: 0, forward: -1, running: true }
]) {
    test(`native_direction_transition_keeps_phase_${scenario.from}_to_${scenario.to}`, () => {
        const f = avatarFixture(); f.avatar.motion = PlayerMotion[scenario.from];
        f.base.current = f.base.getAnimatorState(scenario.from); f.base.normalizedTime = scenario.phase;
        const dest = f.base.getAnimatorState(scenario.to);
        // Runtime normal transitions are separate from soloTransitions in Laya's parser.
        f.base.current.soloTransitions.push({ destState: dest, transstartoffset: 0 });
        f.avatar.step(1 / 60, input(scenario.right, scenario.forward, 0, scenario.running));
        const expected = ((scenario.phase % 1) + 1) % 1;
        const normal = f.base.states.flatMap(s => s.transitions).filter(t => t.destState === dest);
        assert.ok(normal.length > 0); normal.forEach(t => near(t.transstartoffset, expected));
        f.base.states.flatMap(s => s.soloTransitions).filter(t => t.destState === dest).forEach(t => near(t.transstartoffset, expected));
        const request = f.animator.parameters.find(p => p.name === "Motion");
        near(request.transitionPhaseAtSet, expected); assert.equal(f.animator.crosses.length, 0);
        return { expected_phase: expected, normal_transitions_updated: normal.length, explicit_crossfades: 0 };
    });
}

test("held_direction_does_not_retrigger_motion_transition", () => {
    const f = avatarFixture();
    for (let i = 0; i < 60; i++) f.avatar.step(1 / 60, input(1, 0, .4, true));
    assert.equal(f.animator.parameters.filter(p => p.name === "Motion").length, 1);
    assert.equal(PlayerMotion[f.avatar.motion], "RunRight");
});

test("FPS_hides_entire_world_body_and_TPS_restores_it", () => {
    const f = avatarFixture(); assert.ok(f.avatar.renderers.length >= 4);
    assert.ok(f.avatar.renderers.every(p => !p.renderer.enabled), "Initialization in FPS must hide torso and legs too");
    f.avatar.setVisibility(true); assert.ok(f.avatar.renderers.every(p => p.renderer.enabled));
    f.avatar.setVisibility(true, true); assert.ok(f.avatar.renderers.every(p => !p.renderer.enabled));
    f.avatar.setVisibility(true, false); assert.ok(f.avatar.renderers.every(p => p.renderer.enabled));
    f.avatar.setVisibility(false); assert.ok(f.avatar.renderers.every(p => !p.renderer.enabled));
    return { all_world_renderers_hidden_in_FPS: true, restored_in_TPS: true };
});

test("camera_reads_post_physics_position_through_real_follow_callback", () => {
    const f = gameFixture();
    const before = f.camera.transform.position;
    Laya.timer.delta = 1000 / 60; f.game.onUpdate();
    assert.deepEqual(vector(f.camera.transform.position), vector(before), "Input update must not move the camera before physics");
    const latest = new Vector3(10.08, 2.21, 19.93); f.player.transform.position = latest;
    f.follow.onAfterSceneUpdate();
    const camera = f.camera.transform.position;
    near(camera.x, latest.x); near(camera.y, latest.y + .72); near(camera.z, latest.z);
    return { post_physics_player: vector(latest), camera: vector(camera), offset: [camera.x - latest.x, camera.y - latest.y, camera.z - latest.z] };
});

test("engine_after_scene_hook_runs_after_physics_and_animation_before_renderers", () => {
    const source = engine.source;
    const begin = source.indexOf("_update() {\n            var delta = this.timer.delta");
    assert.ok(begin >= 0, "Installed Scene3D update must be located");
    const section = source.slice(begin, source.indexOf("_binarySearchIndexInCameraPool", begin));
    const order = ["physicsManager.update(", "this._componentDriver.callUpdate()", "value.update(delta)",
        "this._componentDriver.callAfterSceneUpdate()", "this._sceneRenderManager.renderUpdate()"].map(token => section.indexOf(token));
    assert.ok(order.every(value => value >= 0)); assert.ok(order.every((value, i) => !i || value > order[i - 1]));
    return { order: ["physics", "3D scripts", "animation managers", "afterSceneUpdate", "renderers"] };
});

test("scene_asset_parents_FPS_mount_under_PlayerCamera", () => {
    const scene = JSON.parse(fs.readFileSync(path.join(root, "assets/LingshuiGame.ls"), "utf8"));
    const find = node => node.name === "PlayerCamera" ? node : (node._$child || []).map(find).find(Boolean);
    const camera = find(scene); assert.ok(camera);
    assert.ok((camera._$child || []).some(child => child.name === "FirstPersonArms"));
    return { parent: "PlayerCamera", child: "FirstPersonArms" };
});

test("FPS_bob_is_local_and_never_moves_camera_or_duplicates_world_motion", () => {
    const f = gameFixture(); assert.equal(f.mount.parent, f.camera);
    const cameraBefore = f.camera.transform.position;
    for (let i = 0; i < 60; i++) f.arms.update(1 / 60, 4, true, false, 0);
    assert.deepEqual(vector(f.camera.transform.position), vector(cameraBefore));
    assert.ok(f.arms.meshes.every(renderer => !renderer.castShadow));
    const records = [];
    for (const position of [new Vector3(-30, 4, 40), new Vector3(150, 5, -120), new Vector3(15, 3, -15)]) {
        f.player.transform.position = position; f.game.yaw += .8; f.game.pitch = .3; f.follow.onAfterSceneUpdate();
        const local = f.mount.transform.localPosition, mounted = f.mount.transform.position, camera = f.camera.transform.position;
        assert.ok(Math.abs(local.x) <= .0041 && Math.abs(local.y) <= .039 && local.z === 0);
        assert.ok(Vector3.distance(mounted, camera) < .05, "Mount displacement must remain tiny even at distant world coordinates");
        records.push({ player: vector(position), local_mount: vector(local), world_camera_distance: Vector3.distance(mounted, camera) });
    }
    return { meshes: f.arms.meshes.length, positions: records };
});

test("switching_TPS_FPS_preserves_continuous_shooting_and_phase", () => {
    const f = gameFixture(); f.game.keys.add("KeyF"); f.game.shootQueued = true;
    for (let i = 0; i < 17; i++) f.tick();
    assert.equal(f.avatar.isShooting, true); assert.equal(f.arms.shooting, true);
    const beforeTPS = f.avatar.fireCount; f.game.setPerspective(true); f.follow.onAfterSceneUpdate();
    assert.equal(f.mount.active, false); assert.equal(f.avatar.fireCount, beforeTPS);
    assert.ok(f.avatar.renderers.every(p => p.renderer.enabled));
    for (let i = 0; i < 11; i++) f.tick();
    const beforeFPS = f.avatar.fireCount, phase = f.avatar.shotPhase % 1;
    f.game.setPerspective(false); f.follow.onAfterSceneUpdate();
    assert.equal(f.mount.active, true); assert.equal(f.avatar.fireCount, beforeFPS);
    assert.ok(f.avatar.renderers.every(p => !p.renderer.enabled));
    const played = f.fpsAnimator.plays[f.fpsAnimator.plays.length - 1]; assert.equal(played.name, "Shoot"); near(played.phase, phase);
    for (let i = 0; i < 32; i++) f.tick();
    assert.ok(f.avatar.fireCount >= 5); const shots = f.avatar.fireCount;
    f.game.keys.delete("KeyF"); for (let i = 0; i < 20; i++) f.tick();
    assert.equal(f.avatar.fireCount, shots); assert.equal(f.avatar.isShooting, false); assert.equal(f.arms.shooting, false);
    return { shots_while_held: shots, resumed_FPS_phase: played.phase, stopped_after_release: true };
});

suite.finish({
    scope: "Real production direction, visibility, FPS mount and post-physics helper methods; scene/Animator doubles and installed engine ordering evidence; no live UI or deformation rendering",
    source_sha256: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name + ".ts", crypto.createHash("sha256").update(source).digest("hex")]))
});
