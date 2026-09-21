#!/usr/bin/env node
"use strict";

// Execute the production input classes and PlayerAvatar firing logic without a browser or renderer.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const suite = require("./testing/context.cjs").createSuite("player-input");
const root = suite.root, ts = suite.ts;
const engine = suite.readEngineSource("laya.core.js");
const enginePath = engine.path || null, engineSource = engine.source || "";
const downMatch = engineSource.match(/canvas\.addEventListener\("pointerdown", ev => \{([\s\S]*?)\n\s*\}\);/);
const upMatch = engineSource.match(/canvas\.addEventListener\("pointerup", ev => \{([\s\S]*?)\n\s*\}, true\);/);
const downBody = downMatch?.[1] || "", upBody = upMatch?.[1] || "";
const sources = Object.fromEntries(["MobileInput", "LingshuiGame", "PlayerAvatar", "FirstPersonArms", "PlayerCameraFollow", "LakeDuck", "WaterGunSystem", "PhysicsWaterQuery", "WaterShotResolver", "TrainingProgress", "TrainingRangeView", "TrainingHud", "WeaponMuzzle", "WaterShotEffects"].map(name =>
    [name, fs.readFileSync(path.join(root, "src", name + ".ts"), "utf8")]));

class Target {
    constructor(env, name) { this.env = env; this.name = name; this.listeners = new Map(); this.parentNode = null; }
    addEventListener(type, callback, options = false) {
        const capture = options === true || !!options.capture;
        const entries = this.listeners.get(type) || [];
        entries.push({ callback, capture }); this.listeners.set(type, entries);
    }
    removeEventListener(type, callback, options = false) {
        const capture = options === true || !!options.capture;
        this.listeners.set(type, (this.listeners.get(type) || []).filter(x => x.callback !== callback || x.capture !== capture));
    }
}

class Element extends Target {
    constructor(env, name) {
        super(env, name); this.style = {}; this.dataset = {}; this.attrs = {}; this.children = [];
        this.queries = new Map(); this.innerHTML = ""; this.content = "width=device-width";
        this.captureCalls = 0; this.releaseCalls = 0;
    }
    get isConnected() { let node = this; while (node) { if (node === this.env.document) return true; node = node.parentNode; } return false; }
    appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    querySelector(selector) {
        if (!this.queries.has(selector)) { const child = new Element(this.env, selector); this.queries.set(selector, child); this.appendChild(child); }
        return this.queries.get(selector);
    }
    getBoundingClientRect() { return { left: 20, top: 400, width: 116, height: 116 }; }
    focus() { this.env.document.focused = true; }
    requestPointerLock() { this.env.lockRequests++; return Promise.resolve(); }
    setPointerCapture(id) {
        this.captureCalls++;
        if (this.env.document.pointerLockElement || !this.isConnected) {
            this.env.illegalCaptures++;
            throw new DOMException("Pointer capture is invalid while pointer lock is active or the target is detached", "InvalidStateError");
        }
        if (!this.env.activePointers.has(id)) throw new DOMException("Pointer is not active", "NotFoundError");
        this.env.captured.set(id, this);
    }
    hasPointerCapture(id) { return this.env.captured.get(id) === this; }
    releasePointerCapture(id) {
        this.releaseCalls++;
        if (!this.env.activePointers.has(id)) throw new DOMException("Pointer is not active", "NotFoundError");
        if (this.hasPointerCapture(id)) this.env.captured.delete(id);
    }
}

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.setValue(x, y, z); }
    setValue(x, y, z) { this.x = x; this.y = y; this.z = z; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    cloneTo(other) { other.setValue(this.x, this.y, this.z); }
}

