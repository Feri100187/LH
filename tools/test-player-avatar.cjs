#!/usr/bin/env node
"use strict";

// Run the real TypeScript class with rendering dependencies stubbed out.
// This checks state decisions and heading math, not Bullet or Animator playback.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "src", "PlayerAvatar.ts");
const reportPath = path.join(root, "docs", "player_avatar", "edge_case_tests.json");
const source = fs.readFileSync(sourcePath, "utf8");

function loadTypeScript() {
    const candidates = [
        process.env.TYPESCRIPT_PATH,
        "typescript",
        path.resolve(root, "../../LayaAirIDE/resources/node_modules/typescript")
    ].filter(Boolean);
    for (const candidate of candidates) {
        try { return { compiler: require(candidate), location: require.resolve(candidate) }; }
        catch (_) { /* Try the installed IDE compiler next. */ }
    }
    throw new Error("TypeScript compiler unavailable. Set TYPESCRIPT_PATH to typescript.js or its package directory.");
}

const { compiler: ts, location: compilerPath } = loadTypeScript();
const compiled = ts.transpileModule(source, {
    fileName: sourcePath,
    reportDiagnostics: true,
    compilerOptions: {
        target: ts.ScriptTarget.ES2018,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true
    }
});
const errors = (compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
if (errors.length) {
    throw new Error(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"));
}

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.setValue(x, y, z); }
    setValue(x, y, z) { this.x = x; this.y = y; this.z = z; }
}
const Laya = {
    Script: class {},
    Vector3,
    Quaternion: class {},
    AnimatorController: class {},
    regClass: () => constructor => constructor,
    property: () => () => {}
};
const compiledExports = {};
new Function("Laya", "exports", `${compiled.outputText}\n//# sourceURL=${sourcePath.replace(/\\/g, "/")}`)(Laya, compiledExports);
const { PlayerAvatar, PlayerMotion } = compiledExports;

function input(overrides = {}) {
    return {
        speed: 0, running: false, moving: false,
        grounded: true, jumped: false,
        yaw: 0, pitch: 0, moveX: 0, moveZ: 0,
        ...overrides
    };
}

function fixture() {
    const avatar = new PlayerAvatar();
    const params = new Map();
    const states = new Map(Object.values(PlayerMotion).filter(name => typeof name === "string")
        .map(name => [name, { name, speed: 1, transitions: [], soloTransitions: [] }]));
    const result = { avatar, elapsed: 0, frames: [], params, states, plays: [] };
    avatar.ready = true;
    avatar.owner = { transform: {} };
    avatar.animator = {
        play(name, layer, offset) { result.plays.push({ name, layer, offset }); },
        setParamsNumber(name, value) { params.set(name, value); },
        setParamsBool(name, value) { params.set(name, value); }
    };
    avatar.baseLayer = { states: [...states.values()], getAnimatorState(name) { return states.get(name); },
        getCurrentPlayState() { return { animatorState: states.get(PlayerMotion[avatar.motion]), normalizedTime: 0 }; } };
    avatar.upperLayer = { defaultWeight: 0 };
    result.advance = (count, frameInput, dt = 1 / 30) => {
        for (let i = 0; i < count; i++) {
            result.elapsed += dt;
            // Deliberately call the transpiled production method; do not reproduce its logic.
            avatar.step(dt, frameInput);
            assert.ok(Number.isFinite(avatar.heading), "Heading must stay finite");
            result.frames.push({
                time_s: result.elapsed,
                grounded: frameInput.grounded,
                airborne: avatar.airborne,
                motion: PlayerMotion[avatar.motion],
                heading: avatar.heading
            });
        }
    };
    return result;
}

function history(f) {
    return f.frames.filter((frame, index, frames) => !index || frame.motion !== frames[index - 1].motion)
        .map(({ time_s, motion }) => ({ time_s, motion }));
}

function assertGroundedIdle(f) {
    assert.equal(f.avatar.airborne, false, "A grounded character must leave its airborne state");
    assert.equal(PlayerMotion[f.avatar.motion], "Idle", "A grounded stationary character must return to Idle");
}

