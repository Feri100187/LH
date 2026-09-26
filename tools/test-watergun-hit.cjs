#!/usr/bin/env node
"use strict";
// Pure production rules with an analytic test-world adapter. NOT a Bullet/render test.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
let ts;
try { ts = require("typescript"); }
catch (error) {
    if (!process.env.TYPESCRIPT_PATH) throw new Error("Run npm ci, or explicitly set TYPESCRIPT_PATH for an alternate compiler.");
    ts = require(process.env.TYPESCRIPT_PATH);
}
const file = path.join(root, "src", "WatergunHit.ts"), source = fs.readFileSync(file, "utf8");
const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: {
    target: ts.ScriptTarget.ES2018, module: ts.ModuleKind.CommonJS, strict: true
} });
const errors = (compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, "TypeScript transpilation diagnostics");
const exportsObject = {};
new Function("exports", compiled.outputText)(exportsObject);
const { ShotGate, TrainingTarget, resolveWatergunShot } = exportsObject;
const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
const aim = { origin: v(), direction: v(0, 0, 1) };
const results = [];
function test(name, run) {
    try { run(); results.push({ name, status: "PASS" }); }
    catch (error) { results.push({ name, status: "FAIL", error: error.message }); }
}
// Spheres and finite boxes provide geometry independent of the production resolver.
function world(objects) {
    return (o, d, max, worldOnly) => {
        let nearest = null, nearestDistance = Infinity;
        for (const item of objects) {
            if (worldOnly && item.id) continue;
            let t, n = v(0, 0, -1);
            if (item.radius) {
                const q = v(o.x - item.center.x, o.y - item.center.y, o.z - item.center.z);
                const b = q.x * d.x + q.y * d.y + q.z * d.z;
                const c = q.x * q.x + q.y * q.y + q.z * q.z - item.radius * item.radius;
                const discriminant = b * b - c;
                if (discriminant < 0) continue;
                t = -b - Math.sqrt(discriminant);
                if (t < 0) t = -b + Math.sqrt(discriminant);
                n = v((o.x + d.x * t - item.center.x) / item.radius,
                    (o.y + d.y * t - item.center.y) / item.radius, (o.z + d.z * t - item.center.z) / item.radius);
            } else {
                let entry = -Infinity, exit = Infinity;
                for (const key of ["x", "y", "z"]) {
                    if (Math.abs(d[key]) < 1e-12) {
                        if (o[key] < item.min[key] || o[key] > item.max[key]) { entry = Infinity; break; }
                    } else {
                        const a = (item.min[key] - o[key]) / d[key], b = (item.max[key] - o[key]) / d[key];
                        entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
                    }
                }
                if (entry > exit || exit < 0) continue;
                t = Math.max(0, entry);
            }
            if (!Number.isFinite(t) || t < 0 || t > max || t >= nearestDistance) continue;
            nearestDistance = t;
            nearest = { point: v(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t), normal: n, targetId: item.id };
        }
        return nearest;
    };
}
const target = (id, x, z, radius = .5) => ({ id, center: v(x, 0, z), radius });
const box = (x1, x2, z1, z2) => ({ min: v(x1, -2, z1), max: v(x2, 2, z2) });
const shot = (items, options = {}) => resolveWatergunShot(options.aim || aim, options.muzzle || v(), options.guard || options.muzzle || v(), options.range || 20, world(items));