function environment(coarse = false) {
    const env = { activePointers: new Set(), captured: new Map(), lockRequests: 0, illegalCaptures: 0, deferUnlock: false };
    const doc = env.document = new Target(env, "document");
    doc.hidden = false; doc.focused = true; doc.pointerLockElement = null; doc.hasFocus = () => doc.focused;
    doc.head = new Element(env, "head"); doc.head.parentNode = doc;
    doc.body = new Element(env, "body"); doc.body.parentNode = doc;
    doc.viewport = doc.head.appendChild(new Element(env, "viewport"));
    doc.querySelector = selector => selector === 'meta[name="viewport"]' ? doc.viewport : null;
    doc.createElement = name => new Element(env, name);
    const win = env.window = new Target(env, "window");
    win.innerWidth = 390; win.location = { search: "" };
    env.media = new Target(env, "media"); env.media.matches = coarse; win.matchMedia = () => env.media;
    env.dispatch = (target, type, fields = {}) => {
        const event = { type, target, currentTarget: null, defaultPrevented: false, stopped: false, immediate: false,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() { this.stopped = true; },
            stopImmediatePropagation() { this.stopped = this.immediate = true; },
            ...fields };
        const route = []; for (let node = target; node; node = node.parentNode) route.unshift(node);
        const invoke = (node, capture) => {
            event.currentTarget = node;
            for (const entry of [...(node.listeners.get(type) || [])]) {
                if (entry.capture === capture) entry.callback(event);
                if (event.immediate) break;
            }
        };
        for (const node of route) { invoke(node, true); if (event.stopped) return event; }
        for (let i = route.length - 1; i >= 0; i--) { invoke(route[i], false); if (event.stopped) break; }
        return event;
    };
    env.pointer = (target, type, fields = {}) => {
        const data = { pointerId: 1, pointerType: "mouse", button: 0, buttons: type === "pointerdown" ? 1 : 0,
            clientX: 250, clientY: 458, ...fields };
        if (type === "pointerdown") env.activePointers.add(data.pointerId);
        const result = env.dispatch(target, type, data);
        if (type === "pointerup" || type === "pointercancel") { env.activePointers.delete(data.pointerId); env.captured.delete(data.pointerId); }
        return result;
    };
    env.lock = element => { doc.pointerLockElement = element; env.captured.clear(); env.dispatch(doc, "pointerlockchange"); };
    env.unlock = () => { doc.pointerLockElement = null; env.dispatch(doc, "pointerlockchange"); };
    doc.exitPointerLock = () => { if (!env.deferUnlock) env.unlock(); };
    env.canvas = doc.body.appendChild(new Element(env, "canvas"));
    // Installed callbacks, when available. Missing-engine fixtures exercise logic only; engine contracts are NOT TESTED.
    env.engineDown = new Function("canvas", `return function(ev){${downBody}\n}`)(env.canvas);
    env.engineUp = new Function("canvas", `return function(ev){${upBody}\n}`)(env.canvas);
    env.canvas.addEventListener("pointerdown", env.engineDown);
    env.canvas.addEventListener("pointerup", env.engineUp, true);
    return env;
}

