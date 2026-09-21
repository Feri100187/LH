#!/usr/bin/env node
"use strict";

// Production input/update code + a verified-substep model. This is NOT a Bullet
// simulation: collision, gravity, rendering, and native browser input are absent.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict");
const suite = require("./testing/context.cjs").createSuite("frame-stability");
const { ts, root } = suite;
const sourceNames = ["LingshuiGame", "MobileInput", "PlayerAvatar", "PlayerCameraFollow", "FirstPersonArms", "LakeDuck", "WaterGunSystem", "PhysicsWaterQuery", "WaterShotResolver", "TrainingProgress", "TrainingRangeView", "TrainingHud", "WeaponMuzzle", "WaterShotEffects"];
const sources = Object.fromEntries(sourceNames.map(name => [name, fs.readFileSync(path.join(root, "src", name + ".ts"), "utf8")]));
const compiled = Object.fromEntries(sourceNames.map(name => [name, ts.transpileModule(sources[name], { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018, experimentalDecorators: true
} }).outputText]));
const engine = Object.fromEntries(["laya.core.js", "laya.d3.js", "laya.physics3D.js", "laya.bullet.wasm.js"].map(name => [name, suite.readEngineSource(name)]));
const configured = JSON.parse(fs.readFileSync(path.join(root, "settings/PlayerSettings.json"), "utf8")).physics3D;
const EPSILON = 1e-9;
const MODEL = "verified-substep model; no native Bullet/collision execution";
const directions = [
    { name: "Forward", suffix: "", x: 0, z: 1, keys: ["KeyW"] },
    { name: "Back", suffix: "Back", x: 0, z: -1, keys: ["KeyS"] },
    { name: "Left", suffix: "Left", x: -1, z: 0, keys: ["KeyA"] },
    { name: "Right", suffix: "Right", x: 1, z: 0, keys: ["KeyD"] },
    { name: "ForwardLeft", suffix: "ForwardLeft", x: -1, z: 1, keys: ["KeyW", "KeyA"] },
    { name: "ForwardRight", suffix: "ForwardRight", x: 1, z: 1, keys: ["KeyW", "KeyD"] },
    { name: "BackLeft", suffix: "BackLeft", x: -1, z: -1, keys: ["KeyS", "KeyA"] },
    { name: "BackRight", suffix: "BackRight", x: 1, z: -1, keys: ["KeyS", "KeyD"] }
];

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.setValue(x, y, z); }
    setValue(x, y, z) { this.x = x; this.y = y; this.z = z; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    cloneTo(other) { other.setValue(this.x, this.y, this.z); }
}
class Element {
    constructor(name) { this.name = name; this.style = {}; this.dataset = {}; this.listeners = new Map(); this.queries = new Map(); this.captured = new Set(); this.isConnected = true; }
    addEventListener(type, callback) { const list = this.listeners.get(type) || []; list.push(callback); this.listeners.set(type, list); }
    removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== callback)); }
    dispatch(type, fields = {}) {
        const event = { type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...fields };
        for (const callback of this.listeners.get(type) || []) callback(event);
        return event;
    }
    appendChild(child) { child.parentNode = this; return child; }
    remove() { this.isConnected = false; }
    setAttribute(name, value) { this[name] = String(value); }
    querySelector(selector) { if (!this.queries.has(selector)) this.queries.set(selector, this.appendChild(new Element(selector))); return this.queries.get(selector); }
    getBoundingClientRect() { return { left: 20, top: 400, width: 116, height: 116 }; }
    setPointerCapture(id) { this.captured.add(id); }
    hasPointerCapture(id) { return this.captured.has(id); }
    releasePointerCapture(id) { this.captured.delete(id); }
    focus() {}
}

// The engine contract below checks the installed Scene3D accumulator against
// this model. Horizontal displacement is held and applied once per fixed step.
function consumeSubsteps(world, heldDisplacement, position) {
    const h = world.physicsSimulation.fixedTimeStep, cap = world.physicsSimulation.maxSubSteps;
    world._physicsStepTime += world.timer.delta / 1000;
    const steps = Math.min(Math.floor(world._physicsStepTime / h), cap);
    assert.ok(steps >= 0 && Number.isFinite(steps));
    if (steps > 0) {
        position.x += heldDisplacement.x * steps;
        position.z += heldDisplacement.z * steps;
        world._physicsStepTime -= steps * h;
    }
    return steps;
}