const tests = [];
function test(name, body) {
    try {
        const details = body();
        tests.push({ name, status: "PASS", details });
    } catch (error) {
        tests.push({ name, status: "FAIL", error: error.message, stack: error.stack });
    }
}

test("brief_ground_loss_then_landing", () => {
    const f = fixture();
    f.advance(3, input({ grounded: false })); // 0.1s crosses the fall debounce threshold.
    assert.equal(f.avatar.airborne, true, "This scenario must actually enter an airborne state");
    f.advance(30, input());
    assertGroundedIdle(f);
    assert.ok(f.frames.some(frame => frame.motion === "Land"), "Confirmed ground loss must produce a landing state");
    return { ground_loss_s: 0.1, observed_states: history(f), final_airborne: f.avatar.airborne };
});

test("blocked_jump_never_leaves_ground", () => {
    const f = fixture();
    f.advance(1, input({ jumped: true }));
    f.advance(30, input());
    assertGroundedIdle(f);
    const recovered = f.frames.find(frame => frame.time_s > 1 / 30 && !frame.airborne && frame.motion === "Idle");
    assert.ok(recovered && recovered.time_s < 0.6, "A jump that never leaves the ground must recover promptly");
    return { recovered_at_s: recovered.time_s, observed_states: history(f), final_airborne: f.avatar.airborne };
});

test("normal_jump_air_landing_idle", () => {
    const f = fixture();
    f.advance(1, input({ jumped: true }));
    f.advance(15, input({ grounded: false }));
    assert.equal(f.avatar.airborne, true, "Normal jump must remain airborne before ground contact");
    assert.equal(PlayerMotion[f.avatar.motion], "Jump");
    f.advance(30, input());
    assertGroundedIdle(f);
    const transitions = history(f).map(frame => frame.motion);
    assert.deepEqual(transitions, ["Jump", "Land", "Idle"]);
    return { observed_states: history(f), final_airborne: f.avatar.airborne };
});

test("running_jump_air_landing_run", () => {
    const f = fixture();
    const moving = { moving: true, running: true, speed: 4, moveZ: -1 };
    f.advance(1, input({ ...moving, jumped: true }));
    f.advance(15, input({ ...moving, grounded: false }));
    assert.equal(PlayerMotion[f.avatar.motion], "RunJump");
    f.advance(30, input(moving));
    assert.equal(f.avatar.airborne, false);
    assert.equal(PlayerMotion[f.avatar.motion], "Run");
    assert.deepEqual(history(f).map(frame => frame.motion), ["RunJump", "RunLand", "Run"]);
    return { observed_states: history(f), final_airborne: f.avatar.airborne };
});

test("subthreshold_ground_flicker_stays_idle", () => {
    const f = fixture();
    f.advance(2, input({ grounded: false }));
    f.advance(30, input());
    assertGroundedIdle(f);
    assert.ok(f.frames.every(frame => frame.motion === "Idle"), "Subthreshold ground flicker must not trigger a jump animation");
    return { ground_loss_s: 2 / 30, observed_states: history(f) };
});

