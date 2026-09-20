#!/usr/bin/env node
"use strict";

// Run the actual LakeDuck class against serialized routes and native mesh vertices.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const suite = require("./testing/context.cjs").createSuite("lake-ducks");
const { readWaterSurface } = require("./testing/lake-geometry.cjs");
const root = suite.root, ts = suite.ts;
const sourcePath = path.join(root, "src/LakeDuck.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const readJSON = file => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const groupPath = path.join(root, "assets/ducks/LakeDucks.lh");
const group = readJSON(groupPath), groupUUID = readJSON(groupPath + ".meta").uuid;
const scriptUUID = readJSON(sourcePath + ".meta").uuid;
const water = readWaterSurface(path.join(root, "assets/lingshui/LingshuiLake.glb"));
const routes = group._$child.map(node => {
    const p = node.transform.localPosition, settings = node._$comp.find(comp => comp._$type === scriptUUID);
    return { center_y_up: [p.x, p.y, p.z], radii_xz: [settings.radiusX, settings.radiusZ],
        period_s: settings.periodSeconds, phase_rad: settings.phaseDegrees * Math.PI / 180, direction: settings.direction };
});
const resources = new Map();
function index(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) index(file);
        else if (file.endsWith(".meta")) { const meta = readJSON(file); if (meta.uuid) resources.set(meta.uuid, file.slice(0, -5)); }
    }
}
index(path.join(root, "assets/ducks"));
const duckUUID = group._$child[0]._$child[0]._$prefab;
const duckPath = resources.get(duckUUID), duckPrefab = readJSON(duckPath);

function nativePositions(file) {
    const data = fs.readFileSync(file); let offset = 0;
    const u16 = () => { const v = data.readUInt16LE(offset); offset += 2; return v; };
    const u32 = () => { const v = data.readUInt32LE(offset); offset += 4; return v; };
    const string = () => { const size = u16(); const v = data.toString("utf8", offset, offset + size); offset += size; return v; };
    const version = string(); assert.ok(["LAYAMODEL:0501", "LAYAMODEL:0502"].includes(version), `Unsupported native mesh ${version}`);
    const dataOffset = u32(); u32(); const blockCount = u16(); const blocks = [];
    for (let i = 0; i < blockCount; i++) blocks.push({ offset: u32(), length: u32() });
    const stringOffset = u32(), stringCount = u16(); offset = dataOffset + stringOffset;
    const strings = Array.from({ length: stringCount }, string);
    for (const block of blocks) {
        offset = block.offset; const type = strings[u16()]; if (type !== "MESH") continue;
        const name = strings[u16()], buffers = u16(); assert.equal(buffers, 1);
        const vertexOffset = u32(), count = u32(), flags = strings[u16()].split(",");
        const sizes = { POSITION: 12, NORMAL: 12, COLOR: 16, UV: 8, UV1: 8, TANGENT: 16, BLENDWEIGHT: 16, BLENDINDICES: 4 };
        const stride = flags.reduce((sum, flag) => sum + sizes[flag], 0);
        const positionOffset = flags.slice(0, flags.indexOf("POSITION")).reduce((sum, flag) => sum + sizes[flag], 0);
        assert.ok(flags.includes("POSITION") && Number.isFinite(stride));
        const vertices = [];
        for (let i = 0; i < count; i++) {
            const start = dataOffset + vertexOffset + i * stride + positionOffset;
            vertices.push([data.readFloatLE(start), data.readFloatLE(start + 4), data.readFloatLE(start + 8)]);
        }
        return { file, version, name, vertices, stride, sha256: crypto.createHash("sha256").update(data).digest("hex") };
    }
    throw new Error("Mesh block not found");
}

