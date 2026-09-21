#!/usr/bin/env node
"use strict";

// Run the real TypeScript class with rendering dependencies stubbed out.
// This checks state decisions and heading math, not Bullet or Animator playback.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const suite = require("./testing/context.cjs").createSuite("player-avatar");
const root = suite.root;
const sourcePath = path.join(root, "src", "PlayerAvatar.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const ts = suite.ts;
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
    avatar.upperLayer = { defaultWeight: 0,
        getCurrentPlayState() { return { animatorState: { name: avatar.firing ? "Shoot" : "UpperIdle" }, normalizedTime: avatar.shotPhase }; } };
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

const tests = suite.tests;
function test(name, body) { suite.test(name, body); }

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

test("released_held_press_does_not_leave_queued_fire", () => {
    const f = fixture();
    f.avatar.setTriggerHeld(true); f.avatar.requestShoot();
    f.advance(1, input(), 1 / 60);
    f.avatar.setTriggerHeld(false); f.advance(3, input(), 1 / 60);
    f.avatar.setTriggerHeld(true); f.avatar.requestShoot();
    f.advance(1, input(), 1 / 60);
    f.avatar.setTriggerHeld(false); f.advance(30, input(), 1 / 60);
    assert.equal(f.avatar.fireCount, 1, "Release must discard an old request sampled while the trigger was held");
    assert.equal(f.avatar.firing, false);
    return { shots: 1, released_held_request_discarded: true };
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

// These checks drive the production class with actual delivery instants, not an idealized shot loop.
function clockFrame(f, nowMs, dt = 1 / 60, frameInput = {}) {
    const before = f.avatar.fireCount;
    f.avatar.step(dt, input({ ...frameInput, nowMs }));
    assert.ok(f.avatar.fireCount - before <= 1, "A rendered frame may emit at most one actual shot");
    return f.avatar.getStatus().shotEvents;
}

for (const fps of [13, 15, 30, 60, 120, 240]) test(`monotonic_fire_5hz_at_${fps}fps`, () => {
    const f = fixture(), origin = 1234.5, frameMs = 1000 / fps, deliveries = [];
    f.avatar.setTriggerHeld(true); f.avatar.requestShoot();
    for (let frame = 0; frame < fps * 10; frame++) {
        const now = origin + frame * frameMs; deliveries.push(now);
        clockFrame(f, now, 1 / fps);
        if (frame === 0) assert.equal(f.avatar.shotPhase, 0, "First shot must not credit dt from before it fired");
        if (frame === fps - 1) assert.equal(f.avatar.fireCount, 5, "One half-open second of held input must emit five shots");
    }
    const events = f.avatar.getStatus().shotEvents;
    assert.equal(events.length, 50, "Ten seconds must not accumulate a frame-quantization cadence drift");
    events.forEach((event, index) => {
        const ideal = origin + index * 200;
        assert.equal(event.id, index + 1);
        assert.ok(event.atMs >= ideal - .001 && event.atMs < ideal + frameMs + .001);
        assert.ok(deliveries.some(at => Math.abs(at - event.atMs) < 1e-7), "Timestamp must be an actual delivered frame time");
    });
    f.avatar.setTriggerHeld(false);
    clockFrame(f, origin + 10000, 1 / fps);
    clockFrame(f, origin + 10200, .2);
    assert.equal(f.avatar.fireCount, 50); assert.equal(f.avatar.firing, false);
    assert.equal(f.plays.filter(p => p.name === "Shoot").length, 1, "Steady held fire keeps one native animation loop");
    return { fps, first_second_shots: 5, ten_second_shots: 50, first_at_ms: events[0].atMs,
        last_at_ms: events.at(-1).atMs, released_at_ms: origin + 10000, actual_frame_timestamps: true };
});

test("jittered_frames_keep_cadence_and_real_emission_timestamps", () => {
    const f = fixture(), gaps = [7, 53, 16, 110, 14], frames = [5000];
    f.avatar.setTriggerHeld(true); clockFrame(f, frames[0], 1 / 60);
    let elapsed = 0;
    for (let index = 0; elapsed + gaps[index % gaps.length] < 4000; index++) {
        const gap = gaps[index % gaps.length]; elapsed += gap; frames.push(5000 + elapsed);
        clockFrame(f, 5000 + elapsed, gap / 1000);
    }
    const events = f.avatar.getStatus().shotEvents;
    assert.equal(events.length, 20);
    assert.ok(events.every(e => frames.includes(e.atMs)));
    f.avatar.setTriggerHeld(false); clockFrame(f, 9000, .014);
    assert.equal(f.avatar.fireCount, 20);
    return { seconds: 4, shots: events.length, maximum_frame_gap_ms: 110, actual_delivery_times: true };
});

test("late_frame_records_now_instead_of_backdating_to_deadline", () => {
    const f = fixture(); f.avatar.setTriggerHeld(true);
    let last = 4000;
    for (const at of [4000, 4070, 4150, 4240, 4350, 4470]) {
        clockFrame(f, at, (at - last) / 1000); last = at;
    }
    assert.deepEqual(f.avatar.getStatus().shotEvents.map(e => e.atMs), [4000, 4240, 4470]);
    return { observed_emissions_ms: [4000, 4240, 4470], ideal_deadlines_not_used_as_event_times: true };
});

test("one_late_frame_skips_multiple_expired_deadlines_without_burst", () => {
    const f = fixture(); f.avatar.setTriggerHeld(true);
    clockFrame(f, 0, 0); clockFrame(f, 190, .190);
    clockFrame(f, 430, .240); // Both 200 and 400ms deadlines expired during one legal frame gap.
    assert.equal(f.avatar.fireCount, 2, "Expired deadlines must collapse to one actual emission");
    clockFrame(f, 440, .010); assert.equal(f.avatar.fireCount, 2);
    clockFrame(f, 600, .160);
    assert.deepEqual(f.avatar.getStatus().shotEvents.map(e => e.atMs), [0, 430, 600]);
    return { actual_shots_ms: [0, 430, 600], discarded_deadline_ms: 200 };
});

for (const mode of ["dt", "nowMs"]) test(`long_gap_from_${mode}_cancels_held_and_queued_fire`, () => {
    const f = fixture(); f.avatar.setTriggerHeld(true); f.avatar.requestShoot();
    clockFrame(f, 1000, 1 / 60); clockFrame(f, 1100, .100); f.avatar.requestShoot();
    const resumedAt = mode === "nowMs" ? 1800 : 1200;
    clockFrame(f, resumedAt, mode === "dt" ? .5 : .016);
    assert.equal(f.avatar.fireCount, 1); assert.equal(f.avatar.triggerHeld, false);
    assert.equal(f.avatar.pendingShot, false); assert.equal(f.avatar.firing, false);
    assert.equal(f.avatar.upperWeight, 0); assert.equal(f.avatar.upperLayer.defaultWeight, 0);
    clockFrame(f, resumedAt + 100, .1); assert.equal(f.avatar.fireCount, 1);
    f.avatar.setTriggerHeld(true); f.avatar.requestShoot();
    clockFrame(f, resumedAt + 116, .016);
    assert.equal(f.avatar.fireCount, 2, "Only a fresh trigger after interruption may start another shot");
    return { gap_source: mode, shots_after_gap: 1, fresh_press_shots: 2, backlog_replayed: false };
});

test("quarter_second_gap_boundary_is_explicit", () => {
    const allowed = fixture(); allowed.avatar.setTriggerHeld(true);
    clockFrame(allowed, 0, 0); clockFrame(allowed, 250, .25);
    assert.equal(allowed.avatar.fireCount, 2); assert.equal(allowed.avatar.triggerHeld, true);
    const canceled = fixture(); canceled.avatar.setTriggerHeld(true);
    clockFrame(canceled, 0, 0); clockFrame(canceled, 250.01, .25);
    assert.equal(canceled.avatar.fireCount, 1); assert.equal(canceled.avatar.triggerHeld, false);
    return { allowed_gap_ms: 250, canceled_gap_ms: 250.01 };
});

test("new_between_frame_tap_after_release_survives_without_old_request", () => {
    const f = fixture(); f.avatar.setTriggerHeld(true); f.avatar.requestShoot();
    clockFrame(f, 1000, 0);
    f.avatar.requestShoot(); f.avatar.setTriggerHeld(false);
    assert.equal(f.avatar.pendingShot, false, "Release clears the previous held request first");
    f.avatar.requestShoot(); // Root applies the new completed tap after sampling held=false.
    clockFrame(f, 1100, .1); f.avatar.setTriggerHeld(false);
    clockFrame(f, 1200, .1); clockFrame(f, 1400, .2);
    assert.deepEqual(f.avatar.getStatus().shotEvents.map(e => e.atMs), [1000, 1200]);
    assert.equal(f.avatar.firing, false);
    return { explicit_tap_preserved: true, stale_held_request_dropped: true, shots: 2 };
});

test("cooldown_requests_are_bounded_to_one_explicit_shot", () => {
    const f = fixture(); f.avatar.requestShoot(); clockFrame(f, 0, 0);
    for (let i = 0; i < 20; i++) f.avatar.requestShoot();
    clockFrame(f, 100, .1); clockFrame(f, 200, .1);
    clockFrame(f, 400, .2); clockFrame(f, 600, .2);
    assert.equal(f.avatar.fireCount, 2); assert.equal(f.avatar.pendingShot, false);
    return { requests_while_cooling_down: 20, actual_additional_shots: 1 };
});

test("dt_fallback_is_deterministic_and_does_not_precredit_first_frame", () => {
    const f = fixture(); f.avatar.setTriggerHeld(true);
    f.advance(1, input(), .05); assert.equal(f.avatar.shotPhase, 0);
    f.advance(3, input(), .05); assert.equal(f.avatar.fireCount, 1);
    f.advance(1, input(), .05); assert.equal(f.avatar.fireCount, 2);
    assert.deepEqual(f.avatar.getStatus().shotEvents.map(e => e.atMs), [50, 250]);
    return { fallback_shots_ms: [50, 250] };
});

test("shot_event_ring_keeps_256_ordered_defensive_copies", () => {
    const f = fixture(); f.avatar.setTriggerHeld(true);
    for (let frame = 0; frame < 3600; frame++) clockFrame(f, frame * (1000 / 60), 1 / 60);
    const status = f.avatar.getStatus();
    assert.equal(f.avatar.fireCount, 300); assert.equal(status.shotEvents.length, 256);
    assert.equal(status.shotEvents[0].id, 45); assert.equal(status.shotEvents.at(-1).id, 300);
    assert.ok(status.shotEvents.every((e, i, a) => !i || (e.id === a[i - 1].id + 1 && e.atMs > a[i - 1].atMs)));
    status.shotEvents[0].atMs = -1; status.shotEvents.push({ id: -1, atMs: -1 });
    const again = f.avatar.getStatus();
    assert.equal(again.shotEvents.length, 256); assert.ok(again.shotEvents[0].atMs >= 0);
    return { emitted: 300, retained: 256, oldest_id: 45, newest_id: 300, defensive_copy: true };
});

suite.finish({
    source: path.relative(root, sourcePath).replace(/\\/g, "/"),
    source_sha256: crypto.createHash("sha256").update(source).digest("hex"),
    execution: "Transpiled production PlayerAvatar class; calls its real step() and beginAir() methods",
    scope: "State decisions, heading and monotonic firing delivery; rendering, native Animator transitions and Bullet physics are not simulated",
    compiler_path: require.resolve("typescript")
});
