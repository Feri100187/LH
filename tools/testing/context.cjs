"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { getProjectRoot, resolveLayaIde } = require("../project-config.cjs");

function parseOptions(argv = process.argv.slice(2)) {
    const options = {};
    for (let i = 0; i < argv.length; i++) {
        const [key, inline] = argv[i].split(/=(.*)/s, 2);
        if (key === "--help" || key === "-h") { options.help = true; continue; }
        if (key !== "--ide" && key !== "--report-dir") throw new Error(`Unknown test option: ${argv[i]}`);
        const value = inline === undefined ? argv[++i] : inline;
        if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`);
        options[key === "--ide" ? "idePath" : "reportDir"] = value;
    }
    return options;
}

function loadTypeScript(root = getProjectRoot()) {
    let ts;
    try { ts = require(path.join(root, "node_modules", "typescript")); }
    catch (_) { throw new Error("Project TypeScript is missing. Run npm ci in the project root first."); }
    if (ts.version !== "5.9.3") throw new Error(`Expected locked TypeScript 5.9.3, found ${ts.version}. Run npm ci.`);
    return ts;
}

function createRun(options = {}) {
    const root = getProjectRoot();
    const inheritedId = process.env.LH_TEST_RUN_ID;
    const inheritedDirectory = process.env.LH_TEST_REPORT_DIR;
    if (inheritedId || inheritedDirectory) {
        if (!inheritedId || !inheritedDirectory) throw new Error("Incomplete inherited test run configuration");
        const directory = path.resolve(inheritedDirectory);
        const manifest = JSON.parse(fs.readFileSync(path.join(directory, "run.json"), "utf8"));
        if (manifest.run_id !== inheritedId) throw new Error("Test run ID does not match the fresh report directory");
        return { root, id: inheritedId, directory, started: manifest.started_utc };
    }
    const id = crypto.randomUUID();
    const started = new Date().toISOString();
    const selected = options.reportDir || process.env.TEST_REPORT_DIR;
    const directory = selected ? path.resolve(selected)
        : path.join(root, ".test-reports", `${started.replace(/[:.]/g, "-")}-${id.slice(0, 8)}`);
    if (fs.existsSync(directory) && fs.readdirSync(directory).length) {
        throw new Error(`Report directory is not empty: ${directory}. Choose a new or empty directory; historical reports are never overwritten.`);
    }
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "run.json"), JSON.stringify({ run_id: id, started_utc: started, project_root: root }, null, 2) + "\n", { flag: "wx" });
    return { root, id, directory, started };
}

function counts(tests) {
    const result = { total: tests.length, passed: 0, failed: 0, not_tested: 0 };
    for (const test of tests) {
        if (test.status === "PASS") result.passed++;
        else if (test.status === "FAIL") result.failed++;
        else result.not_tested++;
    }
    return result;
}
function statusOf(result) { return result.failed ? "FAIL" : result.not_tested ? "INCOMPLETE" : "PASS"; }

function createSuite(id) {
    const options = parseOptions();
    if (options.help) {
        console.log("Usage: node tools/test-<suite>.cjs [--ide <LayaAir 3.4.1 installation>] [--report-dir <new directory>]");
        process.exit(0);
    }
    const run = createRun(options), ts = loadTypeScript(run.root);
    const ide = resolveLayaIde({ idePath: options.idePath, required: false });
    const tests = [];
    const engineSources = new Map();
    function readEngineSource(filename) {
        if (engineSources.has(filename)) return engineSources.get(filename);
        let result;
        if (!ide) result = { available: false, filename, reason: "LayaAir 3.4.1 is not configured. Pass --ide or set LAYA_IDE_PATH." };
        else {
            const file = path.join(ide.engineLibs, filename);
            if (!fs.existsSync(file)) result = { available: false, filename, path: file, reason: `Required installed engine source is missing: ${file}` };
            else {
                const raw = fs.readFileSync(file);
                result = { available: true, filename, path: file, source: raw.toString("utf8").replace(/\r\n/g, "\n"),
                    sha256: crypto.createHash("sha256").update(raw).digest("hex") };
            }
        }
        engineSources.set(filename, result); return result;
    }
    function test(name, body, settings = {}) {
        const kind = settings.kind || "logic";
        if (settings.dependency && !settings.dependency.available) {
            tests.push({ name, kind, status: "NOT TESTED", reason: settings.dependency.reason }); return;
        }
        try { tests.push({ name, kind, status: "PASS", details: body() }); }
        catch (error) { tests.push({ name, kind, status: "FAIL", error: error.message, stack: error.stack }); }
    }
    function finish(metadata = {}) {
        const tally = counts(tests), categories = {};
        for (const kind of new Set(tests.map(test => test.kind))) categories[kind] = counts(tests.filter(test => test.kind === kind));
        const report = { ...metadata, suite: id, run_id: run.id, checked_utc: new Date().toISOString(),
            project_root: run.root, node_version: process.version, typescript_version: ts.version,
            ide: ide ? { root: ide.root, version: ide.version } : null,
            engine_sources: [...engineSources.values()].map(({ source, ...evidence }) => evidence),
            status: statusOf(tally), ...tally, categories, tests };
        const output = path.join(run.directory, `${id}.json`);
        fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
        console.log(JSON.stringify({ suite: id, status: report.status, ...tally, output,
            failures: tests.filter(test => test.status !== "PASS").map(({ name, status, error, reason }) => ({ name, status, error, reason })) }, null, 2));
        process.exitCode = tally.failed ? 1 : tally.not_tested ? 2 : 0;
        return report;
    }
    return { id, root: run.root, ts, run, ide, tests, test, readEngineSource, finish };
}

module.exports = { parseOptions, loadTypeScript, createRun, createSuite, counts, statusOf, getProjectRoot, resolveLayaIde };