function fixture({ h = configured.fixedTimeStep, cap = configured.maxSubSteps, touch = false } = {}) {
    const document = new Element("document"), window = new Element("window");
    document.hidden = false; document.focused = true; document.hasFocus = () => document.focused;
    document.pointerLockElement = null; document.head = new Element("head"); document.body = new Element("body");
    document.createElement = name => new Element(name);
    const viewport = new Element("viewport"); viewport.content = "width=device-width";
    document.querySelector = selector => selector === 'meta[name="viewport"]' ? viewport : null;
    const media = new Element("media"); media.matches = touch;
    window.matchMedia = () => media; window.innerWidth = 390; window.location = { search: "" };
    const canvas = new Element("canvas"), timer = { delta: 0, currTimer: 0 };
    const Laya = { Scene3D: { physicsSettings: { fixedTimeStep: h, maxSubSteps: cap } },
        Script: class {}, Vector3, Quaternion: class {}, HitResult: class {}, AnimatorController: class {},
        Matrix3x3: class { constructor() { this.elements = new Float32Array(9); } },
        regClass: () => value => value, property: () => () => {}, Browser: { mainCanvas: { source: canvas } }, timer };
    Laya.Vector3.Up = new Vector3(0, 1, 0);
    const modules = {};
    const load = name => {
        if (modules[name]) return modules[name];
        assert.ok(compiled[name], `Unconfigured production dependency ${name}`);
        const exports = modules[name] = {};
        new Function("Laya", "exports", "require", "window", "document", compiled[name])(
            Laya, exports, id => id.endsWith(".json") ? {} : load(id.replace(/^\.\//, "")), window, document);
        return exports;
    };
    const module = load("LingshuiGame"), avatarModule = load("PlayerAvatar");
    const game = new module.LingshuiGame(), avatar = new avatarModule.PlayerAvatar();
    // Real gait scaling and input cancellation remain active. Animator playback
    // is intentionally uninitialized; another suite owns its timing checks.
    game.avatar = avatar;
    game.world = { physicsSimulation: { fixedTimeStep: h, maxSubSteps: cap }, timer, _physicsStepTime: 0 };
    game.physicsStepSeconds = module.characterPhysicsStep(game.world);
    game.player = { transform: { position: new Vector3(0, 2, 0) } };
    game.previousPlayerPosition = new Vector3(0, 2, 0);
    game.camera = { transform: { position: new Vector3(0, 2.72, 0) } };
    game.firstPersonArms = { update() {}, setVisible() {}, getStatus: () => ({ visible: false }) };
    const held = new Vector3(), motorCalls = [], jumps = [];
    game.motor = { move(value) { value.cloneTo(held); motorCalls.push(value.clone()); }, jump(value) { jumps.push(value.clone()); }, isOnGround: () => true };
    game.canvas = canvas; game.hud = new Element("hud"); game.prompt = new Element("prompt");
    let nowMs = 0;
    game.monotonicNow = () => nowMs;
    document.exitPointerLock = () => { document.pointerLockElement = null; document.dispatch("pointerlockchange"); };
    game.setupInput();
    const mobile = game.mobileInput = new (load("MobileInput").MobileInput)(canvas, game.hud, {
        look: game.handleTouchLook, jump: () => { game.jumpQueued = true; }, shoot: () => { game.shootQueued = true; },
        shootChanged: () => game.syncShootHeld?.(), perspective() {}, modeChanged: game.updateInputPresentation
    });
    game.ready = true;
    const frames = [];
    const frame = (seconds, { wallSeconds = seconds, simulate3D = true } = {}) => {
        timer.delta = seconds * 1000; timer.currTimer += timer.delta; nowMs += wallSeconds * 1000;
        game.onUpdate();
        const before = game.player.transform.position.clone();
        const steps = simulate3D ? consumeSubsteps(game.world, held, game.player.transform.position) : 0;
        const entry = { seconds, wallSeconds, steps, debt: game.world._physicsStepTime,
            submitted: [held.x, held.y, held.z], distance: Math.hypot(game.player.transform.position.x - before.x, game.player.transform.position.z - before.z) };
        frames.push(entry); return entry;
    };
    const lock = () => { document.pointerLockElement = canvas; document.dispatch("pointerlockchange"); };
    const key = (code, repeat = false, type = "keydown") => document.dispatch(type, { code, repeat });
    frame(0); // Consume the real startup discard latch before beginning a timed trial.
    if (!touch) lock();
    return { game, avatar, avatarModule, module, mobile, timer, Laya, document, window, held, motorCalls, jumps, frames, frame, key, lock };
}
function planar(position) { return Math.hypot(position.x, position.z); }
function assertCleared(f) {
    assert.equal(f.game.keys.size, 0); assert.equal(f.game.jumpQueued, false); assert.equal(f.game.shootQueued, false);
    assert.equal(f.game.mouseHeld, false); assert.equal(f.game.mousePointer, null); assert.equal(f.avatar.triggerHeld, false);
    assert.equal(f.mobile.moveX, 0); assert.equal(f.mobile.moveZ, 0); assert.equal(f.mobile.running, false); assert.equal(f.mobile.shooting, false);
    assert.equal(f.game.actualSpeed, 0);
}
function numericTrial(fps, running, direction, options = {}) {
    const f = fixture(options), seconds = 2, h = f.game.physicsStepSeconds;
    f.game.yaw = .7;
    for (const key of direction.keys) f.key(key);
    if (running) f.key("ShiftLeft");
    const family = running ? "Run" : "Walk", rates = f.avatarModule.GAIT_REFERENCE_SPEEDS;
    const scale = Math.min(1, rates[family + direction.suffix] / rates[family]);
    const speed = (running ? f.game.runSpeed : f.game.walkSpeed) * scale;
    let substeps = 0;
    for (let frame = 0; frame < seconds * fps; frame++) {
        const result = f.frame(1 / fps); substeps += result.steps;
        assert.ok(Math.abs(Math.hypot(result.submitted[0], result.submitted[2]) - speed * h) < EPSILON,
            `${family}/${direction.name}/${fps} FPS must submit speed * actual h`);
    }
    const actual = planar(f.game.player.transform.position), expected = speed * seconds;
    assert.ok(Math.abs(actual - expected) <= speed * h + EPSILON, `${family}/${direction.name}/${fps} FPS distance ${actual}, expected ${expected}`);
    const angle = Math.atan2(direction.x, direction.z) + f.game.yaw;
    assert.ok(Math.abs(f.game.player.transform.position.x - Math.sin(angle) * actual) < EPSILON);
    assert.ok(Math.abs(f.game.player.transform.position.z + Math.cos(angle) * actual) < EPSILON);
    assert.ok(f.game.world._physicsStepTime <= h + EPSILON);
    return { family, direction: direction.name, fps, h, scale, speed, seconds, substeps, actual, expected, error: actual - expected, model: MODEL };
}

for (const fps of [15, 30, 60, 120, 240]) suite.test(`production_movement_distance_all_eight_directions_at_${fps}_fps`, () =>
    [false, true].flatMap(running => directions.map(direction => numericTrial(fps, running, direction))));

suite.test("changed_fixed_step_120hz_does_not_use_a_hardcoded_60_multiplier", () =>
    [15, 30, 60, 120, 240].flatMap(fps => [false, true].map(running => numericTrial(fps, running, directions[0], { h: 1 / 120, cap: 8 }))));

suite.test("real_touch_joystick_keeps_fractional_speed_range", () => {
    const f = fixture({ touch: true }), button = f.mobile.root.querySelector(".touch-stick");
    // Stick response removes a 0.12 dead zone; this pointer lies at half output.
    const fraction = .12 + .5 * .88, radius = 116 * .34;
    button.dispatch("pointerdown", { pointerId: 81, pointerType: "touch", clientX: 78, clientY: 458 - radius * fraction });
    assert.ok(Math.abs(f.mobile.moveZ - .5) < EPSILON);
    for (let i = 0; i < 120; i++) f.frame(1 / 60);
    const distance = planar(f.game.player.transform.position), expected = f.game.walkSpeed;
    assert.ok(Math.abs(distance - expected) <= f.game.walkSpeed * f.game.physicsStepSeconds + EPSILON);
    return { distance, expected, analog: f.mobile.moveZ, model: MODEL };
});

suite.test("physics_configuration_mismatch_and_invalid_clocks_fail_explicitly", () => {
    const f = fixture(), valid = f.game.world.physicsSimulation.fixedTimeStep;
    f.game.world.physicsSimulation.fixedTimeStep = valid * 2;
    assert.throws(() => f.module.characterPhysicsStep(f.game.world), /物理步配置不一致/);
    f.game.world.physicsSimulation.fixedTimeStep = valid;
    f.game.world.physicsSimulation.maxSubSteps = 0;
    assert.throws(() => f.module.characterPhysicsStep(f.game.world), /物理步配置不一致/);
    f.game.world.physicsSimulation.maxSubSteps = f.Laya.Scene3D.physicsSettings.maxSubSteps;
    f.timer.delta = NaN;
    assert.throws(() => f.module.boundCharacterPhysicsTime(f.game.world, true), /场景物理时钟/);
    f.timer.delta = 16; f.game.world._physicsStepTime = NaN;
    assert.throws(() => f.module.boundCharacterPhysicsTime(f.game.world, false), /场景物理时钟/);
});

suite.test("500ms_wall_or_engine_gap_discards_pending_input_and_catchup", () => {
    return [{ delta: .5, wall: .5 }, { delta: 1 / 60, wall: .5 }, { delta: .5, wall: 1 / 60 }].map(gap => {
        const f = fixture(); f.key("KeyW"); f.frame(1 / 60);
        const before = f.game.player.transform.position.clone();
        f.key("Space"); f.key("KeyF"); f.game.mouseHeld = true; f.game.mousePointer = 8;
        f.game.world._physicsStepTime = 2 * f.game.physicsStepSeconds;
        const stopped = f.frame(gap.delta, { wallSeconds: gap.wall });
        assert.equal(stopped.steps, 0); assertCleared(f); assert.equal(f.jumps.length, 0);
        assert.equal(f.game.lastResetReason, "long-frame"); assert.equal(f.game.world._physicsStepTime, 0);
        for (let i = 0; i < 30; i++) f.frame(1 / 60);
        assert.deepEqual(f.game.player.transform.position, before);
        f.key("KeyW");
        const resumed = Array.from({ length: 30 }, () => f.frame(1 / 60));
        assert.ok(resumed.every(frame => frame.steps <= 1));
        return { ...gap, droppedSeconds: f.game.physicsDroppedSeconds, resumedMaxSubsteps: Math.max(...resumed.map(frame => frame.steps)), model: MODEL };
    });
});

suite.test("blur_resume_clears_motion_and_os_repeat_cannot_rearm", () => {
    const f = fixture(); f.key("KeyW"); f.key("ShiftLeft"); f.frame(1 / 60);
    const before = f.game.player.transform.position.clone();
    f.document.focused = false; f.window.dispatch("blur"); assertCleared(f);
    assert.equal(f.game.hud.dataset.playerStatus && JSON.parse(f.game.hud.dataset.playerStatus).inputResetReason, "blur");
    f.frame(1 / 60); f.document.focused = true;
    for (const key of ["KeyW", "ShiftLeft", "Space", "KeyF"]) f.key(key, true);
    for (let i = 0; i < 12; i++) f.frame(1 / 60);
    assertCleared(f); assert.deepEqual(f.game.player.transform.position, before); assert.equal(f.jumps.length, 0);
    f.key("KeyW", false, "keyup"); f.key("KeyW"); f.frame(1 / 60);
    assert.ok(planar(f.game.player.transform.position) > planar(before));
    return { repeatedKeysAccepted: 0, freshKeyPressMoves: true, model: MODEL };
});

suite.test("hidden_scene_skip_and_visible_resume_replace_the_discard_latch", () => {
    const f = fixture(); f.key("KeyW"); f.frame(1 / 60);
    const before = f.game.player.transform.position.clone();
    f.document.hidden = true; f.document.dispatch("visibilitychange");
    f.frame(.1, { simulate3D: false });
    assert.ok(f.game.world._physicsStepTime < 0); // The real hidden path does not run Scene3D.
    f.document.hidden = false; f.document.dispatch("visibilitychange");
    const resume = f.frame(1 / 120);
    assert.equal(resume.steps, 0); assert.equal(f.game.world._physicsStepTime, 0); assertCleared(f);
    for (let i = 0; i < 20; i++) f.frame(1 / 120);
    assert.deepEqual(f.game.player.transform.position, before);
    return { resumedDebt: resume.debt, resumedSubsteps: 0, model: MODEL };
});

suite.test("Escape_in_touch_mode_clears_independent_pointers_and_motion", () => {
    const f = fixture({ touch: true });
    f.mobile.root.querySelector(".touch-stick").dispatch("pointerdown", { pointerId: 11, pointerType: "touch", clientX: 78, clientY: 400 });
    f.mobile.root.querySelector(".touch-run").dispatch("pointerdown", { pointerId: 12, pointerType: "touch" });
    const shoot = f.mobile.root.querySelector(".touch-shoot");
    for (const pointerId of [13, 14]) shoot.dispatch("pointerdown", { pointerId, pointerType: "touch" });
    f.frame(1 / 60); const before = f.game.player.transform.position.clone();
    assert.equal(f.mobile.shootPointers.size, 2); assert.ok(f.mobile.moveZ > 0);
    f.key("Escape"); assertCleared(f); assert.equal(f.mobile.captures.size, 0);
    assert.equal(f.game.lastResetReason, "escape"); assert.equal(shoot.dataset.pressed, "false");
    for (let i = 0; i < 20; i++) f.frame(1 / 60);
    assert.deepEqual(f.game.player.transform.position, before);
    return { activePointersAfterEscape: f.mobile.captures.size, retainedTouchMode: f.mobile.enabled, model: MODEL };
});

suite.test("sustained_10fps_debt_is_bounded_and_recovery_has_no_extended_catchup", () => {
    const f = fixture(), h = f.game.physicsStepSeconds; f.key("KeyW"); f.key("ShiftLeft");
    const slow = Array.from({ length: 50 }, () => f.frame(.1));
    assert.ok(slow.every(frame => frame.debt <= h + EPSILON && frame.steps <= configured.maxSubSteps));
    assert.ok(f.game.physicsDroppedSeconds > 1, "Load beyond the budget must be recorded as dropped time");
    const before = f.game.player.transform.position.clone();
    const recovered = Array.from({ length: 60 }, () => f.frame(1 / 60));
    const steps = recovered.reduce((sum, frame) => sum + frame.steps, 0);
    const distance = Math.hypot(f.game.player.transform.position.x - before.x, f.game.player.transform.position.z - before.z);
    assert.ok(steps <= 61); assert.ok(recovered.slice(1).every(frame => frame.steps <= 1));
    assert.ok(Math.abs(distance - f.game.runSpeed) <= f.game.runSpeed * h + EPSILON);
    return { lowFpsMaxDebt: Math.max(...slow.map(frame => frame.debt)), droppedSeconds: f.game.physicsDroppedSeconds,
        recoverySubsteps: steps, recoveryDistance: distance, expectedRecoveryDistance: f.game.runSpeed, model: MODEL };
});

function dependencies(names) {
    const missing = names.filter(name => !engine[name].available);
    return { available: !missing.length, reason: missing.map(name => engine[name].reason).join("; ") };
}
function classMethod(source, name, method) {
    const ast = ts.createSourceFile("installed-engine.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let found;
    const visit = node => {
        if (ts.isClassDeclaration(node) && node.name?.text === name)
            found = node.members.find(member => member.name?.getText(ast) === method)?.body?.getText(ast);
        if (!found) ts.forEachChild(node, visit);
    };
    visit(ast); assert.ok(found, `Installed ${name}.${method} is missing`); return found;
}

suite.test("installed_move_forwards_to_persistent_bullet_walk_direction", () => {
    const frontend = classMethod(engine["laya.physics3D.js"].source, "CharacterController", "move");
    const backend = classMethod(engine["laya.bullet.wasm.js"].source, "btCharacterCollider", "move");
    assert.match(frontend, /this\._collider\.move\(movement\)/);
    assert.match(backend, /btVector3_setValue\(btMovement, disp\.x, disp\.y, disp\.z\)/);
    assert.match(backend, /btKinematicCharacterController_setWalkDirection\(this\._btKinematicCharacter, btMovement\)/);
    assert.doesNotMatch(frontend + backend, /delta|elapsedTime|fixedTimeStep/);
    return { frontend: "CharacterController.move", backend: "btCharacterCollider.move", semantics: "persistent displacement per Bullet substep" };
}, { kind: "engine_contract", dependency: dependencies(["laya.physics3D.js", "laya.bullet.wasm.js"]) });

suite.test("installed_scene_accumulator_agrees_with_the_verified_substep_model", () => {
    const source = engine["laya.d3.js"].source, body = classMethod(source, "Scene3D", "_update");
    assert.match(body, /this\._physicsStepTime \+= delta/);
    assert.match(body, /Math\.floor\(this\._physicsStepTime \/ Scene3D\.physicsSettings\.fixedTimeStep\)/);
    assert.match(body, /physicsManager\.update\(steps \* Scene3D\.physicsSettings\.fixedTimeStep\)/);
    assert.equal((source.match(/this\._physicsStepTime \+= delta/g) || []).length, 2, "Normal and Profiler paths must both be accounted for");
    const settings = { fixedTimeStep: configured.fixedTimeStep, maxSubSteps: configured.maxSubSteps };
    const update = new Function("Laya", "Scene3D", "RenderContext3D", `return function() ${body}`)(
        { LayaEnv: { isPlaying: true }, ILaya: { Laya3D: { enablePhysics: true } }, Stat: { enablePhysicsUpdate: true } },
        { physicsSettings: settings }, { _instance: {} });
    const order = [], elapsed = [];
    const scene = { timer: { delta: 0 }, _time: 0, _physicsStepTime: 0, _shaderValues: { setNumber() {} },
        _physicsManager: { update(seconds) { elapsed.push(seconds); order.push("physics"); } },
        _componentDriver: Object.fromEntries(["callStart", "callUpdate", "callLateUpdate", "callDestroy", "callAfterSceneUpdate"].map(name => [name, () => order.push(name)])),
        _volumeManager: { needreCaculateAllRenderObjects: () => false, handleMotionlist() {} }, componentElementMap: new Map(),
        _sceneRenderManager: { renderUpdate() {} }, skyRenderer: { renderUpdate() {} }, _renderByEditor: true };
    const modeled = { physicsSimulation: settings, timer: { delta: 0 }, _physicsStepTime: 0 }, pos = new Vector3();
    const samples = [1 / 240, 1 / 120, 1 / 60, 1 / 30, 1 / 15, .1, .5, 1 / 60, 1 / 240];
    for (const delta of samples) {
        scene.timer.delta = modeled.timer.delta = delta * 1000;
        const priorCount = elapsed.length; order.length = 0; update.call(scene);
        const steps = consumeSubsteps(modeled, new Vector3(1, 0, 0), pos);
        assert.ok(Math.abs(scene._physicsStepTime - modeled._physicsStepTime) < EPSILON);
        assert.equal(elapsed.length - priorCount, steps > 0 ? 1 : 0);
        if (steps > 0) {
            assert.ok(Math.abs(elapsed.at(-1) - steps * settings.fixedTimeStep) < EPSILON);
            assert.ok(order.indexOf("physics") < order.indexOf("callUpdate"));
        }
        assert.ok(order.indexOf("callAfterSceneUpdate") > order.indexOf("callLateUpdate"));
    }
    return { samples, actualInstalledSceneMethodExecuted: true, physicsManager: "recording stub", model: MODEL };
}, { kind: "engine_contract", dependency: dependencies(["laya.d3.js"]) });

suite.test("installed_2d_root_callback_precedes_scene_physics_for_the_adapter", () => {
    const core = engine["laya.core.js"].source, render = classMethod(core, "Stage", "render");
    const enabled = render.slice(render.indexOf("if (this.renderingEnabled)"));
    assert.ok(enabled.indexOf("this._runComponents()") >= 0);
    assert.ok(enabled.indexOf("this._runComponents()") < enabled.indexOf("this._scene3Ds[i]._update()"));
    assert.ok(enabled.indexOf("this._scene3Ds[i]._update()") < enabled.lastIndexOf("this._updateTimers(timestamp)"));
    assert.match(core, /this\._driver = .*owner\._scene.*_componentDriver\) \|\| ILaya\.stage\._componentDriver/);
    const gameId = JSON.parse(fs.readFileSync(path.join(root, "src/LingshuiGame.ts.meta"), "utf8")).uuid;
    for (const name of ["Scene.ls", "LingshuiGame.ls"]) {
        const scene = JSON.parse(fs.readFileSync(path.join(root, "assets", name), "utf8"));
        assert.equal(scene._$type, "Scene"); assert.ok(scene._$comp.some(component => component._$type === gameId));
    }
    return { rootScript: gameId, beforePhysics: true, timerUpdateOccursAfterScenes: true };
}, { kind: "engine_contract", dependency: dependencies(["laya.core.js"]) });

suite.finish({ model: MODEL, configured_physics: configured,
    production_sources: Object.fromEntries(sourceNames.map(name => [name, crypto.createHash("sha256").update(sources[name]).digest("hex")])),
    not_verified: ["Native Bullet collisions/gravity and actual 15/30/60/high-FPS traversal", "Real browser event delivery, rendering and pause/resume behavior"] });
