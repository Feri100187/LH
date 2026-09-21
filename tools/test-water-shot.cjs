#!/usr/bin/env node
"use strict";

// Pure production TypeScript domain tests, not native Bullet/browser evidence.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict");
const suite = require("./testing/context.cjs").createSuite("water-shot");
const sources = {};
function load(name) {
    const source = sources[name] = fs.readFileSync(path.join(suite.root, "src", `${name}.ts`), "utf8");
    const out = suite.ts.transpileModule(source, { compilerOptions: { module: suite.ts.ModuleKind.CommonJS, target: suite.ts.ScriptTarget.ES2018 } }).outputText;
    const exports = {}; new Function("exports", out)(exports); return exports;
}
const { resolveWaterShot } = load("WaterShotResolver"), { TrainingProgress } = load("TrainingProgress");
const input = (overrides = {}) => ({ cameraOrigin: [0, 0, 0], cameraDirection: [0, 0, 1], muzzleOrigin: [0, 0, 1], muzzleAnchor: [0, 0, .5], range: 18, ...overrides });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const target = (z, id = "near", extra = {}) => ({ z, kind: "target", targetId: id, group: 4, ...extra });
const wall = (z, extra = {}) => ({ z, kind: "world", group: 1, ...extra });
function fixture(surfaces) {
    const calls = [];
    const query = (origin, direction, distance) => {
        calls.push({ origin: [...origin], direction: [...direction], distance });
        const hits = surfaces.filter(s => s.group !== 2).flatMap((s, index) => {
            if (Math.abs(direction[2]) < 1e-9) return [];
            const t = (s.z - origin[2]) / direction[2];
            const p = origin.map((n, axis) => n + direction[axis] * t);
            if (t < 0 || t > distance + 1e-8 || (s.minX !== undefined && p[0] < s.minX)
                || (s.maxX !== undefined && p[0] > s.maxX)) return [];
            return [{ distance: t, point: p, normal: [0, 0, -1], kind: s.kind, targetId: s.targetId, colliderId: index }];
        });
        hits.sort((a, b) => a.distance - b.distance || (a.kind === "world" ? -1 : 1));
        return hits[0] || null;
    };
    return { query, calls };
}
suite.test("camera_then_anchor_then_muzzle_use_normalized_finite_segments", () => {
    const f = fixture([target(8)]), r = resolveWaterShot(input({ cameraDirection: [0, 0, 3] }), f.query);
    assert.equal(r.outcome, "target"); assert.equal(r.targetId, "near"); near(r.distance, 7);
    assert.deepEqual(r.end, [0, 0, 8]); assert.equal(f.calls.length, 3);
    assert.deepEqual(f.calls.map(c => c.origin), [[0, 0, 0], [0, 0, .5], [0, 0, 1]]);
    f.calls.forEach(c => near(Math.hypot(...c.direction), 1));
});
suite.test("muzzle_query_is_full_range_when_its_surface_intersection_is_after_camera_aim_point", () => {
    let calls = 0;
    const query = (origin, direction, maxDistance) => {
        calls++;
        // Recorded native failure: camera surface is a direction hint; the
        // convex target intersection from the muzzle can lie slightly later.
        const distance = calls === 1 ? 4 : 4.003;
        if (distance > maxDistance) return null;
        return { distance, point: origin.map((n, i) => n + direction[i] * distance),
            normal: [0, 0, -1], kind: "target", targetId: "near", colliderId: 7 };
    };
    const r = resolveWaterShot(input({ muzzleOrigin: [0, 0, 0], muzzleAnchor: [0, 0, 0] }), query);
    assert.equal(r.outcome, "target"); assert.equal(r.targetId, "near");
    near(r.aimPoint[2], 4); near(r.distance, 4.003); near(r.end[2], 4.003); assert.equal(calls, 2);
});
suite.test("camera_surface_does_not_shorten_miss_stream_and_full_range_still_stops_at_wall", () => {
    for (const obstacle of [null, { kind: "world", distance: 6 }, { kind: "target", distance: 18.003 }]) {
        let calls = 0;
        const query = (origin, direction, maxDistance) => {
            calls++;
            const source = calls === 1 ? { kind: "target", distance: 4 } : obstacle;
            if (!source || source.distance > maxDistance) return null;
            return { ...source, targetId: source.kind === "target" ? "near" : undefined,
                point: origin.map((n, i) => n + direction[i] * source.distance), normal: [0, 0, -1] };
        };
        const r = resolveWaterShot(input({ muzzleOrigin: [0, 0, 0], muzzleAnchor: [0, 0, 0] }), query);
        assert.equal(r.targetId, undefined);
        if (obstacle?.kind === "world") { assert.equal(r.outcome, "world"); near(r.distance, 6); }
        else { assert.equal(r.outcome, "miss"); near(r.distance, 18); near(r.end[2], 18); }
    }
});
suite.test("closest_surface_wins_and_only_one_target_is_returned", () => {
    const r = resolveWaterShot(input(), fixture([target(12, "middle"), target(5)]).query);
    assert.equal(r.targetId, "near"); near(r.distance, 4); assert.equal(Array.isArray(r.targetId), false);
});
suite.test("camera_wall_blocks_target_behind_it", () => {
    const r = resolveWaterShot(input(), fixture([wall(4), target(8)]).query);
    assert.equal(r.outcome, "world"); assert.equal(r.targetId, undefined); near(r.end[2], 4);
});
suite.test("clear_camera_ray_does_not_override_blocked_world_muzzle_path", () => {
    const f = fixture([wall(4, { minX: .5 }), target(8)]);
    const r = resolveWaterShot(input({ muzzleOrigin: [2, 0, 1], muzzleAnchor: [2, 0, .5] }), f.query);
    assert.equal(r.outcome, "world"); near(r.aimPoint[2], 8); near(r.end[2], 4); assert.equal(r.targetId, undefined);
});
suite.test("near_wall_anchor_blocks_a_muzzle_that_has_already_crossed_the_wall", () => {
    const f = fixture([wall(.75), target(8)]), r = resolveWaterShot(input(), f.query);
    assert.equal(r.outcome, "muzzle-blocked"); assert.deepEqual(r.origin, [0, 0, .5]);
    assert.deepEqual(r.end, [0, 0, .75]); assert.equal(f.calls.length, 2); assert.equal(r.targetId, undefined);
});
suite.test("anchor_segment_prevents_a_barrel_from_passing_through_a_target", () => {
    const r = resolveWaterShot(input(), fixture([target(.75)]).query);
    assert.equal(r.outcome, "muzzle-blocked"); assert.equal(r.targetId, undefined);
});
suite.test("range_is_measured_from_world_muzzle_not_third_person_camera", () => {
    const r = resolveWaterShot(input({ cameraOrigin: [0, 0, -4] }), fixture([target(19)]).query);
    assert.equal(r.outcome, "target"); near(r.distance, 18);
});
suite.test("aimed_target_beyond_muzzle_range_is_not_awarded", () => {
    const r = resolveWaterShot(input({ cameraOrigin: [0, 0, 3] }), fixture([target(20)]).query);
    assert.equal(r.outcome, "out-of-range"); assert.equal(r.targetId, undefined); near(r.distance, 18); near(r.end[2], 19);
});
suite.test("empty_space_stream_ends_at_range_and_has_no_splash_hit", () => {
    const r = resolveWaterShot(input(), fixture([]).query);
    assert.equal(r.outcome, "miss"); assert.equal(r.hit, null); near(r.distance, 18); near(r.end[2], 19);
});
suite.test("near_camera_obstacle_behind_muzzle_never_fires_backwards", () => {
    const r = resolveWaterShot(input({ muzzleAnchor: [0, 0, 1] }), fixture([wall(.25)]).query);
    assert.equal(r.outcome, "muzzle-blocked"); near(r.distance, 0); assert.deepEqual(r.origin, r.end); assert.equal(r.hit, null);
});
suite.test("adapter_contract_keeps_world_group_and_excludes_only_self_group", () => {
    const surfaces = [{ ...target(2, "self"), group: 2 }, wall(3), target(8)];
    const r = resolveWaterShot(input(), fixture(surfaces).query);
    assert.equal(r.outcome, "world"); near(r.end[2], 3);
    return { scope: "query adapter contract fixture, not native engine collision masks" };
});
suite.test("world_target_tie_fails_closed_at_world_surface", () => {
    const r = resolveWaterShot(input(), fixture([target(8), wall(8)]).query);
    assert.equal(r.outcome, "world");
});
suite.test("invalid_vectors_ranges_and_inconsistent_query_results_are_rejected", () => {
    for (const delta of [{ range: 0 }, { range: Infinity }, { cameraDirection: [0, 0, 0] }, { muzzleOrigin: [NaN, 0, 0] }])
        assert.throws(() => resolveWaterShot(input(delta), () => null));
    assert.throws(() => resolveWaterShot(input(), () => ({ kind: "target", targetId: "near", distance: 3, point: [100, 0, 3], normal: [0, 0, -1] })));
});
suite.test("repeated_listener_consumption_and_out_of_order_ids_never_double_award", () => {
    const p = new TrainingProgress(["near", "middle", "cover"]);
    assert.equal(p.consume(1, "near").newlyCompleted, true);
    assert.equal(p.consume(1, "middle").accepted, false);
    assert.equal(p.consume(0, "cover").accepted, false);
    assert.equal(p.consume(3, "near").newlyCompleted, false);
    assert.equal(p.consume(2, "middle").accepted, false);
    assert.deepEqual(p.getStatus().completedIds, ["near"]); assert.equal(p.getStatus().consumedShots, 2);
    assert.equal(p.getStatus().targetHits, 2); assert.equal(p.getStatus().completionEvents, 1);
});
suite.test("miss_unknown_target_and_invalid_ids_cannot_increase_progress", () => {
    const p = new TrainingProgress(["near", "middle", "cover"]);
    for (const id of [-1, 0, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(p.consume(id, "near").accepted, false);
    assert.equal(p.consume(1).accepted, true); assert.equal(p.consume(2, "other").accepted, true);
    assert.equal(p.getStatus().completed, 0); assert.equal(p.getStatus().consumedShots, 2);
});
suite.test("three_targets_complete_once_and_reset_preserves_emission_watermark", () => {
    const p = new TrainingProgress(["near", "middle", "cover"]);
    ["near", "middle", "cover"].forEach((id, i) => p.consume(i + 1, id));
    assert.equal(p.getStatus().complete, true); assert.equal(p.getStatus().completionEvents, 3);
    p.reset(5); p.reset(2);
    assert.equal(p.consume(4, "near").accepted, false); assert.equal(p.consume(5, "near").accepted, false);
    assert.equal(p.getStatus().completed, 0);
    ["near", "middle", "cover"].forEach((id, i) => p.consume(i + 6, id));
    assert.equal(p.getStatus().complete, true); assert.equal(p.getStatus().completionEvents, 6);
    assert.equal(p.getStatus().consumedShots, 6); assert.equal(p.getStatus().resetCount, 2);
});
suite.test("status_copies_cannot_mutate_domain_state", () => {
    const ids = ["near", "middle", "cover"], p = new TrainingProgress(ids); ids[0] = "bad";
    p.consume(1, "near"); const state = p.getStatus(); state.completedIds.length = 0; state.targetIds.length = 0;
    assert.equal(p.getStatus().completed, 1); assert.equal(p.getStatus().total, 3);
    assert.throws(() => new TrainingProgress(["near", "near", "cover"])); assert.throws(() => p.reset(-1));
});
suite.test("same_emissions_at_15_30_60_120_240_fps_produce_equal_numeric_settlement", () => {
    const reports = [];
    // This tests event consumption independently of renderer cadence. Actual
    // emission timing remains PlayerAvatar's responsibility and is not mocked as
    // evidence that hardware can reach any requested FPS.
    for (const fps of [15, 30, 60, 120, 240]) {
        const p = new TrainingProgress(["near", "middle", "cover"]); let shots = 0;
        for (let frame = 0; frame < fps * 2; frame++) {
            const emitted = Math.floor(frame * 5 / fps) + 1;
            if (emitted > shots) {
                shots = emitted;
                const r = resolveWaterShot(input(), fixture([target(8)]).query);
                assert.equal(p.consume(shots, r.targetId).accepted, true);
                assert.equal(p.consume(shots, "middle").accepted, false);
            }
        }
        const s = p.getStatus(); assert.equal(s.consumedShots, 10); assert.equal(s.targetHits, 10); assert.equal(s.completionEvents, 1);
        reports.push({ fps, shots: s.consumedShots, hits: s.targetHits, completions: s.completionEvents });
    }
    return { reports, scope: "event-domain replay only; no scheduling or engine evidence" };
});
suite.finish({ production_sources: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, crypto.createHash("sha256").update(source).digest("hex")])),
    not_verified: ["Native Bullet ray masks and collision geometry", "Actual frame rate/emission timing", "Browser hardware input and visual alignment"] });
