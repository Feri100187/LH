"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { getProjectRoot } = require("./project-config.cjs");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:@[^\s]+)?$/i;
const JSON_ASSETS = new Set([".ls", ".lh", ".lmat", ".controller", ".lavm", ".json", ".atlascfg"]);
const json = file => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const posix = file => file.split(path.sep).join("/");

function walk(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(item =>
        item.isDirectory() ? walk(path.join(directory, item.name)) : [path.join(directory, item.name)]);
}
function loadContract(root = getProjectRoot()) {
    const manifest = json(path.join(root, "config/assets.manifest.json"));
    const lock = json(path.join(root, "config/assets.lock.json"));
    if (manifest.schemaVersion !== 1 || lock.schemaVersion !== 1) throw new Error("Unsupported asset contract schema.");
    return { root, manifest, lock };
}
function readGlb(file) {
    const raw = fs.readFileSync(file);
    if (raw.subarray(0, 50).toString().startsWith("version https://git-lfs.github.com/spec/v1"))
        throw new Error(`Git LFS pointer is not restored: ${file}; run git lfs pull.`);
    if (raw.length < 20 || raw.readUInt32LE(0) !== 0x46546c67 || raw.readUInt32LE(4) !== 2)
        throw new Error(`Invalid GLB: ${file}`);
    return JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString("utf8"));
}
function metadataIndex(root) {
    const index = new Map(), duplicates = [];
    for (const file of [...walk(path.join(root, "assets")), ...walk(path.join(root, "src"))].filter(p => p.endsWith(".meta"))) {
        const meta = json(file);
        if (!meta.uuid) continue;
        if (index.has(meta.uuid)) duplicates.push({ uuid: meta.uuid, files: [index.get(meta.uuid), file] });
        index.set(meta.uuid, file.slice(0, -5));
    }
    return { index, duplicates };
}
function visitData(value, callback) {
    if (Array.isArray(value)) value.forEach(v => visitData(v, callback));
    else if (value && typeof value === "object") for (const [key, val] of Object.entries(value)) {
        callback(key, val); visitData(val, callback);
    }
}
function checkAssets(root = getProjectRoot()) {
    const { manifest, lock } = loadContract(root), checks = [], hashCache = new Map();
    const check = (name, run) => {
        try { checks.push({ name, category: "asset_contract", status: "PASS", details: run() }); }
        catch (error) { checks.push({ name, category: "asset_contract", status: "FAIL", error: error.message }); }
    };
    const hash = file => { if (!hashCache.has(file)) hashCache.set(file, sha256(file)); return hashCache.get(file); };
    check("project_engine_pin", () => {
        if (json(path.join(root, "LH.laya")).version !== manifest.engineVersion) throw new Error("Project engine version changed.");
        return manifest.engineVersion;
    });
    check("protected_runtime_bytes_and_metadata", () => {
        const errors = [];
        for (const [relative, spec] of Object.entries(lock.files)) {
            const file = path.join(root, relative);
            if (!fs.existsSync(file)) { errors.push(`Missing: ${relative}`); continue; }
            const size = fs.statSync(file).size;
            if (size < 1024 && fs.readFileSync(file).subarray(0, 50).toString().startsWith("version https://git-lfs.github.com/spec/v1"))
                errors.push(`LFS pointer: ${relative}`);
            else if (size !== spec.bytes || hash(file) !== spec.sha256) errors.push(`Changed: ${relative}`);
        }
        if (errors.length) throw new Error(errors.join("\n") + "\nRestore LFS/resources or explicitly review a new asset baseline.");
        return { files: Object.keys(lock.files).length, allMatch: true };
    });
    const { index, duplicates } = metadataIndex(root);
    check("unique_resource_UUIDs", () => { if (duplicates.length) throw new Error(JSON.stringify(duplicates)); return { uuids: index.size }; });
    check("manifest_sources_and_UUIDs", () => {
        let count = 0;
        visitData(manifest, (_key, spec) => {
            if (!spec || typeof spec !== "object" || !spec.path || !spec.sha256) return;
            const file = path.join(root, spec.path);
            if (!fs.existsSync(file) || hash(file) !== spec.sha256) throw new Error(`Manifest source differs: ${spec.path}`);
            if (spec.uuid && json(file + ".meta").uuid !== spec.uuid) throw new Error(`UUID differs: ${spec.path}`);
            count++;
        });
        return { sourcesAndPrimaryResources: count };
    });
    check("scene_and_entry_relationship", () => {
        const primary = fs.readFileSync(path.join(root, manifest.scenes.startup.path));
        const mirror = fs.readFileSync(path.join(root, manifest.scenes.mirror.path));
        if (!primary.equals(mirror)) throw new Error("Startup and mirror scene data differ.");
        if (json(path.join(root, "settings/BuildSettings.json")).startupScene !== "res://" + manifest.scenes.startup.uuid)
            throw new Error("Build startupScene does not select the approved scene.");
        return { identicalSceneData: true, startupUUID: manifest.scenes.startup.uuid };
    });
    const glbs = new Map();
    check("resource_references", () => {
        const missing = [], builtins = new Set(manifest.builtinResourceUUIDs), refs = new Set();
        for (const file of walk(path.join(root, "assets")).filter(f => JSON_ASSETS.has(path.extname(f)))) {
            let data; try { data = json(file); } catch (error) { throw new Error(`Cannot parse asset JSON ${file}: ${error.message}`); }
            visitData(data, (key, value) => {
                if (typeof value !== "string") return;
                const id = value.startsWith("res://") ? value.slice(6) : ["_$uuid", "_$prefab", "_$type"].includes(key) ? value : "";
                if (!UUID.test(id)) return;
                refs.add(id); const [base, sub] = id.split("@");
                if (builtins.has(base)) return;
                const target = index.get(base);
                if (!target || !fs.existsSync(target)) { missing.push({ file: posix(path.relative(root, file)), reference: id }); return; }
                if (sub && path.extname(target) === ".glb") {
                    if (!glbs.has(target)) glbs.set(target, readGlb(target));
                    const doc = glbs.get(target);
                    const match = /^(lm|lmat|lani)(\d+)$/.exec(sub);
                    if (match) {
                        const list = doc[{ lm: "meshes", lmat: "materials", lani: "animations" }[match[1]]] || [];
                        if (Number(match[2]) >= list.length) missing.push({ file: posix(path.relative(root, file)), reference: id });
                    }
                }
            });
        }
        if (missing.length) throw new Error(JSON.stringify(missing));
        return { distinctReferences: refs.size, builtinAllowlist: [...builtins] };
    });
    for (const name of ["player", "firstPerson", "ducks"]) check(`${name}_mesh_and_animation_contract`, () => {
        const group = manifest.groups[name], source = readGlb(path.join(root, group.sourceGlb.path)), game = readGlb(path.join(root, group.gameGlb.path));
        if (game.meshes.length !== group.meshCount) throw new Error(`Mesh count differs for ${name}`);
        const names = doc => (doc.animations || []).map(a => a.name).sort();
        if (JSON.stringify(names(source)) !== JSON.stringify([...group.sourceAnimations].sort()) ||
            JSON.stringify(names(game)) !== JSON.stringify([...group.gameAnimations].sort())) throw new Error(`Animation set differs for ${name}`);
        if (group.skinJoints && game.skins.some(skin => skin.joints.length !== group.skinJoints)) throw new Error(`Skin joint count differs for ${name}`);
        if (name === "player") {
            const ctrl = json(path.join(root, group.controller.path));
            const states = ctrl.controllerLayers[0].states.filter(s => !String(s.id).startsWith("-")).map(s => s.name);
            if (JSON.stringify(states) !== JSON.stringify(group.movementStates)) throw new Error("Movement state set differs.");
            const native = json(path.join(root, group.runtimePrefab.path));
            const animator = native._$comp.find(c => c._$type === "Animator");
            if (animator.controller?._$uuid !== group.controller.uuid || animator.controller?._$type !== "AnimationController")
                throw new Error("Native player must use the approved external AnimationController, not its historical embedded layer.");
        }
        return { meshes: game.meshes.length, gameClips: names(game) };
    });
    check("duck_group_count", () => {
        const group = manifest.groups.ducks, data = json(path.join(root, group.groupPrefab.path));
        if (data._$child.length !== group.instanceCount) throw new Error("Duck instance count differs.");
        return { instances: data._$child.length };
    });
    return { status: checks.every(c => c.status === "PASS") ? "PASS" : "FAIL", category: "asset_contract", checkedAt: new Date().toISOString(),
        root, manifestSHA256: sha256(path.join(root, "config/assets.manifest.json")), lockSHA256: sha256(path.join(root, "config/assets.lock.json")),
        passed: checks.filter(c => c.status === "PASS").length, total: checks.length, checks };
}