function fixture(coarse = false) {
    const env = environment(coarse);
    const Laya = {
        Scene3D: { physicsSettings: { fixedTimeStep: 1 / 60, maxSubSteps: 4 } },
        Script: class {}, Vector3, Quaternion: class {}, HitResult: class {},
        Matrix3x3: class { constructor() { this.elements = new Float32Array(9); } },
        AnimatorController: class {}, regClass: () => value => value, property: () => () => {},
        Browser: { mainCanvas: { source: env.canvas } }, timer: { delta: 1000 / 60, currTimer: 0 },
        Vector3Up: new Vector3(0, 1, 0)
    };
    Laya.Vector3.Up = Laya.Vector3Up;
    const modules = {};
    const load = name => {
        if (modules[name]) return modules[name];
        const output = ts.transpileModule(sources[name], { compilerOptions: {
            module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018, experimentalDecorators: true
        }}).outputText;
        const exports = modules[name] = {};
        const requireDependency = id => id.endsWith(".json") ? {} : load(id.replace(/^\.\//, ""));
        new Function("Laya", "exports", "require", "window", "document", output)(Laya, exports, requireDependency, env.window, env.document);
        return exports;
    };
    const avatarModule = load("PlayerAvatar");
    const avatar = new avatarModule.PlayerAvatar();
    const names = [...Object.values(avatarModule.PlayerMotion).filter(name => typeof name === "string"), "Shoot", "UpperIdle"];
    const states = new Map(names.map(name => [name, { name, speed: 1, clip: { duration: () => 0.2 }, transitions: [], soloTransitions: [] }]));
    const makeLayer = current => ({ defaultWeight: 0, current: states.get(current), states: [...states.values()], getAnimatorState(name) { return states.get(name); },
        getCurrentPlayState() { return { animatorState: this.current, normalizedTime: 0 }; } });
    avatar.ready = true; avatar.owner = { transform: {} }; avatar.fireDuration = 0.2;
    avatar.baseLayer = makeLayer("Idle"); avatar.upperLayer = makeLayer("UpperIdle");
    avatar.animator = { setParamsNumber() {}, setParamsBool() {}, play(name, index) {
        (index ? avatar.upperLayer : avatar.baseLayer).current = states.get(name);
    }};
    const game = new (load("LingshuiGame").LingshuiGame)();
    game.world = { physicsSimulation: { fixedTimeStep: 1 / 60, maxSubSteps: 4 }, timer: Laya.timer, _physicsStepTime: 0 };
    game.physicsStepSeconds = load("LingshuiGame").characterPhysicsStep(game.world);
    game.discardPhysicsFrame = false;
    game.monotonicNow = () => Laya.timer.currTimer;
    game.avatar = avatar;
    game.player = { transform: { position: new Vector3(0, 2, 0) } };
    game.previousPlayerPosition = new Vector3(0, 2, 0);
    game.camera = { transform: { lookAt() {} } };
    game.firstPersonArms = { update() {}, setVisible() {}, getStatus: () => ({ visible: false }) };
    game.motor = { move() {}, jump() {}, isOnGround: () => true };
    game.hud = env.document.body.appendChild(new Element(env, "hud"));
    game.prompt = game.hud.appendChild(new Element(env, "prompt"));
    game.setupInput();
    const mobile = new (load("MobileInput").MobileInput)(env.canvas, game.hud, {
        look: game.handleTouchLook,
        jump: () => { game.jumpQueued = true; }, shoot: () => { game.shootQueued = true; },
        perspective() {}, modeChanged: game.updateInputPresentation,
        shootChanged: game.syncShootHeld, cancelled: game.cancelQueuedActions
    });
    game.mobileInput = mobile; game.ready = true;
    const tick = (count, deltaSeconds = 1 / 60) => {
        Laya.timer.delta = deltaSeconds * 1000;
        for (let i = 0; i < count; i++) { Laya.timer.currTimer += Laya.timer.delta; game.onUpdate(); }
    };
    const key = (type, code, repeat = false) => env.dispatch(env.document, type, { code, repeat });
    const button = selector => mobile.root.querySelector(selector);
    return { env, game, avatar, mobile, tick, key, button,
        motionName: () => load("PlayerAvatar").PlayerMotion[avatar.motion] };
}

const tests = suite.tests;
const engineContracts = new Set([
    "native_engine_capture_conflict_reproduced", "first_lock_click_does_not_fire",
    "locked_mouse_hold_repeats_and_stops_without_engine_capture", "locked_right_button_never_captures_or_fires",
    "mouse_pointercancel_releases_hold", "touch_switch_during_pointer_lock_skips_both_engine_capture_paths",
    "destroy_removes_input_guards_and_listeners"
]);
function test(name, body) {
    suite.test(name, body, engineContracts.has(name) ? { kind: "engine_contract", dependency: engine } : {});
}
function stopped(f) {
    assert.equal(f.avatar.triggerHeld, false);
    assert.equal(f.game.mouseHeld, false);
    assert.equal(f.mobile.shooting, false);
}

test("native_engine_capture_conflict_reproduced", () => {
    assert.ok(downMatch && upMatch, "Installed Laya engine pointer callbacks no longer match the checked source contract");
    const env = environment(); env.activePointers.add(1); env.document.pointerLockElement = env.canvas;
    assert.throws(() => env.engineDown({ pointerId: 1 }), error => error.name === "InvalidStateError");
    return { source: enginePath, native_callback: "InputManager.__init__: pointerdown", exception: "InvalidStateError" };
});

test("first_lock_click_does_not_fire", () => {
    const f = fixture(); f.env.pointer(f.env.canvas, "pointerdown");
    assert.equal(f.env.lockRequests, 1); f.env.lock(f.env.canvas); f.tick(30);
    assert.equal(f.avatar.fireCount, 0); assert.equal(f.game.mouseHeld, false);
    f.env.pointer(f.env.canvas, "pointerup"); f.tick(2);
    assert.equal(f.avatar.fireCount, 0); assert.equal(f.env.canvas.captureCalls, 1);
    assert.equal(f.env.canvas.releaseCalls, 0); assert.equal(f.env.illegalCaptures, 0);
    return { shots: f.avatar.fireCount, legal_initial_capture: 1, locked_release_calls: 0 };
});

test("locked_mouse_hold_repeats_and_stops_without_engine_capture", () => {
    const f = fixture(); f.env.lock(f.env.canvas); f.env.pointer(f.env.canvas, "pointerdown");
    f.tick(1); assert.equal(f.avatar.fireCount, 1, "held plus queued click must produce only one initial shot");
    f.tick(30); const shots = f.avatar.fireCount; assert.ok(shots >= 3);
    f.env.pointer(f.env.canvas, "pointerup"); f.tick(20); stopped(f);
    assert.equal(f.avatar.fireCount, shots); assert.equal(f.avatar.firing, false);
    assert.equal(f.env.canvas.captureCalls, 0); assert.equal(f.env.canvas.releaseCalls, 0);
    return { shots_during_hold: shots, capture_calls: 0, release_calls: 0 };
});

test("mouse_tap_between_frames_fires_once", () => {
    const f = fixture(); f.env.lock(f.env.canvas);
    f.env.pointer(f.env.canvas, "pointerdown"); f.env.pointer(f.env.canvas, "pointerup");
    f.tick(30); assert.equal(f.avatar.fireCount, 1); stopped(f);
    return { shots: 1 };
});

test("locked_right_button_never_captures_or_fires", () => {
    const f = fixture(); f.env.lock(f.env.canvas);
    f.env.pointer(f.env.canvas, "pointerdown", { button: 2, buttons: 2 });
    f.env.pointer(f.env.canvas, "pointerup", { button: 2 }); f.tick(3);
    assert.equal(f.avatar.fireCount, 0); assert.equal(f.env.canvas.captureCalls, 0); assert.equal(f.env.canvas.releaseCalls, 0);
});

test("F_hold_repeats_without_key_repeat_double_shots", () => {
    const f = fixture(); f.env.lock(f.env.canvas); f.key("keydown", "KeyF"); f.tick(1);
    assert.equal(f.avatar.fireCount, 1);
    for (let i = 0; i < 10; i++) f.key("keydown", "KeyF", true);
    assert.equal(f.game.shootQueued, false); f.tick(30); const shots = f.avatar.fireCount;
    f.key("keyup", "KeyF"); f.tick(20); assert.equal(f.avatar.fireCount, shots); stopped(f);
    return { shots_during_hold: shots, repeat_events: 10 };
});

test("F_tap_between_frames_fires_once", () => {
    const f = fixture(); f.env.lock(f.env.canvas);
    f.key("keydown", "KeyF"); f.key("keyup", "KeyF"); f.tick(30);
    assert.equal(f.avatar.fireCount, 1); stopped(f);
});

test("mouse_and_F_hold_release_independently", () => {
    const f = fixture(); f.env.lock(f.env.canvas); f.env.pointer(f.env.canvas, "pointerdown");
    f.key("keydown", "KeyF"); f.tick(1); assert.equal(f.avatar.fireCount, 1);
    f.env.pointer(f.env.canvas, "pointerup"); f.tick(1); assert.equal(f.avatar.triggerHeld, true);
    f.key("keyup", "KeyF"); f.tick(20); stopped(f); assert.equal(f.avatar.fireCount, 1);
});

test("left_mouseup_in_button_chord_releases_hold", () => {
    const f = fixture(); f.env.lock(f.env.canvas); f.env.pointer(f.env.canvas, "pointerdown"); f.tick(1);
    f.env.dispatch(f.env.document, "mouseup", { button: 0, buttons: 2 }); f.tick(20);
    stopped(f); assert.equal(f.avatar.fireCount, 1);
});

test("mouse_pointercancel_releases_hold", () => {
    const f = fixture(); f.env.lock(f.env.canvas); f.env.pointer(f.env.canvas, "pointerdown"); f.tick(1);
    f.env.pointer(f.env.canvas, "pointercancel", { button: -1 }); f.tick(20);
    stopped(f); assert.equal(f.avatar.fireCount, 1); assert.equal(f.env.canvas.releaseCalls, 0);
});

test("blur_clears_queued_click_and_all_desktop_hold", () => {
    const f = fixture(); f.env.lock(f.env.canvas); f.env.pointer(f.env.canvas, "pointerdown"); f.key("keydown", "KeyF");
    f.env.document.focused = false; f.env.dispatch(f.env.window, "blur"); f.tick(2);
    f.env.document.focused = true; f.tick(30); stopped(f);
    assert.equal(f.game.keys.size, 0); assert.equal(f.avatar.fireCount, 0); assert.equal(f.game.shootQueued, false);
});

test("Escape_clears_queued_click_and_hold", () => {
    const f = fixture(); f.env.lock(f.env.canvas); f.env.pointer(f.env.canvas, "pointerdown"); f.key("keydown", "KeyF");
    f.key("keydown", "Escape"); f.tick(30); stopped(f);
    assert.equal(f.env.document.pointerLockElement, null); assert.equal(f.avatar.fireCount, 0);
});

test("hidden_document_cancels_and_does_not_resume_fire", () => {
    const f = fixture(); f.env.lock(f.env.canvas); f.env.pointer(f.env.canvas, "pointerdown"); f.tick(1);
    f.env.document.hidden = true; f.env.dispatch(f.env.document, "visibilitychange"); f.tick(2);
    f.env.document.hidden = false; f.tick(30); stopped(f);
    assert.equal(f.avatar.fireCount, 1); assert.equal(f.avatar.firing, false);
});

test("mobile_four_fingers_release_shoot_independently", () => {
    const f = fixture(true), shoot = f.button(".touch-shoot");
    f.env.pointer(f.mobile.joystick, "pointerdown", { pointerId: 11, pointerType: "touch", clientX: 110 });
    f.env.pointer(f.mobile.lookZone, "pointerdown", { pointerId: 12, pointerType: "touch" });
    f.env.pointer(shoot, "pointerdown", { pointerId: 13, pointerType: "touch" });
    f.env.pointer(shoot, "pointerdown", { pointerId: 14, pointerType: "touch" });
    f.tick(1); assert.equal(f.avatar.fireCount, 1); assert.equal(f.mobile.shooting, true);
    f.env.pointer(shoot, "pointerup", { pointerId: 13, pointerType: "touch" });
    assert.equal(f.mobile.shooting, true); assert.equal(shoot.dataset.pressed, "true");
    f.tick(30); const shots = f.avatar.fireCount;
    f.env.pointer(shoot, "pointercancel", { pointerId: 14, pointerType: "touch" });
    assert.equal(f.mobile.shooting, false); assert.equal(shoot.dataset.pressed, "false");
    assert.equal(f.mobile.movePointer, 11); assert.equal(f.mobile.lookPointer, 12); assert.ok(f.mobile.moveX > 0);
    f.tick(20); assert.equal(f.avatar.fireCount, shots);
    f.env.pointer(f.mobile.joystick, "pointerup", { pointerId: 11, pointerType: "touch" });
    f.env.pointer(f.mobile.lookZone, "pointerup", { pointerId: 12, pointerType: "touch" });
    assert.equal(f.mobile.captures.size, 0); stopped(f);
    return { shots_during_hold: shots, joystick_and_look_survived_shoot_release: true };
});

function assertCancellationKeepsFireDeadline(f, cancel, remainingInput) {
    f.tick(1);
    const firstShot = f.avatar.getStatus().shotEvents[0].atMs;
    const deadline = f.avatar.nextShotAtMs;
    f.tick(2); // Cancel at 50ms, well before the original 216.667ms second shot.
    f.game.jumpQueued = f.game.shootQueued = true;
    f.avatar.requestShoot();
    cancel();
    const afterCancel = {
        deadline: f.avatar.nextShotAtMs, firing: f.avatar.firing,
        jumpQueued: f.game.jumpQueued, shootQueued: f.game.shootQueued,
        avatarRequest: f.avatar.pendingShot, remainingInput: remainingInput()
    };
    f.tick(1);
    const nextFrameEvents = f.avatar.getStatus().shotEvents;
    f.tick(8); // 200ms: still before the original deadline.
    const beforeDeadlineEvents = f.avatar.getStatus().shotEvents;
    f.tick(1); // 216.667ms: the original 200ms interval has now elapsed.
    const events = f.avatar.getStatus().shotEvents;
    const evidence = { firstShotAtMs: firstShot, originalDeadlineMs: deadline, afterCancel,
        nextFrameEvents, beforeDeadlineEvents, atDeadlineEvents: events };
    const context = JSON.stringify(evidence);
    assert.equal(afterCancel.remainingInput, true, context);
    assert.equal(afterCancel.jumpQueued, false, context);
    assert.equal(afterCancel.shootQueued, false, context);
    assert.equal(afterCancel.avatarRequest, false, context);
    assert.equal(afterCancel.deadline, deadline, `Cancellation reset an independent held trigger's deadline: ${context}`);
    assert.equal(afterCancel.firing, true, context);
    assert.equal(nextFrameEvents.length, 1, `Cancellation emitted an early new shot: ${context}`);
    assert.equal(beforeDeadlineEvents.length, 1, context);
    assert.equal(events.length, 2, context);
    assert.ok(Math.abs(events[1].atMs - firstShot - 200) < 1e-6, context);
    return evidence;
}

test("canceling_move_pointer_preserves_independent_shoot_deadline", () => {
    const f = fixture(true), shoot = f.button(".touch-shoot");
    f.env.pointer(f.mobile.joystick, "pointerdown", { pointerId: 11, pointerType: "touch", clientX: 110 });
    f.env.pointer(shoot, "pointerdown", { pointerId: 14, pointerType: "touch" });
    return assertCancellationKeepsFireDeadline(f,
        () => f.env.pointer(f.mobile.joystick, "pointercancel", { pointerId: 11, pointerType: "touch" }),
        () => f.mobile.shooting && f.mobile.shootPointers.has(14) && f.mobile.movePointer === null);
});

test("canceling_one_of_two_shoot_pointers_preserves_original_deadline", () => {
    const f = fixture(true), shoot = f.button(".touch-shoot");
    for (const pointerId of [13, 14]) f.env.pointer(shoot, "pointerdown", { pointerId, pointerType: "touch" });
    return assertCancellationKeepsFireDeadline(f,
        () => f.env.pointer(shoot, "pointercancel", { pointerId: 13, pointerType: "touch" }),
        () => f.mobile.shooting && f.mobile.shootPointers.size === 1 && f.mobile.shootPointers.has(14));
});

test("mouse_cancel_while_F_is_held_preserves_original_deadline", () => {
    const f = fixture(); f.env.lock(f.env.canvas);
    f.key("keydown", "KeyF");
    f.env.pointer(f.env.canvas, "pointerdown", { pointerId: 8 });
    return assertCancellationKeepsFireDeadline(f,
        () => f.env.pointer(f.env.canvas, "pointercancel", { pointerId: 8, button: -1 }),
        () => f.game.keys.has("KeyF") && !f.game.mouseHeld && f.game.mousePointer === null);
});

test("mobile_reset_clears_shoot_pointer_set", () => {
    const f = fixture(true); f.env.pointer(f.button(".touch-shoot"), "pointerdown", { pointerId: 3, pointerType: "touch" });
    f.tick(1); f.mobile.reset(); f.tick(20); stopped(f);
    assert.equal(f.mobile.shootPointers.size, 0); assert.equal(f.mobile.captures.size, 0); assert.equal(f.avatar.fireCount, 1);
});

test("touch_switch_during_pointer_lock_skips_both_engine_capture_paths", () => {
    const f = fixture(); f.env.lock(f.env.canvas); f.env.deferUnlock = true;
    f.env.pointer(f.env.canvas, "pointerdown", { pointerId: 5, pointerType: "touch" });
    assert.equal(f.mobile.enabled, true); assert.equal(f.mobile.lookPointer, 5);
    assert.equal(f.env.canvas.captureCalls, 0); assert.equal(f.env.illegalCaptures, 0);
    f.env.pointer(f.env.canvas, "pointerup", { pointerId: 5, pointerType: "touch" });
    assert.equal(f.mobile.lookPointer, null); assert.equal(f.mobile.captures.size, 0); assert.equal(f.env.canvas.releaseCalls, 0);
    f.env.unlock();
});

test("respawn_clears_all_held_inputs", () => {
    const f = fixture(); f.env.lock(f.env.canvas); f.env.pointer(f.env.canvas, "pointerdown"); f.key("keydown", "KeyF"); f.tick(1);
    f.game.respawn(); f.tick(30); stopped(f); assert.equal(f.avatar.fireCount, 1); assert.equal(f.game.keys.size, 0);
});

test("destroy_removes_input_guards_and_listeners", () => {
    const f = fixture(); f.env.lock(f.env.canvas); f.env.pointer(f.env.canvas, "pointerdown"); f.tick(1); f.game.onDestroy();
    assert.equal(f.game.ready, false); assert.equal(f.avatar.triggerHeld, false);
    assert.equal(f.env.canvas.listeners.get("pointerdown").length, 1, "Only Laya's original down listener should remain");
    assert.equal(f.env.canvas.listeners.get("pointerup").length, 1, "Only Laya's original up listener should remain");
    assert.equal(f.env.document.listeners.get("pointerup").length, 0);
    assert.equal(f.env.window.listeners.get("blur").length, 0);
});

function runningFixture() {
    const f = fixture(); f.env.lock(f.env.canvas);
    f.key("keydown", "KeyD"); f.key("keydown", "ShiftLeft");
    return f;
}
function measuredFrame(f, distance, seconds = 1 / 120) {
    // Supply the position a completed physics step would expose. The production onUpdate samples it.
    f.game.player.transform.position.x += distance;
    f.tick(1, seconds);
    return { speed: f.game.actualSpeed, motion: f.motionName() };
}

for (const hz of [60, 120]) {
    test(`actual_speed_zero_double_cadence_${hz}hz_stays_run_right`, () => {
        const f = runningFixture(), seconds = 1 / hz, actualVelocity = 4, frames = [];
        for (let i = 0; i < hz / 2; i++) {
            frames.push(measuredFrame(f, i % 2 ? 2 * actualVelocity * seconds : 0, seconds));
        }
        assert.ok(frames.slice(1).every(frame => frame.motion === "RunRight"), "Zero-displacement render frames must not return a held Shift+D strafe to Idle");
        const steady = frames.slice(Math.ceil(0.12 * hz));
        assert.ok(steady.every(frame => Math.abs(frame.speed - actualVelocity) < 1e-6), "Full-window speed must match actual accumulated travel");
        return { render_hz: hz, raw_speed_samples: [0, 2 * actualVelocity],
            steady_min_speed: Math.min(...steady.map(frame => frame.speed)),
            steady_max_speed: Math.max(...steady.map(frame => frame.speed)), idle_frames_after_motion_started: 0 };
    });
}

test("actual_speed_uses_measured_travel_not_target_speed", () => {
    const f = runningFixture(), actualVelocity = 1.2, seconds = 1 / 120;
    for (let i = 0; i < 40; i++) measuredFrame(f, i % 2 ? 2 * actualVelocity * seconds : 0, seconds);
    assert.equal(f.game.runSpeed, 4);
    assert.ok(Math.abs(f.game.actualSpeed - actualVelocity) < 1e-6);
    return { requested_run_speed: f.game.runSpeed, measured_speed: f.game.actualSpeed };
});

test("wall_contact_clears_measured_speed_within_120ms", () => {
    const f = runningFixture(), seconds = 1 / 120;
    for (let i = 0; i < 30; i++) measuredFrame(f, 4 * seconds, seconds);
    let stoppedAt = null;
    for (let i = 0; i < 20; i++) {
        const frame = measuredFrame(f, 0, seconds);
        if (stoppedAt === null && frame.speed <= 0.08) stoppedAt = (i + 1) * seconds;
    }
    assert.ok(stoppedAt !== null && stoppedAt <= 0.12, "A blocked runner must not keep running after the short filter window");
    assert.equal(f.game.actualSpeed, 0); assert.equal(f.motionName(), "Idle");
    assert.ok(f.game.keys.has("KeyD") && f.game.keys.has("ShiftLeft"), "Movement must still be requested during the wall test");
    return { stopped_after_s: stoppedAt, movement_still_held: true, final_speed: f.game.actualSpeed };
});

test("releasing_movement_clears_speed_on_next_frame", () => {
    const f = runningFixture(), seconds = 1 / 120;
    for (let i = 0; i < 30; i++) measuredFrame(f, 4 * seconds, seconds);
    f.key("keyup", "KeyD");
    measuredFrame(f, 4 * seconds, seconds); // Even a pending physics displacement must not preserve stale gait.
    assert.equal(f.game.actualSpeed, 0); assert.equal(f.game.speedSamples.length, 0);
    assert.equal(f.motionName(), "Idle");
    return { cleared_within_s: seconds, final_speed: f.game.actualSpeed };
});

test("blur_and_respawn_clear_speed_history_immediately", () => {
    const f = runningFixture(), seconds = 1 / 120;
    for (let i = 0; i < 30; i++) measuredFrame(f, 4 * seconds, seconds);
    f.env.document.focused = false; f.env.dispatch(f.env.window, "blur");
    assert.equal(f.game.actualSpeed, 0); assert.equal(f.game.speedSamples.length, 0);
    f.env.document.focused = true; f.key("keydown", "KeyD"); f.key("keydown", "ShiftLeft");
    for (let i = 0; i < 30; i++) measuredFrame(f, 4 * seconds, seconds);
    assert.ok(f.game.actualSpeed > 3.9);
    f.game.respawn();
    assert.equal(f.game.actualSpeed, 0); assert.equal(f.game.speedSamples.length, 0);
    f.tick(1); assert.equal(f.game.actualSpeed, 0); assert.equal(f.motionName(), "Idle");
});

test("speed_uses_elapsed_time_before_control_dt_clamp", () => {
    const f = runningFixture(); measuredFrame(f, 0.4, 0.2);
    assert.ok(Math.abs(f.game.actualSpeed - 2) < 1e-6, "0.4m over 0.2s is 2m/s even when control dt is capped at 0.05s");
    return { distance_m: 0.4, sample_seconds: 0.2, measured_speed: f.game.actualSpeed };
});

suite.finish({
    scope: "Production input, PlayerAvatar firing/motion decisions, actual-position speed sampling and installed Laya pointer callbacks; DOM/physics-position fixtures, no live UI",
    source_sha256: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name + ".ts", crypto.createHash("sha256").update(source).digest("hex")])),
    engine_source: enginePath,
    engine_capture_line: engine.available && downMatch ? engineSource.slice(0, engineSource.indexOf("canvas.setPointerCapture(ev.pointerId)")).split("\n").length : null,
    engine_callbacks_used: !!(engine.available && downMatch && upMatch), pulse_duration_fixture_s: 0.2
});