const headingCases = [
    { name: "heading_positive_multiple_turns", initial: 4 * Math.PI + 0.2, target: 0.3 },
    { name: "heading_negative_multiple_turns", initial: -4 * Math.PI + 0.2, target: 0.1 },
    { name: "heading_positive_turns_across_pi", initial: 20 * Math.PI + 3.1, target: -3.1 },
    { name: "heading_negative_turns_across_pi", initial: -20 * Math.PI - 3.1, target: 3.1 },
    { name: "heading_many_accumulated_turns", initial: 200 * Math.PI + 0.2, target: 0.3 },
    { name: "idle_camera_positive_multiple_turns", initial: 0.2, target: 4 * Math.PI + 0.3, stationary: true },
    { name: "idle_camera_negative_multiple_turns", initial: 0.2, target: -4 * Math.PI + 0.1, stationary: true }
];
for (const scenario of headingCases) {
    test(scenario.name, () => {
        const f = fixture();
        f.avatar.heading = scenario.initial;
        // Independent angle oracle: choose the equivalent target nearest the current heading.
        const nearestTarget = scenario.target + Math.round((scenario.initial - scenario.target) / (2 * Math.PI)) * 2 * Math.PI;
        const shortestDelta = nearestTarget - scenario.initial;
        const frameInput = scenario.stationary
            ? input({ yaw: Math.PI - scenario.target })
            : input({ yaw: Math.PI - scenario.target, moving: true, speed: 1.6,
                moveX: Math.cos(Math.PI - scenario.target), moveZ: Math.sin(Math.PI - scenario.target) });
        f.advance(1, frameInput, 1 / 60);
        // Equivalent angles may be normalized internally; compare physical orientation changes.
        const angularDelta = (from, to) => to + Math.round((from - to) / (2 * Math.PI)) * 2 * Math.PI - from;
        const firstDelta = angularDelta(scenario.initial, f.avatar.heading);
        assert.ok(firstDelta * shortestDelta > 0, "Turn must begin in the shortest-path direction");
        assert.ok(Math.abs(firstDelta) <= Math.abs(shortestDelta) + 1e-9, "One frame must not overshoot the nearest equivalent angle");
        f.advance(59, frameInput, 1 / 60);
        const finalError = angularDelta(f.avatar.heading, scenario.target);
        assert.ok(Math.abs(finalError) < 1e-4, "Heading must converge without an extra full rotation");
        let last = scenario.initial, travel = 0;
        for (const frame of f.frames) { travel += Math.abs(angularDelta(last, frame.heading)); last = frame.heading; }
        assert.ok(travel <= Math.abs(shortestDelta) + 1e-6, "Heading must not wind around or reverse direction");
        return {
            initial_radians: scenario.initial,
            target_radians: scenario.target,
            shortest_delta_degrees: shortestDelta * 180 / Math.PI,
            first_frame_delta_degrees: firstDelta * 180 / Math.PI,
            total_travel_degrees: travel * 180 / Math.PI,
            final_error_degrees: finalError * 180 / Math.PI
        };
    });
}

test("held_trigger_repeats_without_lowering_weapon", () => {
    const f = fixture();
    f.avatar.setTriggerHeld(true);
    f.avatar.requestShoot();
    f.advance(1, input(), 1 / 60);
    assert.equal(f.avatar.fireCount, 1, "The first rendered frame starts shooting");
    assert.equal(f.params.get("Fire"), true);
    f.advance(72, input(), 1 / 60);
    assert.ok(f.avatar.fireCount >= 6, "Holding for 1.2s should produce repeated 0.2s pulses");
    assert.equal(f.plays.filter(p => p.name === "Shoot").length, 1, "Held fire must keep one continuous animation loop");
    assert.equal(f.avatar.firing, true);
    assert.equal(f.avatar.upperWeight, 1);
    const countAtRelease = f.avatar.fireCount;
    f.avatar.setTriggerHeld(false);
    f.advance(24, input(), 1 / 60);
    assert.equal(f.avatar.firing, false);
    assert.equal(f.avatar.fireCount, countAtRelease, "Release must not start another shot");
    assert.equal(f.params.get("Fire"), false);
    return { shots: countAtRelease, clip_starts_while_held: 1, stopped_after_release: true };
});

test("quick_tap_during_cycle_is_queued", () => {
    const f = fixture();
    f.avatar.requestShoot();
    f.advance(5, input(), 1 / 60);
    f.avatar.requestShoot();
    f.advance(30, input(), 1 / 60);
    assert.equal(f.avatar.fireCount, 2, "A second click during the first pulse must not be discarded");
    assert.equal(f.avatar.firing, false);
    return { shots: f.avatar.fireCount, returned_to_ready: true };
});

