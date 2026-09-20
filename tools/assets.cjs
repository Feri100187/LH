#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const cp = require("node:child_process");
const { getProjectRoot } = require("./project-config.cjs");
const { json, sha256, loadContract, readGlb, metadataIndex, checkAssets } = require("./assets-lib.cjs");
const root = getProjectRoot();

function args(argv) {
    const out = { command: argv[0] || "check", asset: "all" };
    if (!["check", "prepare", "import", "sync"].includes(out.command)) throw new Error(`Unknown command: ${out.command}`);
    for (let i = 1; i < argv.length; i++) {
        if (!["--asset", "--report-dir", "--ide", "--run-id"].includes(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith("--"))
            throw new Error(`Unknown or incomplete argument: ${argv[i]}`);
        out[{ "--asset": "asset", "--report-dir": "reportDir", "--ide": "ide", "--run-id": "runId" }[argv[i]]] = argv[++i];
    }
    if (out.runId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(out.runId))
        throw new Error("--run-id must be a UUID");
    return out;
}
function newRun(options) {
    const runId = options.runId || crypto.randomUUID(), startedAt = new Date().toISOString();
    const directory = path.resolve(root, options.reportDir || `.test-reports/assets-${startedAt.replace(/[:.]/g, "-")}-${runId.slice(0, 8)}`);
    if (fs.existsSync(directory) && fs.readdirSync(directory).length) throw new Error(`Report directory must be new or empty: ${directory}`);
    fs.mkdirSync(directory, { recursive: true });
    return { runId, startedAt, project: root, directory, category: "asset_contract" };
}
function runPython(script, argv) {
    const executable = process.env.PYTHON || "python";
    const result = cp.spawnSync(executable, [path.join(root, "tools", script), ...argv], {
        cwd: root, encoding: "utf8", windowsHide: true, env: { ...process.env, PYTHONUTF8: "1" }, maxBuffer: 8 * 1024 * 1024
    });
    if (result.error || result.status !== 0) throw new Error(`Asset preparation failed: ${script}\n${result.error || result.stderr || result.stdout}`);
    return result.stdout;
}
function selectedGroups(manifest, selected) {
    const names = selected === "all" ? ["world", "player", "firstPerson", "ducks"] : selected.split(",");
    for (const name of names) if (!Object.hasOwn(manifest.groups, name)) throw new Error(`Unknown asset group: ${name}`);
    return names;
}
function prepare(run, manifest, names) {
    const output = path.join(root, ".baseline-cache", "imports", run.runId), prepared = [];
    for (const name of names) {
        const group = manifest.groups[name];
        if (group.mode === "curated-runtime") { prepared.push({ name, mode: "verify-committed-runtime", written: false }); continue; }
        const directory = path.join(output, name); fs.mkdirSync(directory, { recursive: true });
        if (name === "player") runPython("prepare-player-assets.py", ["--output-dir", directory]);
        else if (name === "firstPerson") runPython("prepare-first-person-assets.py", ["--output-dir", directory]);
        else {
            const source = path.join(root, group.sourceGlb.path);
            if (sha256(source) !== group.sourceGlb.sha256) throw new Error(`Unapproved source: ${source}`);
            fs.copyFileSync(source, path.join(directory, path.basename(group.gameGlb.path)));
            fs.copyFileSync(path.join(root, group.gameGlb.path + ".meta"), path.join(directory, path.basename(group.gameGlb.path) + ".meta"));
        }
        const file = path.join(directory, path.basename(group.gameGlb.path)), digest = sha256(file);
        if (digest !== group.gameGlb.sha256) throw new Error(`Prepared ${name} differs from the approved runtime GLB; assets were not overwritten.`);
        prepared.push({ name, mode: group.mode, file, sha256: digest, matchesApprovedRuntime: true });
    }
    return prepared;
}
function verifyNativeCache(manifest, lock, names) {
    const { index } = metadataIndex(root), result = [];
    for (const name of names) {
        const group = manifest.groups[name];
        if (!group.nativeDirectory) continue;
        const document = readGlb(path.join(root, group.gameGlb.path)), native = json(path.join(root, group.runtimePrefab.path));
        const byName = new Map();
        const visit = node => { const filter = node._$comp?.find(c => c._$type === "MeshFilter");
            if (filter) byName.set(node.name, filter.sharedMesh._$uuid); (node._$child || []).forEach(visit); };
        visit(native);
        const pairs = [];
        for (const node of document.nodes) if (node.mesh !== undefined) {
            const uuid = byName.get(node.name), file = index.get(uuid);
            if (!file) throw new Error(`No stable native mapping for ${name}/${node.name}`);
            pairs.push({ kind: "mesh", sub: `lm${node.mesh}`, target: file });
        }
        for (const [i, animation] of (document.animations || []).entries())
            pairs.push({ kind: "animation", sub: `lani${i}`, target: path.join(root, group.nativeDirectory, animation.name + ".lani") });
        for (const pair of pairs) {
            const relative = pair.target.slice(root.length + 1).split(path.sep).join("/");
            const expected = lock.files[relative];
            if (!expected) throw new Error(`Native target is not locked: ${relative}`);
            const cache = path.join(root, "library", group.gameGlb.uuid.slice(0, 2), group.gameGlb.uuid + "@" + pair.sub + path.extname(pair.target));
            if (!fs.existsSync(cache)) throw new Error(`Import cache is missing: ${cache}; use assets:import with LayaAir 3.4.1.`);
            const digest = sha256(cache);
            if (digest !== expected.sha256) throw new Error(`Fresh ${pair.kind} differs from stable native resource: ${relative}. Nothing was overwritten.`);
            if (sha256(pair.target) !== expected.sha256) throw new Error(`Runtime native resource changed: ${relative}; restore the stable Git/LFS file.`);
        }
        result.push({ name, nativeMeshes: pairs.filter(p => p.kind === "mesh").length, nativeClips: pairs.filter(p => p.kind === "animation").length,
            cacheAndCommittedRuntimeIdentical: true, runtimeWrites: 0 });
    }
    return result;
}

async function main() {
    const options = args(process.argv.slice(2)), run = newRun(options), report = { ...run, command: options.command, status: "FAIL" };
    try {
        const { manifest, lock } = loadContract(root), names = selectedGroups(manifest, options.asset);
        report.assetCheck = checkAssets(root);
        if (report.assetCheck.status !== "PASS") throw new Error(report.assetCheck.checks.filter(c => c.status !== "PASS").map(c => c.error).join("\n"));
        if (["prepare", "import"].includes(options.command)) report.prepared = prepare(run, manifest, names);
        if (options.command === "import") {
            const { createIdeRun, runIdeScript } = require("./run-ide.cjs");
            const importRun = createIdeRun({ project: root, category: "asset_import", reportDir: path.join(run.directory, "ide-import") });
            report.ideImport = await runIdeScript({ run: importRun, idePath: options.ide, script: "StableBaselineTools.importReady",
                request: { assetPaths: names.flatMap(name => {
                    const g = manifest.groups[name]; return [g.gameGlb?.path || g.sourceGlb.path, g.runtimePrefab.path].map(p => p.replace(/^assets\//, ""));
                }) }, timeoutMs: 600000 });
            if (report.ideImport.status !== "PASS")
                throw new Error(`IDE asset import failed; committed resources were not overwritten. ${report.ideImport.error || report.ideImport.reportPath || "See native import report."}`);
            report.nativeCache = verifyNativeCache(manifest, lock, names);
        } else if (options.command === "sync") {
            // Legacy sync aliases are verification-only: never recreate UUIDs or overwrite curated files.
            report.nativeCache = verifyNativeCache(manifest, lock, names);
        } else if (!["check", "prepare"].includes(options.command)) throw new Error(`Unknown command: ${options.command}`);
        report.status = "PASS";
    } catch (error) { report.error = error.stack || String(error); process.exitCode = 1; }
    report.finishedAt = new Date().toISOString();
    const file = path.join(run.directory, "assets-result.json"); fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ status: report.status, command: report.command, report: file, error: report.error }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { prepare, verifyNativeCache };