/** Validate the current check invocation, rather than trusting npm's exit code or an old PASS file. */
function validateCheckReport(file, { root = getProjectRoot(), runId, notBefore } = {}) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId || "")) throw new Error("Expected asset check runId must be a UUID");
    if (!fs.existsSync(file)) throw new Error(`assets:check produced no current result: ${file}`);
    const report = json(file);
    const canonical = value => {
        if (typeof value !== "string") throw new Error("Asset check project path is missing");
        const actual = fs.realpathSync(path.resolve(value)); return process.platform === "win32" ? actual.toLowerCase() : actual;
    };
    if (report.runId !== runId) throw new Error("Asset check result runId does not match this build");
    if (report.command !== "check" || report.category !== "asset_contract") throw new Error("Expected a check command asset_contract result");
    if (canonical(report.project) !== canonical(root) || canonical(report.assetCheck?.root) !== canonical(root)) throw new Error("Asset check result belongs to a different project");
    const minimumTime = Date.parse(notBefore), start = Date.parse(report.startedAt), finish = Date.parse(report.finishedAt), checked = Date.parse(report.assetCheck?.checkedAt);
    if (![minimumTime, start, finish, checked].every(Number.isFinite) || start < minimumTime - 2000 || finish < start || checked < minimumTime - 2000 || finish < minimumTime - 2000)
        throw new Error("Asset check result has missing or stale timestamps");
    const checks = report.assetCheck?.checks;
    if (report.status !== "PASS" || report.assetCheck?.status !== "PASS" || !Array.isArray(checks) || !checks.length ||
        checks.some(check => check.status !== "PASS") || report.assetCheck.passed !== checks.length || report.assetCheck.total !== checks.length)
        throw new Error("Asset check result is not a complete PASS");
    if (report.assetCheck.manifestSHA256 !== sha256(path.join(root, "config/assets.manifest.json")) ||
        report.assetCheck.lockSHA256 !== sha256(path.join(root, "config/assets.lock.json")))
        throw new Error("Asset check result does not match the current manifest/lock");
    return report;
}

module.exports = { json, sha256, walk, posix, loadContract, readGlb, metadataIndex, visitData, checkAssets, validateCheckReport };