function nodePoint(point, transform = {}) {
    const s = transform.localScale || {}, q = transform.localRotation || {}, p = transform.localPosition || {};
    let [x, y, z] = point.map((value, i) => value * (s["xyz"[i]] ?? 1));
    const qx = q.x || 0, qy = q.y || 0, qz = q.z || 0, qw = q.w ?? 1;
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    return [x + qw * tx + qy * tz - qz * ty + (p.x || 0),
        y + qw * ty + qz * tx - qx * tz + (p.y || 0), z + qw * tz + qx * ty - qy * tx + (p.z || 0)];
}
const meshes = [], modelVertices = [];
function readModel(node, ancestors = []) {
    const transforms = [...ancestors, node.transform || {}];
    for (const comp of node._$comp || []) if (comp._$type === "MeshFilter") {
        const mesh = nativePositions(resources.get(comp.sharedMesh._$uuid)); meshes.push(mesh);
        for (const original of mesh.vertices) {
            let point = original;
            for (let i = transforms.length - 1; i >= 0; i--) point = nodePoint(point, transforms[i]);
            modelVertices.push(point);
        }
    }
    for (const child of node._$child || []) readModel(child, transforms);
}
readModel(duckPrefab);

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.setValue(x, y, z); }
    setValue(x, y, z) { this.x = x; this.y = y; this.z = z; }
    clone() { return new Vector3(this.x, this.y, this.z); }
}
class Transform {
    constructor(owner) { this.owner = owner; this.p = new Vector3(); this.r = new Vector3(); this.s = new Vector3(1, 1, 1); }
    get localPosition() { return this.p.clone(); } set localPosition(v) { this.p = v.clone(); }
    get localRotationEuler() { return this.r.clone(); } set localRotationEuler(v) { this.r = v.clone(); }
    get localScale() { return this.s.clone(); } set localScale(v) { this.s = v.clone(); }
    get position() { const parent = this.owner.parent?.transform.position || new Vector3(); return new Vector3(parent.x + this.p.x, parent.y + this.p.y, parent.z + this.p.z); }
}
class Node {
    constructor(name) { this.name = name; this.children = []; this.components = []; this.parent = null; this.transform = new Transform(this); }
    addChild(node) { node.parent = this; this.children.push(node); return node; }
    getChildByName(name) { return this.children.find(node => node.name === name); }
    getChildAt(index) { return this.children[index]; } get numChildren() { return this.children.length; }
    getComponent(Type) { return this.components.find(value => value instanceof Type); }
    addComponent(Type) { const value = new Type(); value.owner = this; this.components.push(value); return value; }
}
class MeshRenderer {}
class MeshFilter {}
class UnlitMaterial { destroy() { this.destroyed = true; } }
UnlitMaterial.RENDERMODE_TRANSPARENT = 2;
const Laya = { Script: class {}, Vector3, Sprite3D: Node, MeshRenderer, MeshFilter, UnlitMaterial,
    Color: class { constructor(r, g, b, a) { Object.assign(this, { r, g, b, a }); } }, RenderState: { CULL_NONE: 0 },
    PrimitiveMesh: { _createMesh(declaration, vertices, indices) { return { vertices, indices, destroy() { this.destroyed = true; } }; } },
    VertexMesh: { getVertexDeclaration: name => name }, regClass: () => value => value, property: () => () => {}, timer: { delta: 1000 / 60, currTimer: 0 } };
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018, experimentalDecorators: true } }).outputText;
const exportsObject = {};
new Function("Laya", "exports", "document", compiled)(Laya, exportsObject, undefined);
const { LakeDuck } = exportsObject;
const vec = v => [v.x, v.y, v.z];
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);
const created = [];
function fixture(serialized) {
    const rootNode = new Node(serialized.name), p = serialized.transform.localPosition;
    rootNode.transform.localPosition = new Vector3(p.x, p.y, p.z);
    const model = rootNode.addChild(new Node("DuckModel")); model.components.push(new MeshRenderer());
    const scale = serialized._$child[0].transform.localScale;
    model.transform.localScale = new Vector3(scale.x, scale.y, scale.z);
    const actor = new LakeDuck(); actor.owner = rootNode;
    const settings = serialized._$comp.find(comp => comp._$type === scriptUUID);
    for (const [key, value] of Object.entries(settings)) if (key !== "_$type") actor[key] = value;
    actor.onStart(); created.push(actor);
    return { actor, root: rootNode, model, settings, center: [p.x, p.y, p.z], scale: [scale.x, scale.y, scale.z] };
}
function pose(f, age) {
    f.actor.age = age; f.actor.applyPose();
    return { position: vec(f.root.transform.localPosition), rotation: vec(f.root.transform.localRotationEuler),
        modelPosition: vec(f.model.transform.localPosition), modelRotation: vec(f.model.transform.localRotationEuler) };
}
function tiltedRadius(vertices, scale, degrees) {
    const pitch = degrees[0] * Math.PI / 180, roll = degrees[2] * Math.PI / 180;
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    let radius = 0;
    for (const p of vertices) {
        const x = p[0] * scale[0], y = p[1] * scale[1], z = p[2] * scale[2];
        // Laya uses yaw-pitch-roll; model yaw is zero, so apply roll then pitch.
        const xr = cr * x - sr * y, yr = sr * x + cr * y, zr = sp * yr + cp * z;
        radius = Math.max(radius, Math.hypot(xr, zr));
    }
    return radius;
}
function continuousRadiusBound(vertices, scale) {
    // Composition of <=0.7deg pitch and <=1.1deg roll rotates a vertex by at most 1.8deg.
    // Its displacement is bounded by 2*|v|*sin(angle/2), independent of both motion phases.
    const factor = 2 * Math.sin((.7 + 1.1) * Math.PI / 360);
    return Math.max(...vertices.map(p => {
        const [x, y, z] = p.map((v, i) => v * scale[i]);
        return Math.hypot(x, z) + Math.hypot(x, y, z) * factor;
    }));
}
const tests = suite.tests, routeMeasurements = [];
function test(name, body) {
    try { suite.test(name, body, { kind: name.startsWith("two_scenes_") || name.startsWith("serialized_routes_") ? "asset_contract" : "logic" }); }
    finally { for (const actor of created.splice(0)) actor.onDestroy(); }
}

