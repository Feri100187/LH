"use strict";

// Current asset geometry is the input; no historical audit status or saved measurements are read.
const fs = require("node:fs");
const crypto = require("node:crypto");

function multiply(a, b) {
    const out = Array(16).fill(0);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) out[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
    return out;
}
function matrix(node) {
    if (node.matrix) return Array.from({ length: 16 }, (_, i) => node.matrix[(i % 4) * 4 + Math.floor(i / 4)]);
    const [x, y, z, w] = node.rotation || [0, 0, 0, 1], s = node.scale || [1, 1, 1], p = node.translation || [0, 0, 0];
    const m = [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), p[0],
        2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), p[1],
        2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), p[2], 0, 0, 0, 1];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[r * 4 + c] *= s[c];
    return m;
}
function transform(m, p) { return [0, 1, 2].map(r => m[r * 4] * p[0] + m[r * 4 + 1] * p[1] + m[r * 4 + 2] * p[2] + m[r * 4 + 3]); }
function inside(point, triangle) {
    const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const [a, b, c] = triangle;
    if (Math.abs(cross(a, b, c)) < 1e-10) return false;
    const signs = [cross(a, b, point), cross(b, c, point), cross(c, a, point)];
    return signs.every(v => v >= -1e-8) || signs.every(v => v <= 1e-8);
}
function segmentDistance(point, a, b) {
    const vx = b[0] - a[0], vz = b[1] - a[1], length = vx * vx + vz * vz;
    const t = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * vx + (point[1] - a[1]) * vz) / length)) : 0;
    return Math.hypot(point[0] - a[0] - vx * t, point[1] - a[1] - vz * t);
}

function readWaterSurface(file) {
    const raw = fs.readFileSync(file);
    if (raw.toString("ascii", 0, 4) !== "glTF" || raw.readUInt32LE(4) !== 2 || raw.readUInt32LE(8) !== raw.length) throw new Error("Water GLB header is invalid");
    let data, bin;
    for (let offset = 12; offset < raw.length;) {
        const size = raw.readUInt32LE(offset), type = raw.readUInt32LE(offset + 4); offset += 8;
        if (offset + size > raw.length) throw new Error("Truncated GLB chunk");
        if (type === 0x4e4f534a) data = JSON.parse(raw.toString("utf8", offset, offset + size).trim());
        if (type === 0x004e4942) bin = raw.subarray(offset, offset + size);
        offset += size;
    }
    if (!data || !bin) throw new Error("Water GLB must contain JSON and BIN chunks");
    const cache = new Map();
    function accessor(index) {
        if (cache.has(index)) return cache.get(index);
        const a = data.accessors[index], view = data.bufferViews[a.bufferView];
        if (view.buffer !== 0 || a.sparse) throw new Error("Unsupported water accessor layout");
        const widths = { SCALAR: 1, VEC3: 3 }, types = { 5121: [1, "readUInt8"], 5123: [2, "readUInt16LE"], 5125: [4, "readUInt32LE"], 5126: [4, "readFloatLE"] };
        const width = widths[a.type], type = types[a.componentType];
        if (!width || !type) throw new Error("Unsupported water position/index type");
        const [bytes, method] = type, stride = view.byteStride || bytes * width;
        const start = (view.byteOffset || 0) + (a.byteOffset || 0);
        const rows = Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, j) => bin[method](start + i * stride + j * bytes)));
        cache.set(index, rows); return rows;
    }
    const parents = new Map(), worlds = new Map();
    data.nodes.forEach((node, index) => (node.children || []).forEach(child => parents.set(child, index)));
    function world(index) {
        if (!worlds.has(index)) worlds.set(index, parents.has(index) ? multiply(world(parents.get(index)), matrix(data.nodes[index])) : matrix(data.nodes[index]));
        return worlds.get(index);
    }
    const triangles = [], heights = [], names = [];
    data.nodes.forEach((node, index) => {
        if (node.mesh === undefined || !node.name?.includes("水面") || node.name.startsWith("COL__")) return;
        names.push(node.name);
        for (const primitive of data.meshes[node.mesh].primitives) {
            if ((primitive.mode ?? 4) !== 4) throw new Error("Water primitive is not a triangle mesh");
            const vertices = accessor(primitive.attributes.POSITION).map(p => transform(world(index), p));
            const indices = primitive.indices === undefined ? vertices.map((_, i) => i) : accessor(primitive.indices).flat();
            heights.push(...vertices.map(p => p[1]));
            for (let i = 0; i < indices.length; i += 3) triangles.push(indices.slice(i, i + 3).map(j => [vertices[j][0], vertices[j][2]]));
        }
    });
    if (!triangles.length) throw new Error("No named water surface geometry found in the current GLB");
    const yMin = Math.min(...heights), yMax = Math.max(...heights);
    if (yMax - yMin > 1e-5) throw new Error("Expected the current lake to have a planar water surface");
    const edges = new Map();
    for (const triangle of triangles) for (let i = 0; i < 3; i++) {
        const points = [triangle[i], triangle[(i + 1) % 3]].map(p => p.map(v => Math.round(v * 1e5) / 1e5));
        points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const key = JSON.stringify(points), old = edges.get(key);
        edges.set(key, { points, count: old ? old.count + 1 : 1 });
    }
    const boundaries = [...edges.values()].filter(edge => edge.count === 1).map(edge => edge.points);
    return {
        waterY: (yMin + yMax) / 2,
        evidence: { file, sha256: crypto.createHash("sha256").update(raw).digest("hex"), water_nodes: names, triangles: triangles.length, boundary_edges: boundaries.length, y_range: [yMin, yMax] },
        envelope(point, radius) {
            const isInside = triangles.some(triangle => inside(point, triangle));
            const distance = Math.min(...boundaries.map(edge => segmentDistance(point, edge[0], edge[1])));
            return { center_inside_water: isInside, boundary_distance_m: distance, envelope_clearance_m: distance - radius,
                fully_inside: isInside && distance > radius };
        }
    };
}

module.exports = { readWaterSurface };
