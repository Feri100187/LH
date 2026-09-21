#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseOptions, createRun, loadTypeScript, resolveLayaIde, counts, statusOf } = require("./context.cjs");
const suites = [
    ["player-avatar", "test-player-avatar.cjs"],
    ["player-input", "test-player-input.cjs"],
    ["player-directional", "test-player-directional.cjs"],
    ["frame-stability", "test-frame-stability.cjs"],
    ["water-shot", "test-water-shot.cjs"],
    ["watergun-integration", "test-watergun-integration.cjs"],
    ["lake-ducks", "test-lake-ducks.cjs"],
    ["asset-entry-contract", "testing/asset-entry-contract.cjs"]
];

let run;
try {
    const options = parseOptions();
    if (options.help) {
        console.log("Usage: npm test -- [--ide <LayaAir 3.4.1 installation>] [--report-dir <new directory>]\nEnvironment: LAYA_IDE_PATH and TEST_REPORT_DIR. Engine contracts are required; missing engine sources produce INCOMPLETE and exit code 2.");
        process.exit(0);
    }
    run = createRun(options);
    const ts = loadTypeScript(run.root);
    const ide = resolveLayaIde({ idePath: options.idePath, required: false });
    const typecheck = spawnSync(process.execPath, [path.join(run.root, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", path.join(run.root, "tsconfig.json")],
        { cwd: run.root, encoding: "utf8", timeout: 120000 });
    const typecheckReport = { name: "typecheck", kind: "typecheck", status: typecheck.status === 0 ? "PASS" : "FAIL",
        run_id: run.id, checked_utc: new Date().toISOString(), typescript_version: ts.version, exit_code: typecheck.status,
        stdout: typecheck.stdout || "", stderr: typecheck.stderr || "", error: typecheck.error?.message };
    fs.writeFileSync(path.join(run.directory, "typecheck.json"), JSON.stringify(typecheckReport, null, 2) + "\n", { flag: "wx" });
    console.log(`typecheck: ${typecheckReport.status}`);
    const suiteReports = [];
    for (const [id, file] of suites) {
        const args = [path.join(run.root, "tools", file)];
        if (ide) args.push("--ide", ide.root);
        const child = spawnSync(process.execPath, args, { cwd: run.root, encoding: "utf8", timeout: 120000,
            env: { ...process.env, LH_TEST_RUN_ID: run.id, LH_TEST_REPORT_DIR: run.directory } });
        fs.writeFileSync(path.join(run.directory, `${id}.log`), `${child.stdout || ""}${child.stderr || ""}`);
        const reportFile = path.join(run.directory, `${id}.json`);
        let report;
        if (fs.existsSync(reportFile)) {
            report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
            if (report.run_id !== run.id) throw new Error(`Stale or mismatched suite report: ${reportFile}`);
            const expectedExit = report.status === "PASS" ? 0 : report.status === "INCOMPLETE" ? 2 : 1;
            if (child.status !== expectedExit) throw new Error(`Suite exit/report mismatch for ${id}: ${child.status}/${report.status}`);
        } else {
            report = { suite: id, run_id: run.id, status: "FAIL", total: 1, passed: 0, failed: 1, not_tested: 0,
                tests: [{ name: "suite_execution", kind: "harness", status: "FAIL", error: child.error?.message || child.stderr || `Exit ${child.status}; no current-run report was produced` }] };
            fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
        }
        suiteReports.push(report);
        console.log(`${id}: ${report.status} (${report.passed}/${report.total} passed; ${report.not_tested || 0} not tested)`);
    }
    const allTests = [typecheckReport, ...suiteReports.flatMap(report => report.tests)];
    const tally = counts(allTests), categories = {};
    for (const kind of new Set(allTests.map(test => test.kind || "logic"))) categories[kind] = counts(allTests.filter(test => (test.kind || "logic") === kind));
    const summary = { status: statusOf(tally), run_id: run.id, started_utc: run.started, finished_utc: new Date().toISOString(),
        project_root: run.root, report_directory: run.directory, node_version: process.version, typescript_version: ts.version,
        ide: ide ? { root: ide.root, version: ide.version } : null, ...tally, categories,
        suites: suiteReports.map(report => ({ suite: report.suite, status: report.status, total: report.total, passed: report.passed,
            failed: report.failed, not_tested: report.not_tested, report: `${report.suite}.json` })),
        not_verified: [
            { check: "Live Laya rendering, real browser/OS pointer lock and touch input", status: "NOT TESTED", required_by_npm_test: false },
            { check: "Real Bullet physics execution and cross-FPS traversal speed", status: "NOT TESTED", required_by_npm_test: false },
            { check: "Rendered deformation, texture correctness and full lake obstacle/visibility audit", status: "NOT TESTED", required_by_npm_test: false }
        ] };
    const output = path.join(run.directory, "summary.json"); fs.writeFileSync(output, JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
    console.log(`\n${summary.status}: ${tally.passed}/${tally.total} required checks passed. Report: ${output}`);
    process.exitCode = tally.failed ? 1 : tally.not_tested ? 2 : 0;
} catch (error) {
    console.error(error.message);
    if (run) fs.writeFileSync(path.join(run.directory, "summary.json"), JSON.stringify({ status: "FAIL", run_id: run.id,
        finished_utc: new Date().toISOString(), stage: "test_configuration_or_harness", error: error.message, report_directory: run.directory }, null, 2) + "\n", { flag: "wx" });
    process.exitCode = 1;
}
