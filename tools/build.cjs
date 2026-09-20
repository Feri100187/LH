#!/usr/bin/env node
"use strict";

const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { getProjectRoot, resolveLayaIde } = require("./project-config.cjs");
const { createIdeRun, runIdeScript, samePath } = require("./run-ide.cjs");

function parseOptions(args) {
    const options = { timeoutMs: 600000 };
    for (let i = 0; i < args.length; i++) {
        const [key, inline] = args[i].split(/=(.*)/s, 2);
        if (key === "--help" || key === "-h") { options.help = true; continue; }
        if (["web", "single-html"].includes(key)) { options.platform = key; continue; }
        const field = { "--platform": "platform", "--ide": "idePath", "--report-dir": "reportDir", "--output": "output", "--timeout-ms": "timeoutMs" }[key];
        if (!field) throw new Error(`Unknown build option: ${key}`);
        const value = inline === undefined ? args[++i] : inline;
        if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`);
        options[field] = field === "timeoutMs" ? Number(value) : value;
    }
    if (options.platform && !["web", "single-html"].includes(options.platform)) throw new Error("Supported platforms: web, single-html");
    return options;
}
function contains(parent, child) { const relative = path.relative(parent, child); return !relative || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative)); }
function realDestination(value) {
    let existing = path.resolve(value); const suffix = [];
    while (!fs.existsSync(existing)) { suffix.unshift(path.basename(existing)); const parent = path.dirname(existing); if (parent === existing) break; existing = parent; }
    return path.join(fs.realpathSync(existing), ...suffix);
}
function outputPath(project, selected, platform, outputRoot = "release") {
    project = fs.realpathSync(project);
    const output = realDestination(path.resolve(project, selected || path.join(outputRoot, platform)));
    if (contains(output, project)) throw new Error("Build output cannot be the project root or one of its ancestors");
    for (const protectedName of ["assets", "src", "settings", "packages", "source_art", "engine", "tools", "docs", ".git", "node_modules"])
        if (contains(path.join(project, protectedName), output)) throw new Error(`Build output cannot be inside ${protectedName}`);
    if (!contains(path.join(project, "release"), output) && fs.existsSync(output) && fs.readdirSync(output).length)
        throw new Error("Custom output must be new/empty; repeatable generated builds may use the project's release directory");
    return output;
}
function findNpmCli() {
    const candidates = [process.env.npm_execpath,
        path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
        path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")].filter(Boolean);
    for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
    throw new Error("npm CLI is unavailable; invoke this entry through npm or install npm beside Node.js");
}
function copyCredits(project, output, notices) {
    if (!Array.isArray(notices) || !notices.length) throw new Error("Build manifest must define attribution notices");
    return notices.map(({ source, destination }) => {
        if (typeof source !== "string" || typeof destination !== "string" || !source || !destination || path.isAbsolute(source) || path.isAbsolute(destination))
            throw new Error("Attribution source and destination must be relative paths");
        const input = realDestination(path.resolve(project, source)), target = realDestination(path.resolve(output, destination));
        if (!contains(fs.realpathSync(project), input) || !contains(realDestination(output), target)) throw new Error("Attribution paths must stay inside the project and build output");
        if (!fs.existsSync(input) || !fs.statSync(input).isFile() || fs.statSync(input).size === 0) throw new Error(`Required complete asset attribution/license is missing: ${input}`);
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(input, target);
        const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
        const sha256 = hash(input); if (hash(target) !== sha256) throw new Error(`Attribution copy did not match: ${target}`);
        return { source, output: destination, bytes: fs.statSync(target).size, sha256 };
    });
}

async function main() {
    const options = parseOptions(process.argv.slice(2));
    if (options.help) {
        console.log("Usage: node tools/build.cjs [--platform web|single-html] [--ide <LayaAir 3.4.1>] [--report-dir <new directory>] [--output <directory>] [--timeout-ms 600000]"); return;
    }
    const project = fs.realpathSync(getProjectRoot());
    const run = createIdeRun({ project, category: "build", reportDir: options.reportDir });
    const summary = { runId: run.runId, category: "build", project, platform: options.platform, startedAt: run.startedAt, status: "FAIL", before: run.before };
    const reportPath = path.join(run.directory, "build-summary.json");
    try {
        const { loadContract, sha256, validateCheckReport } = require("./assets-lib.cjs");
        const build = loadContract(project).manifest.build;
        if (!build || !Array.isArray(build.platforms) || !build.platforms.length || build.platforms.some(platform => !["web", "single-html"].includes(platform)) ||
            !build.platforms.includes(build.defaultPlatform) || typeof build.outputRoot !== "string" || !build.outputRoot ||
            !build.options || typeof build.options !== "object" || Array.isArray(build.options)) throw new Error("Invalid build configuration in assets.manifest.json");
        options.platform ||= build.defaultPlatform;
        if (!build.platforms.includes(options.platform)) throw new Error(`Platform ${options.platform} is not enabled by the asset manifest`);
        summary.platform = options.platform; summary.buildOptions = build.options;
        summary.manifestSHA256 = sha256(path.join(project, "config/assets.manifest.json"));
        const ide = resolveLayaIde({ idePath: options.idePath, required: true });
        const output = outputPath(project, options.output, options.platform, build.outputRoot); summary.output = output;
        if (contains(output, run.directory) || contains(run.directory, output)) throw new Error("Build output and run report directory must be separate");
        const packageFile = path.join(project, "package.json");
        const scripts = fs.existsSync(packageFile) ? JSON.parse(fs.readFileSync(packageFile, "utf8")).scripts || {} : {};
        if (scripts["assets:check"]) {
            const checkDirectory = path.join(run.directory, "assets-check"), checkRunId = crypto.randomUUID(), checkStartedAt = new Date().toISOString();
            const checkReport = path.join(checkDirectory, "assets-result.json");
            if (fs.existsSync(checkDirectory)) throw new Error("Asset check directory already exists before this invocation");
            const check = spawnSync(process.execPath, [findNpmCli(), "run", "assets:check", "--", "--report-dir", checkDirectory, "--run-id", checkRunId],
                { cwd: project, shell: false, windowsHide: true, encoding: "utf8", timeout: options.timeoutMs,
                    env: { ...process.env, LAYA_IDE_PATH: ide.root } });
            fs.writeFileSync(path.join(run.directory, "assets-check.log"), `${check.stdout || ""}${check.stderr || ""}`);
            summary.assetsCheck = { status: "FAIL", runId: checkRunId, report: checkReport, exitCode: check.status, error: check.error?.message };
            if (check.status !== 0) throw new Error("assets:check failed; see this run's assets-check.log");
            const validated = validateCheckReport(checkReport, { root: project, runId: checkRunId, notBefore: checkStartedAt });
            if (validated.assetCheck.manifestSHA256 !== summary.manifestSHA256) throw new Error("Build manifest changed during asset checking");
            summary.assetsCheck.status = "PASS"; summary.assetsCheck.checks = validated.assetCheck.total;
        } else {
            summary.assetsCheck = { status: "FAIL", reason: "Required assets:check npm script is missing" };
            throw new Error(summary.assetsCheck.reason);
        }
        console.log(`Building ${options.platform} with LayaAir ${ide.version}; report directory: ${run.directory}`);
        const execution = await runIdeScript({ run, idePath: ide.root, script: "StableBaselineTools.build", timeoutMs: options.timeoutMs,
            request: { platform: options.platform, output, options: { ...build.options } } });
        summary.ideRun = path.basename(execution.reportPath); summary.nativeStatus = execution.native?.nativeStatus;
        summary.engineVersion = execution.native?.engineVersion || execution.engineVersion;
        summary.process = execution.process;
        if (execution.status !== "PASS") throw new Error(execution.error || "Native IDE invocation failed");
        if (!samePath(execution.native.output, output)) throw new Error("Native build output differs from the requested directory");
        const htmlFiles = fs.readdirSync(output).filter(name => name.toLowerCase().endsWith(".html") && fs.statSync(path.join(output, name)).isFile());
        if (!htmlFiles.length || (options.platform === "web" && !htmlFiles.includes("index.html"))) throw new Error("Native Success result has no expected HTML entry artifact");
        summary.entries = htmlFiles.map(name => {
            const file = path.join(output, name), bytes = fs.statSync(file).size;
            if (bytes === 0) throw new Error(`Build entry is empty: ${file}`);
            return { path: name, bytes, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") };
        });
        summary.attribution = copyCredits(project, output, build.notices); summary.status = "PASS";
    } catch (error) { summary.error = error.stack || error.message || String(error); }
    summary.finishedAt = new Date().toISOString();
    summary.after = Object.fromEntries(["library", "local", "release", "bin/js/bundles"].map(name => [name, fs.existsSync(path.join(project, name))]));
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ status: summary.status, platform: summary.platform, output: summary.output, nativeStatus: summary.nativeStatus, report: reportPath, error: summary.error }, null, 2));
    process.exitCode = summary.status === "PASS" ? 0 : 1;
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { parseOptions, outputPath, copyCredits };
