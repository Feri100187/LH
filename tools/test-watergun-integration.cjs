#!/usr/bin/env node
"use strict";
// Production emission, queue, resolver and progress methods; rendering and ray
// geometry are doubles. This is not native Bullet or hardware input evidence.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict");
const suite = require("./testing/context.cjs").createSuite("watergun-integration"), sources = {};
class Vector3 { constructor(x = 0, y = 0, z = 0) { this.setValue(x, y, z); } setValue(x, y, z) { this.x = x; this.y = y; this.z = z; } }
const Laya = { Script: class {}, Vector3, Quaternion: class {}, AnimatorController: class {}, PhysicsCollider: class {},
    Ray: class { constructor(origin, direction) { this.origin = origin; this.direction = direction; } },
    regClass: () => value => value, property: () => () => {} };
function load(name, dependencies = {}) {
    const source = sources[name] = fs.readFileSync(path.join(suite.root, "src", name + ".ts"), "utf8");
    const out = suite.ts.transpileModule(source, { compilerOptions: { module: suite.ts.ModuleKind.CommonJS,
        target: suite.ts.ScriptTarget.ES2018, experimentalDecorators: true } }).outputText;
    const exports = {};
    new Function("Laya", "exports", "require", out)(Laya, exports, id => {
        assert.ok(dependencies[id], "Unexpected dependency " + id); return dependencies[id];
    });
    return exports;
}
const avatarModule = load("PlayerAvatar"), resolverModule = load("WaterShotResolver"), progressModule = load("TrainingProgress");
const nativeQueryModule = load("PhysicsWaterQuery");
class QueryDouble {
    constructor() { this.trace = []; this.target = "near"; }
    beginShot() { this.trace.length = 0; }
    cast = (origin, direction, maxDistance) => {
        const distance = direction[2] > 0 ? (8 - origin[2]) / direction[2] : Infinity;
        const hit = this.target && distance >= 0 && distance <= maxDistance + 1e-7 ? {
            distance, point: origin.map((n, i) => n + direction[i] * distance), normal: [0, 0, -1], kind: "target", targetId: this.target
        } : null;
        this.trace.push({ hit }); return hit;
    };
}
class ViewDouble {
    constructor() { this.updates = []; }
    applyCompleted(ids) { this.updates.push([...ids]); }
    getTargets() { return []; }
    destroy() {}
}
class HudDouble { setProgress() {} showShot() {} update() {} clear() {} destroy() {} }
class EffectsDouble {
    constructor() { this.shown = []; this.clears = 0; }
    show(result, atMs) { this.shown.push({ result, atMs }); }
    update() {} clear() { this.clears++; } destroy() {}
}
class MuzzleDouble { sample() { return [0, .72, 1]; } suppressDemonstrationStreams() {} getStatus() { return {}; } }
const { WaterGunSystem } = load("WaterGunSystem", {
    "./PlayerAvatar": avatarModule, "./WaterShotResolver": resolverModule, "./TrainingProgress": progressModule,
    "./PhysicsWaterQuery": { PhysicsWaterQuery: QueryDouble, WATER_QUERY_GROUP: 2, WATER_QUERY_MASK: 5 },
    "./TrainingRangeView": { TrainingRangeView: ViewDouble }, "./TrainingHud": { TrainingHud: HudDouble },
    "./WeaponMuzzle": { WeaponMuzzle: MuzzleDouble }, "./WaterShotEffects": { WaterShotEffects: EffectsDouble }
});
function fixture() {
    const avatar = new avatarModule.PlayerAvatar();
    const states = new Map(Object.values(avatarModule.PlayerMotion).filter(v => typeof v === "string")
        .map(name => [name, { name, speed: 1, transitions: [], soloTransitions: [] }]));
    avatar.ready = true; avatar.owner = { transform: {} };
    avatar.animator = { play() {}, setParamsNumber() {}, setParamsBool() {} };
    avatar.baseLayer = { states: [...states.values()], getAnimatorState: name => states.get(name),
        getCurrentPlayState: () => ({ animatorState: states.get(avatarModule.PlayerMotion[avatar.motion]), normalizedTime: 0 }) };
    avatar.upperLayer = { defaultWeight: 0, getCurrentPlayState: () => ({ animatorState: { name: "Shoot" }, normalizedTime: 0 }) };
    const f = { avatar, frame: 0, now: 0, firstPerson: true };
    f.camera = { transform: { position: new Vector3(0, .72, 0), getForward: out => out.setValue(0, 0, 1) } };
    f.system = new WaterGunSystem({}, { transform: { position: new Vector3() } }, f.camera, avatar, {},
        () => f.frame, () => avatar.cancelTransientActions());
    f.step = (dt, resolve = true) => {
        f.frame++; f.now += dt * 1000;
        avatar.step(dt, { nowMs: f.now, speed: 0, running: false, moving: false, grounded: true,
            jumped: false, yaw: 0, pitch: 0, moveX: 0, moveZ: 0 });
        if (resolve) f.system.updateAfterPhysics(f.now, f.firstPerson);
    };
    return f;
}
for (const fps of [15, 30, 60, 120, 240]) suite.test(`production_held_emissions_and_settlements_at_${fps}_fps`, () => {
    const f = fixture(); f.avatar.setTriggerHeld(true);
    for (let i = 0; i < 2 * fps; i++) f.step(1 / fps);
    const events = f.avatar.getStatus().shotEvents, status = f.system.getStatus();
    assert.equal(events.length, 10); assert.equal(status.receivedEvents, 10);
    assert.equal(status.consumedShots, 10); assert.equal(status.targetHits, 10); assert.equal(status.completionEvents, 1);
    assert.equal(status.completed, 1); assert.equal(status.shots.length, 10); assert.equal(status.cancelledEvents, 0);
    assert.deepEqual(status.shots.map(s => s.id), events.map(e => e.id));
    assert.deepEqual(events.map(e => e.id), Array.from({ length: 10 }, (_, i) => i + 1));
    for (let i = 1; i < events.length; i++) assert.ok(Math.abs(events[i].atMs - events[i - 1].atMs - 200) <= 1000 / fps + 1e-6);
    assert.ok(status.shots.every(s => s.accepted && s.resolvedFrame === s.frame));
    f.avatar.setTriggerHeld(false);
    for (let i = 0; i < fps; i++) f.step(1 / fps);
    assert.equal(f.avatar.getStatus().shots, 10); assert.equal(f.system.getStatus().consumedShots, 10);
    return { fps, inputDurationMs: 2000, shotIds: events.map(e => e.id), emissionTimesMs: events.map(e => e.atMs), settlements: 10, completions: 1 };
});
suite.test("every_actual_miss_is_consumed_once_without_target_response", () => {
    const f = fixture(); f.system.query.target = null; f.avatar.setTriggerHeld(true);
    for (let i = 0; i < 120; i++) f.step(1 / 60);
    const s = f.system.getStatus(); assert.equal(s.consumedShots, 10); assert.equal(s.targetHits, 0);
    assert.equal(s.completed, 0); assert.equal(s.completionEvents, 0); assert.ok(s.shots.every(shot => shot.result.outcome === "miss"));
});
suite.test("replacing_listener_never_replays_history_and_duplicate_delivery_is_rejected", () => {
    const f = fixture(); f.avatar.setTriggerHeld(true); f.step(1 / 60);
    const event = f.avatar.getStatus().shotEvents[0];
    f.avatar.setShotListener(f.system.onShot); f.avatar.setShotListener(f.system.onShot);
    f.system.onShot(event); f.system.onShot({ ...event }); f.system.updateAfterPhysics(f.now, true);
    const s = f.system.getStatus(); assert.equal(s.receivedEvents, 1); assert.equal(s.duplicateEvents, 2);
    assert.equal(s.consumedShots, 1); assert.equal(s.pendingShots, 0); assert.equal(s.shots.length, 1);
});
suite.test("reset_cancels_pending_emissions_and_watermark_prevents_replay", () => {
    const f = fixture(); f.avatar.setTriggerHeld(true); f.step(1 / 60, false);
    const old = f.avatar.getStatus().shotEvents[0]; assert.equal(f.system.getStatus().pendingShots, 1);
    f.system.reset(); f.system.reset(); f.system.onShot(old); f.system.updateAfterPhysics(f.now, true);
    let s = f.system.getStatus(); assert.equal(s.lastConsumedShotId, old.id); assert.equal(s.completed, 0);
    assert.equal(s.cancelledEvents, 1); assert.equal(s.consumedShots, 0); assert.equal(s.duplicateEvents, 1);
    f.avatar.setTriggerHeld(true); f.step(1 / 60);
    s = f.system.getStatus(); assert.equal(s.consumedShots, 1); assert.equal(s.completed, 1);
    assert.equal(s.shots[0].id, old.id + 1); assert.equal(s.resetCount, 2);
});
suite.test("continuous_view_switch_does_not_create_additional_emissions_or_consumptions", () => {
    const f = fixture(); f.avatar.setTriggerHeld(true);
    for (let i = 0; i < 120; i++) {
        f.firstPerson = i % 2 === 0; f.avatar.setVisibility(!f.firstPerson); f.step(1 / 60);
        f.system.updateAfterPhysics(f.now, !f.firstPerson);
    }
    const s = f.system.getStatus(); assert.equal(f.avatar.getStatus().shots, 10); assert.equal(s.consumedShots, 10);
    assert.equal(s.shots.length, 10); assert.equal(s.completionEvents, 1);
});
suite.test("queued_emission_samples_camera_and_muzzle_in_the_resolution_frame", () => {
    const f = fixture(); f.avatar.setTriggerHeld(true); f.step(1 / 60, false);
    f.camera.transform.position.setValue(1, 2, 0);
    f.system.muzzle.sample = () => [1, 1.8, 1];
    f.system.updateAfterPhysics(f.now, false);
    const shot = f.system.getStatus().shots[0];
    assert.deepEqual(shot.cameraOrigin, [1, 2, 0]); assert.deepEqual(shot.muzzleOrigin, [1, 1.8, 1]);
    assert.deepEqual(shot.cameraDirection, [0, 0, 1]); assert.equal(shot.resolvedFrame, shot.frame);
    assert.equal(shot.firstPerson, false); assert.equal(shot.result.outcome, "target");
});
suite.test("cross_frame_stalled_and_backwards_time_queues_are_rejected_without_query", () => {
    const cases = ["next-frame", "long-gap", "backwards"];
    for (const mode of cases) {
        const f = fixture(); f.avatar.setTriggerHeld(true); f.step(1 / 60, false);
        if (mode === "next-frame") f.frame++;
        const now = mode === "long-gap" ? f.now + 251 : mode === "backwards" ? f.now - 1 : f.now;
        f.system.updateAfterPhysics(now, true);
        const s = f.system.getStatus(); assert.equal(s.cancelledEvents, 1, mode); assert.equal(s.consumedShots, 0, mode);
        assert.equal(f.system.query.trace.length, 0); assert.equal(s.pendingShots, 0);
    }
});
suite.test("long_avatar_clock_gap_clears_held_trigger_and_does_not_emit_backlog", () => {
    const f = fixture(); f.avatar.setTriggerHeld(true); f.step(1 / 60); f.step(.6);
    for (let i = 0; i < 60; i++) f.step(1 / 60);
    assert.equal(f.avatar.getStatus().shots, 1); assert.equal(f.system.getStatus().consumedShots, 1);
    f.avatar.setTriggerHeld(true); f.step(1 / 60);
    assert.equal(f.avatar.getStatus().shots, 2); assert.equal(f.system.getStatus().consumedShots, 2);
});
suite.test("native_query_adapter_requests_group_2_mask_5_and_filters_self_descendants", () => {
    let args; const player = {}, child = { parent: player, getComponent: () => null };
    const worldOwner = { getComponent: () => ({ type: "world" }) }, targetOwner = { getComponent: () => ({ type: "target" }) };
    const hit = (z, owner) => ({ succeeded: true, point: new Vector3(0, 0, z), normal: new Vector3(0, 0, -1), collider: { owner } });
    const world = { physicsSimulation: { rayCastAll(ray, out, range, group, mask) {
        args = { range, group, mask }; out.length = 0;
        out.push(hit(1, child), hit(4, targetOwner), hit(4, worldOwner), hit(8.001, targetOwner));
    } } };
    const query = new nativeQueryModule.PhysicsWaterQuery(world, player, collider => collider.type === "target" ? "near" : null);
    query.beginShot(); const result = query.cast([0, 0, 0], [0, 0, 1], 8);
    assert.deepEqual(args, { range: 8.002, group: 2, mask: 5 });
    assert.equal(result.kind, "world"); assert.equal(result.distance, 4); assert.equal(query.trace.length, 1);
    world.physicsSimulation.rayCastAll = (_ray, out) => { out.length = 0; out.push(hit(8.001, targetOwner)); };
    assert.equal(query.cast([0, 0, 0], [0, 0, 1], 8), null, "query endpoint epsilon must not award extra range");
    return { scope: "production adapter with rayCastAll double, not native collision filtering" };
});
suite.test("production_pipeline_samples_forward_axis_after_final_camera_follow", () => {
    const source = sources.LingshuiGame = fs.readFileSync(path.join(suite.root, "src/LingshuiGame.ts"), "utf8");
    const method = source.slice(source.indexOf("private followAfterPhysics()"), source.indexOf("private publishStatus("));
    assert.ok(method.indexOf("this.updateCamera(dt)") >= 0);
    assert.ok(method.indexOf("this.updateCamera(dt)") < method.indexOf("this.waterGun?.updateAfterPhysics"));
    assert.match(sources.WaterGunSystem, /this\.camera\.transform\.getForward\(this\.direction\)/);
    assert.match(fs.readFileSync(path.join(suite.root, "src/PlayerCameraFollow.ts"), "utf8"), /onAfterSceneUpdate\(\)\s*\{\s*this\.follow\?\.\(\)/);
});
suite.finish({ production_sources: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, crypto.createHash("sha256").update(source).digest("hex")])),
    not_verified: ["Native Bullet query masks and physical scene geometry", "Hardware mouse/touch/keyboard and visibility events", "Actual rendering FPS and visual alignment"] });