test("two_scenes_each_reference_one_group_of_five_shared_ducks", () => {
    assert.equal(group._$child.length, 5);
    assert.equal(new Set(group._$child.map(node => node._$id)).size, 5);
    for (const node of group._$child) {
        assert.equal(node._$comp.filter(comp => comp._$type === scriptUUID).length, 1);
        assert.equal(node._$child.length, 1); assert.equal(node._$child[0].name, "DuckModel");
        assert.equal(node._$child[0]._$prefab, duckUUID);
    }
    const scenes = [];
    for (const filename of ["Scene.ls", "LingshuiGame.ls"]) {
        const source = readJSON(path.join(root, "assets", filename)), groups = [], directDucks = [];
        const walk = (node, ancestors = []) => {
            if (node._$prefab === groupUUID) groups.push({ node, ancestors });
            if (node._$prefab === duckUUID) directDucks.push(node);
            for (const child of node._$child || []) walk(child, [...ancestors, node]);
        };
        walk(source); assert.equal(groups.length, 1); assert.equal(directDucks.length, 0);
        for (const node of [...groups[0].ancestors, groups[0].node]) {
            const t = node.transform || {}, p = t.localPosition || {}, s = t.localScale || {}, q = t.localRotation || {};
            near(p.x || 0, 0); near(p.y || 0, 0); near(p.z || 0, 0);
            near(s.x ?? 1, 1); near(s.y ?? 1, 1); near(s.z ?? 1, 1);
            near(q.x || 0, 0); near(q.y || 0, 0); near(q.z || 0, 0); near(q.w ?? 1, 1);
        }
        scenes.push({ scene: filename, group_instances: 1, resolved_ducks: 5 });
    }
    return { scenes, group_uuid: groupUUID, shared_duck_prefab_uuid: duckUUID, native_model_vertices: modelVertices.length };
});

test("serialized_routes_fit_current_water_surface_geometry", () => {
    assert.equal(routes.length, 5); near(water.waterY, .04, 1e-6);
    const checked = [];
    for (let i = 0; i < group._$child.length; i++) {
        const f = fixture(group._$child[i]), route = routes[i];
        f.center.forEach((v, j) => near(v, route.center_y_up[j]));
        near(f.center[1], water.waterY, 1e-6);
        near(f.actor.radiusX, route.radii_xz[0]); near(f.actor.radiusZ, route.radii_xz[1]);
        near(f.actor.periodSeconds, route.period_s); near(f.actor.phaseDegrees * Math.PI / 180, route.phase_rad);
        assert.equal(f.actor.direction, route.direction); assert.ok(f.actor.bobHeight <= .006);
        assert.ok(route.period_s >= 12 && route.radii_xz.every(radius => radius >= .5 && radius <= 1.5));
        const envelope = water.envelope([f.center[0], f.center[2]], Math.max(...route.radii_xz) + .30);
        assert.equal(envelope.fully_inside, true, "The complete route plus duck body must fit the current water triangles");
        checked.push({ duck: group._$child[i].name, ...envelope });
    }
    return { water_geometry: water.evidence, routes: checked };
});

