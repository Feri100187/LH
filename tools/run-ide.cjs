"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { getProjectRoot, resolveLayaIde, EXPECTED_LAYA_VERSION } = require("./project-config.cjs");

function samePath(a, b) {
    const normalize = value => {
        const absolute = path.resolve(value);
        const result = fs.existsSync(absolute) ? fs.realpathSync(absolute) : absolute;
        return process.platform === "win32" ? result.toLowerCase() : result;
    };
    return typeof a === "string" && typeof b === "string" && normalize(a) === normalize(b);
}
function createIdeRun({ project = getProjectRoot(), category = "build", reportDir } = {}) {
    project = fs.realpathSync(path.resolve(project));
    if (!fs.existsSync(path.join(project, "LH.laya"))) throw new Error(`Not an LH project: ${project}`);
    if (!/^[a-z][a-z0-9_-]*$/.test(category)) throw new Error("Invalid IDE run category");
    const runId = crypto.randomUUID(), startedAt = new Date().toISOString();
    const directory = reportDir ? path.resolve(reportDir) : path.join(project, ".test-reports", `${category}-${startedAt.replace(/[:.]/g, "-")}-${runId.slice(0, 8)}`);
    if (fs.existsSync(directory) && fs.readdirSync(directory).length) throw new Error(`Report directory must be new or empty: ${directory}`);
    fs.mkdirSync(directory, { recursive: true });
    const before = Object.fromEntries(["library", "local", "release", "bin/js/bundles"].map(name => [name, fs.existsSync(path.join(project, name))]));
    const run = { runId, project, category, directory, startedAt, before };
    fs.writeFileSync(path.join(directory, "run.json"), JSON.stringify(run, null, 2) + "\n", { flag: "wx" });
    return run;
}

function terminateOwnProcessTree(child) {
    if (!Number.isInteger(child.pid) || child.pid <= 0) return;
    if (process.platform === "win32") {
        const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
        const killer = spawn(executable, ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, shell: false, stdio: "ignore" });
        killer.on("error", () => child.kill());
    } else {
        try { process.kill(-child.pid, "SIGKILL"); } catch (_) { child.kill("SIGKILL"); }
    }
}

async function runIdeScript({ run, project, category, reportDir, idePath, script, request = {}, timeoutMs = 600000 } = {}) {
    run ||= createIdeRun({ project, category, reportDir });
    const summaryPath = path.join(run.directory, "ide-run.json");
    const requestPath = path.join(run.directory, "request.json"), resultPath = path.join(run.directory, "native-result.json");
    const stdoutPath = path.join(run.directory, "ide-stdout.log"), stderrPath = path.join(run.directory, "ide-stderr.log");
    const report = { runId: run.runId, category: run.category, project: run.project, status: "FAIL", startedAt: new Date().toISOString(),
        requestPath, resultPath, stdoutPath, stderrPath, before: run.before };
    try {
        if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) throw new Error("timeoutMs must be at least 1000");
        if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(script || "")) throw new Error("A registered Class.method script is required");
        const ide = resolveLayaIde({ idePath, required: true });
        report.engineVersion = ide.version; report.ideExecutable = ide.executable;
        if (ide.version !== EXPECTED_LAYA_VERSION) throw new Error(`Expected IDE ${EXPECTED_LAYA_VERSION}`);
        if (fs.existsSync(resultPath)) throw new Error(`Refusing an existing native result: ${resultPath}`);
        const payload = { ...request, runId: run.runId, project: run.project, category: run.category,
            expectedEngineVersion: EXPECTED_LAYA_VERSION, result: resultPath };
        fs.writeFileSync(requestPath, JSON.stringify(payload, null, 2) + "\n", { flag: "wx" });
        if (requestPath.includes('"')) throw new Error("CLI request paths cannot contain a double quote");
        // Electron splits script-args on whitespace outside quotes; preserve quotes inside the switch value.
        // Isolate Chromium's cache/profile from an already open interactive IDE.
        const userDataDirectory = path.join(run.directory, "ide-user-data");
        fs.mkdirSync(userDataDirectory, { recursive: true }); report.userDataDirectory = userDataDirectory;
        const args = [`--project=${run.project}`, `--script=${script}`, `--script-args="${requestPath}"`, `--user-data-dir=${userDataDirectory}`];
        report.arguments = args; report.timeoutMs = timeoutMs;
        const stdout = fs.openSync(stdoutPath, "wx"), stderr = fs.openSync(stderrPath, "wx");
        let processResult;
        try {
            processResult = await new Promise(resolve => {
                const child = spawn(ide.executable, args, { cwd: run.project, shell: false, windowsHide: true,
                    detached: process.platform !== "win32", stdio: ["ignore", stdout, stderr] });
                let completed = false, timeout, cleanupTimeout, timedOut = false;
                const finish = value => {
                    if (completed) return; completed = true; clearTimeout(timeout); clearTimeout(cleanupTimeout);
                    resolve({ pid: child.pid, timedOut, ...value });
                };
                child.once("error", error => finish({ exitCode: null, error: error.message }));
                child.once("close", (exitCode, signal) => finish({ exitCode, signal }));
                timeout = setTimeout(() => {
                    timedOut = true; terminateOwnProcessTree(child);
                    cleanupTimeout = setTimeout(() => finish({ exitCode: null, error: "Timed out; process-tree termination did not close streams within 10 seconds" }), 10000);
                }, timeoutMs);
            });
        } finally { fs.closeSync(stdout); fs.closeSync(stderr); }
        report.process = processResult;
        if (processResult.timedOut) throw new Error(`IDE script exceeded ${timeoutMs} ms; only its spawned process tree was targeted for termination`);
        if (processResult.error) throw new Error(processResult.error);
        if (!fs.existsSync(resultPath)) throw new Error(`IDE produced no fresh native result (exit ${processResult.exitCode}); inspect this run's logs`);
        const result = JSON.parse(fs.readFileSync(resultPath, "utf8").replace(/^\uFEFF/, "")); report.native = result;
        if (result.runId !== run.runId) throw new Error("Native result runId does not match this invocation");
        if (!samePath(result.project, run.project)) throw new Error("Native result belongs to a different project");
        if (result.engineVersion !== EXPECTED_LAYA_VERSION) throw new Error(`Native result reports engine ${result.engineVersion}`);
        if (result.category !== run.category) throw new Error(`Native result category differs: ${result.category}`);
        if (!Number.isFinite(Date.parse(result.finishedAt)) || Date.parse(result.finishedAt) < Date.parse(run.startedAt) - 2000)
            throw new Error("Native result has a missing or stale completion time");
        if (result.status !== "PASS") throw new Error(result.error || "Native helper reported failure");
        if (run.category === "build" && result.nativeStatus !== 1) throw new Error(`Native BuildTaskStatus is not Success: ${result.nativeStatus}`);
        if (processResult.exitCode !== 0) throw new Error(`IDE process exited ${processResult.exitCode} despite its result`);
        report.status = "PASS";
    } catch (error) { report.error = error.stack || error.message || String(error); }
    report.finishedAt = new Date().toISOString();
    report.after = Object.fromEntries(["library", "local", "release", "bin/js/bundles"].map(name => [name, fs.existsSync(path.join(run.project, name))]));
    fs.writeFileSync(summaryPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    return { ...report, reportPath: summaryPath, directory: run.directory };
}

module.exports = { createIdeRun, runIdeScript, samePath };