test("quick_mouse_press_during_cycle_survives_held_frame", () => {
    const f = fixture();
    f.avatar.setTriggerHeld(true); f.avatar.requestShoot();
    f.advance(1, input(), 1 / 60);
    f.avatar.setTriggerHeld(false); f.advance(3, input(), 1 / 60);
    f.avatar.setTriggerHeld(true); f.avatar.requestShoot();
    f.advance(1, input(), 1 / 60);
    f.avatar.setTriggerHeld(false); f.advance(30, input(), 1 / 60);
    assert.equal(f.avatar.fireCount, 2, "A press that is sampled as held for one frame must still queue its click");
    assert.equal(f.avatar.firing, false);
    return { shots: 2, active_cycle_click_preserved: true };
});

test("cancel_drops_held_and_queued_fire", () => {
    const f = fixture();
    f.avatar.setTriggerHeld(true);
    f.avatar.requestShoot();
    f.advance(4, input(), 1 / 60);
    f.avatar.requestShoot();
    f.avatar.cancelTransientActions();
    f.advance(60, input(), 1 / 60);
    assert.equal(f.avatar.fireCount, 1);
    assert.equal(f.avatar.triggerHeld, false);
    assert.equal(f.avatar.pendingShot, false);
    assert.equal(f.avatar.firing, false);
    return { shots_after_cancel: 1 };
});

test("held_fire_preserves_run_and_jump_states", () => {
    const f = fixture();
    const moving = input({ speed: 4, running: true, moving: true, moveZ: -1 });
    f.avatar.setTriggerHeld(true);
    f.advance(15, moving, 1 / 60);
    assert.equal(f.avatar.motion, PlayerMotion.Run);
    f.advance(1, { ...moving, jumped: true }, 1 / 60);
    f.advance(30, { ...moving, grounded: false }, 1 / 60);
    assert.equal(f.avatar.motion, PlayerMotion.RunJump);
    assert.equal(f.avatar.firing, true);
    f.advance(30, moving, 1 / 60);
    assert.equal(f.avatar.motion, PlayerMotion.Run);
    assert.equal(f.avatar.firing, true);
    return { states: history(f), shots: f.avatar.fireCount };
});

test("analog_gait_rate_tracks_measured_speed", () => {
    const f = fixture();
    f.advance(1, input({ moving: true, speed: 1.6, moveZ: -1 }));
    const full = f.states.get("Walk").speed;
    f.advance(1, input({ moving: true, speed: 0.4, moveZ: -1 }));
    const quarter = f.states.get("Walk").speed;
    assert.ok(Math.abs(quarter / full - 0.25) < 1e-6, "Slow analog walking must not retain a fast minimum cadence");
    return { full_speed_playback: full, quarter_speed_playback: quarter };
});

test("released_movement_does_not_follow_residual_speed", () => {
    const f = fixture();
    f.advance(1, input({ moving: true, running: true, speed: 4, moveZ: -1 }));
    assert.equal(f.avatar.motion, PlayerMotion.Run);
    f.advance(1, input({ moving: false, running: true, speed: 4 }));
    assert.equal(f.avatar.motion, PlayerMotion.Idle);
    return { stopped_on_release: true };
});

const passed = tests.filter(t => t.status === "PASS").length;
const report = {
    status: passed === tests.length ? "PASS" : "FAIL",
    checked_utc: new Date().toISOString(),
    source: path.relative(root, sourcePath).replace(/\\/g, "/"),
    source_sha256: crypto.createHash("sha256").update(source).digest("hex"),
    execution: "Transpiled production PlayerAvatar class; calls its real step() and beginAir() methods",
    scope: "State decisions and heading; rendering, native Animator transitions and Bullet physics are not simulated",
    node_version: process.version,
    typescript_version: ts.version,
    compiler_path: compilerPath,
    total: tests.length,
    passed,
    failed: tests.length - passed,
    tests
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ status: report.status, passed, failed: report.failed,
    source_sha256: report.source_sha256, report: reportPath,
    failures: tests.filter(t => t.status === "FAIL").map(({ name, error }) => ({ name, error })) }, null, 2));
process.exitCode = report.status === "PASS" ? 0 : 1;