for (const serialized of group._$child) test(`${serialized.name}_multiple_cycles_waterline_tangent_bob_and_radius`, () => {
    const f = fixture(serialized), period = f.actor.periodSeconds;
    let maxYError = 0, maxEllipseError = 0, maxBob = 0, minTangentDot = 1, maxModelRadius = 0;
    const sampleCount = 3 * 128 + 1;
    for (let i = 0; i < sampleCount; i++) {
        const age = i * period / 128, p = pose(f, age);
        maxYError = Math.max(maxYError, Math.abs(p.position[1] - .04));
        const nx = (p.position[0] - f.center[0]) / f.actor.radiusX, nz = (p.position[2] - f.center[2]) / f.actor.radiusZ;
        maxEllipseError = Math.max(maxEllipseError, Math.abs(nx * nx + nz * nz - 1));
        maxBob = Math.max(maxBob, Math.abs(p.modelPosition[1]));
        near(p.modelPosition[0], 0); near(p.modelPosition[2], 0); near(p.rotation[0], 0); near(p.rotation[2], 0);
        assert.ok(Math.abs(p.modelRotation[0]) <= .7 + 1e-12 && Math.abs(p.modelRotation[2]) <= 1.1 + 1e-12);
        const previous = pose(f, age - .001).position, next = pose(f, age + .001).position;
        const vx = next[0] - previous[0], vz = next[2] - previous[2], speed = Math.hypot(vx, vz);
        assert.ok(speed > 1e-8);
        const yaw = p.rotation[1] * Math.PI / 180;
        minTangentDot = Math.min(minTangentDot, (Math.sin(yaw) * vx + Math.cos(yaw) * vz) / speed);
        maxModelRadius = Math.max(maxModelRadius, tiltedRadius(modelVertices, f.scale, p.modelRotation));
        near(f.actor.wake.transform.position.y, .049);
        vec(f.model.transform.localScale).forEach((v, j) => near(v, f.scale[j]));
        vec(f.actor.center).forEach((v, j) => near(v, f.center[j]));
    }
    assert.ok(maxYError < 1e-12); assert.ok(maxEllipseError < 1e-10);
    assert.ok(maxBob <= .006 + 1e-12); assert.ok(minTangentDot > .99999999); assert.ok(maxModelRadius <= .30);
    const radiusBound = continuousRadiusBound(modelVertices, f.scale);
    assert.ok(radiusBound <= .30 && maxModelRadius <= radiusBound);
    const result = { name: serialized.name, period_s: period, cycles: 3, samples: sampleCount, max_root_y_error_m: maxYError,
        max_ellipse_equation_error: maxEllipseError, minimum_heading_velocity_dot: minTangentDot,
        max_model_bob_m: maxBob, native_mesh_scaled_and_tilted_radius_m: maxModelRadius,
        conservative_all_tilt_phases_radius_bound_m: radiusBound, wake_y: .049 };
    routeMeasurements.push(result); return result;
});

test("absolute_pose_returns_after_1000_cycles_without_accumulation", () => {
    const results = [];
    for (const serialized of group._$child) {
        const f = fixture(serialized), initial = pose(f, .37 * f.actor.periodSeconds).position;
        // Existing transform values must not feed back into the route calculation.
        f.root.transform.localPosition = new Vector3(999, -50, -999);
        const replay = pose(f, .37 * f.actor.periodSeconds).position;
        initial.forEach((v, i) => near(v, replay[i], 1e-10));
        const final = pose(f, 1000.37 * f.actor.periodSeconds).position;
        const error = Math.hypot(...final.map((v, i) => v - initial[i]));
        assert.ok(error < 1e-8); results.push({ duck: serialized.name, cycles: 1000, position_error_m: error });
    }
    return results;
});

test("all_phase_scaled_body_separation_remains_above_0_8m", () => {
    assert.equal(routeMeasurements.length, 5); let minGap = Infinity;
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
        const a = routes[i], b = routes[j];
        const gap = Math.hypot(a.center_y_up[0] - b.center_y_up[0], a.center_y_up[2] - b.center_y_up[2])
            - Math.max(...a.radii_xz) - Math.max(...b.radii_xz)
            - routeMeasurements[i].conservative_all_tilt_phases_radius_bound_m - routeMeasurements[j].conservative_all_tilt_phases_radius_bound_m;
        minGap = Math.min(minGap, gap); assert.ok(gap >= .8);
    }
    return { minimum_all_phase_body_gap_m: minGap };
});

test("real_onUpdate_has_bounded_time_and_destroy_releases_wake_resources", () => {
    const f = fixture(group._$child[0]); let expectedAge = 0;
    for (const delta of [0, 1000 / 60, 1000 / 30, 250, -10]) {
        Laya.timer.delta = delta; f.actor.onUpdate(); expectedAge += Math.min(.05, Math.max(0, delta / 1000));
        near(f.actor.age, expectedAge); near(f.root.transform.localPosition.y, .04);
    }
    for (let i = 1; i < f.actor.wakeMesh.vertices.length; i += 3) near(f.actor.wakeMesh.vertices[i], 0);
    const mesh = f.actor.wakeMesh, material = f.actor.wakeMaterial;
    f.actor.onDestroy(); created.splice(created.indexOf(f.actor), 1);
    assert.equal(mesh.destroyed, true); assert.equal(material.destroyed, true); assert.equal(LakeDuck.activeDucks.size, 0);
    return { bounded_motion_age_s: expectedAge, wake_vertices: mesh.vertices.length / 3, resources_released: true };
});

const sha = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
suite.finish({
    scope: "Real LakeDuck.applyPose/onStart/onUpdate with lightweight Laya objects; actual prefab route settings and native mesh vertices; no live rendering",
    source: sourcePath, source_sha256: sha(sourcePath), group_prefab: groupPath, group_sha256: sha(groupPath),
    duck_prefab: duckPath, duck_prefab_sha256: sha(duckPath),
    native_meshes: meshes.map(({ file, version, name, vertices, sha256 }) => ({ file, version, name, vertices: vertices.length, sha256 })),
    water_geometry: water.evidence
});
