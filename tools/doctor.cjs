#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const { getProjectRoot, resolveLayaIde } = require("./project-config.cjs");
const root = getProjectRoot();
function command(executable, args) {
    const result = cp.spawnSync(executable, args, { cwd: root, encoding: "utf8", windowsHide: true, shell: false });
    if (result.error || result.status !== 0) throw new Error(String(result.error || result.stderr || result.stdout).trim());
    return result.stdout.trim();
}
function main() {
    let idePath, reportDir;
    for (let i = 2; i < process.argv.length; i++) {
        const key = process.argv[i], value = process.argv[++i];
        if (!value || !["--ide", "--report-dir"].includes(key)) throw new Error(`Unknown/incomplete argument: ${key}`);
        if (key === "--ide") idePath = value; else reportDir = value;
    }
    const runId = crypto.randomUUID(), startedAt = new Date().toISOString();
    const directory = path.resolve(root, reportDir || `.test-reports/doctor-${startedAt.replace(/[:.]/g, "-")}-${runId.slice(0, 8)}`);
    if (fs.existsSync(directory) && fs.readdirSync(directory).length) throw new Error(`Report directory must be new or empty: ${directory}`);
    fs.mkdirSync(directory, { recursive: true });
    const checks = [];
    const check = (name, fn) => { try { checks.push({ name, status: "PASS", detail: fn() }); }
        catch (error) { checks.push({ name, status: "FAIL", error: error.message }); } };
    check("Node >=20", () => { if (Number(process.versions.node.split(".")[0]) < 20) throw new Error("Node.js 20 or newer is required"); return process.version; });
    check("Locked TypeScript", () => {
        const expected = require(path.join(root, "package.json")).devDependencies.typescript;
        const actual = require(path.join(root, "node_modules/typescript/package.json")).version;
        if (actual !== expected) throw new Error(`Run npm ci: expected ${expected}, found ${actual}`);
        return actual;
    });
    check("Python >=3.10", () => command(process.env.PYTHON || "python", ["-c", "import sys; assert sys.version_info >= (3,10), 'Python 3.10+ required'; print(sys.version.split()[0])"]));
    check("Git", () => ({ version: command("git", ["--version"]), commit: command("git", ["rev-parse", "HEAD"]) }));
    check("Git LFS restored", () => {
        const version = command("git", ["lfs", "version"]);
        const files = command("git", ["lfs", "ls-files", "-l"]).split(/\r?\n/).filter(Boolean);
        const pointers = files.filter(line => /^[a-f\d]{64} - /.test(line));
        if (!files.length || pointers.length) throw new Error(`${pointers.length} unresolved LFS pointers; run git lfs install and git lfs pull`);
        return { version, files: files.length, unresolvedPointers: pointers.length };
    });
    check("LayaAir IDE 3.4.1", () => resolveLayaIde({ idePath, required: true }));
    const report = { schemaVersion: 1, runId, category: "environment", project: root, startedAt,
        status: checks.every(c => c.status === "PASS") ? "PASS" : "FAIL", checks, finishedAt: new Date().toISOString() };
    const file = path.join(directory, "doctor-result.json"); fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ ...report, report: file }, null, 2));
    if (report.status !== "PASS") process.exitCode = 1;
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