test("one authoritative event is accepted once", () => {
    const g = new ShotGate(); assert.ok(g.accept({ id: 1, atMs: 100 }, 100)); assert.ok(!g.accept({ id: 1, atMs: 100 }, 101));
});
test("out-of-order events are not replayed", () => {
    const g = new ShotGate(5); assert.ok(!g.accept({ id: 4, atMs: 100 }, 100)); assert.ok(g.accept({ id: 6, atMs: 101 }, 102));
});
test("stale emissions stay consumed after clock changes", () => {
    const g = new ShotGate(); assert.ok(!g.accept({ id: 1, atMs: 100 }, 351)); assert.ok(!g.accept({ id: 1, atMs: 100 }, 100));
});
test("future timestamps are rejected", () => assert.ok(!new ShotGate().accept({ id: 1, atMs: 101 }, 100)));
test("invalid ids/timestamps are rejected", () => {
    for (const id of [0, -1, 1.5, NaN, Infinity]) assert.ok(!new ShotGate().accept({ id, atMs: 0 }, 0));
    for (const atMs of [NaN, Infinity, -1]) assert.ok(!new ShotGate().accept({ id: 1, atMs }, 10));
});
test("no fabricated catch-up emissions on an id gap", () => {
    const g = new ShotGate(1); assert.ok(g.accept({ id: 9, atMs: 20 }, 20)); assert.equal(g.consumedId, 9);
});
test("target needs exactly three unique hits", () => {
    const t = new TrainingTarget("a"); assert.ok(t.hit(1)); assert.ok(!t.hit(1)); assert.ok(t.hit(2)); assert.ok(t.hit(3));
    assert.ok(t.complete); assert.equal(t.hits, 3); assert.ok(!t.hit(4)); assert.equal(t.hits, 3);
});
test("reset cannot replay an old hit", () => {
    const t = new TrainingTarget("a"); t.hit(5); t.reset(); assert.equal(t.hits, 0); assert.ok(!t.hit(5)); assert.ok(t.hit(6));
});
test("invalid target settings fail explicitly", () => {
    for (const n of [0, -1, 1.5, NaN]) assert.throws(() => new TrainingTarget("a", n)); assert.throws(() => new TrainingTarget(""));
});
test("centered target is hit", () => assert.equal(shot([target("near", 0, 5)]).targetId, "near"));
test("nearest target wins; no penetration", () => assert.equal(shot([target("far", 0, 9), target("near", 0, 5)]).targetId, "near"));
test("wall hides target from camera and muzzle", () => {
    const r = shot([target("a", 0, 5), box(-2, 2, 2, 2.1)]); assert.equal(r.kind, "blocked"); assert.equal(r.targetId, undefined);
});
test("shoulder camera sees target but muzzle is blocked", () => {
    const r = shot([target("a", 0, 6), box(.5, 1.5, 1.9, 2.1)], { muzzle: v(1, 0, 0) });
    assert.equal(r.kind, "blocked");
});
test("chest-to-muzzle guard prevents shooting through thin wall", () => {
    const r = shot([target("a", 0, 6), box(-1, 1, .9, 1.1)], { muzzle: v(0, 0, 2), guard: v() });
    assert.equal(r.kind, "blocked"); assert.ok(r.point.z < 1.2);
});
test("shoulder camera and world muzzle converge on aim point", () => {
    const r = shot([target("a", 0, 8)], { muzzle: v(.6, 0, 1) }); assert.equal(r.kind, "hit"); assert.equal(r.targetId, "a");
});
test("range is measured from muzzle, not rear camera", () => {
    const r = shot([target("a", 0, 21.5)], { muzzle: v(0, 0, 2), range: 20 }); assert.equal(r.targetId, "a");
});
test("out-of-range target is not hit", () => { const r = shot([target("a", 0, 25)]); assert.equal(r.kind, "miss"); assert.equal(r.point.z, 20); });
test("no-hit trace ends at finite range", () => { const r = shot([]); assert.equal(r.kind, "miss"); assert.equal(r.point.z, 20); });
test("non-unit camera direction is normalized", () => {
    assert.equal(shot([target("a", 0, 5)], { aim: { origin: v(), direction: v(0, 0, 100) } }).targetId, "a");
});
test("camera surface behind muzzle cannot cause backwards damage", () => {
    const r = shot([target("a", 0, 1)], { muzzle: v(0, 0, 2) }); assert.equal(r.kind, "blocked"); assert.equal(r.targetId, undefined);
});
test("degenerate aim and invalid range cause no physics query", () => {
    let calls = 0; const cast = () => { calls++; return null; };
    for (const direction of [v(), v(NaN, 0, 1)]) assert.equal(resolveWatergunShot({ origin: v(), direction }, v(), v(), 20, cast).kind, "invalid");
    for (const range of [0, -1, NaN, Infinity]) assert.equal(resolveWatergunShot(aim, v(), v(), range, cast).kind, "invalid");
    assert.equal(calls, 0);
});
test("returned point does not alias reusable physics hit storage", () => {
    const surface = { point: v(0, 0, 5), normal: v(0, 0, -1), targetId: "a" };
    const r = resolveWatergunShot(aim, v(), v(), 20, () => surface); surface.point.z = 99; assert.equal(r.point.z, 5);
});
test("guard cannot apply damage even if adapter returns target label", () => {
    const r = resolveWatergunShot(aim, v(0, 0, 1), v(), 20,
        () => ({ point: v(0, 0, .5), normal: v(0, 0, -1), targetId: "a" }));
    assert.equal(r.kind, "blocked"); assert.equal(r.targetId, undefined);
});
test("invalid physics coordinates fail closed", () => {
    assert.equal(resolveWatergunShot(aim, v(), v(), 20, () => ({ point: v(NaN, 0, 1), normal: v() })).kind, "invalid");
});
for (const fps of [15, 30, 60, 120, 240]) test(`same 50 source events yield 50 consumptions at ${fps} updates/s`, () => {
    const g = new ShotGate(), t = new TrainingTarget("a", 50); let latest = null, nextShot = 0, id = 0, accepted = 0;
    for (let frame = 0; frame < fps * 10; frame++) {
        const now = frame * 1000 / fps;
        if (now + 1e-7 >= nextShot && id < 50) { latest = { id: ++id, atMs: now }; nextShot += 200; }
        if (g.accept(latest, now)) { accepted++; t.hit(latest.id); }
    }
    assert.equal(accepted, 50); assert.ok(t.complete);
});
const report = { kind: "pure-logic-with-analytic-test-world", generatedAt: new Date().toISOString(),
    compilerVersion: ts.version, sourceSha256: crypto.createHash("sha256").update(source).digest("hex"),
    passed: results.filter(r => r.status === "PASS").length, total: results.length, results,
    notVerified: ["LayaAir full-project typecheck", "native 3.4.1 build", "Bullet filtering", "rendering and muzzle alignment", "physical input and browser lifecycle"] };
if (process.env.M1_REPORT_PATH) fs.writeFileSync(process.env.M1_REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed === report.total ? 0 : 1;
