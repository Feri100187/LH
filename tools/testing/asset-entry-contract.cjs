#!/usr/bin/env node
"use strict";

// Run the real Node entry points on copied assets. Only the IDE process boundary
// and deliberately corrupt checker output are substituted; no IDE is started.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { createSuite } = require("./context.cjs");
const { json, sha256, walk, visitData, validateCheckReport } = require("../assets-lib.cjs");
const suite = createSuite("asset-entry-contract");
const fixture = path.join(suite.run.directory, "asset-entry-fixture");
const cases = path.join(suite.run.directory, "asset-entry-cases");
const manifest = json(path.join(suite.root, "config/assets.manifest.json"));
const tooling = { kind: "tooling_contract" };
let baseline, originalBefore, fixtureBefore;

function snapshot(root) {
    return Object.fromEntries(["assets", "src", "settings"].flatMap(name => walk(path.join(root, name))).sort().map(file => {
        const stat = fs.statSync(file, { bigint: true });
        return [path.relative(root, file), { bytes: String(stat.size), mtimeNs: String(stat.mtimeNs), sha256: sha256(file) }];
    }));
}
function copy(relative) {
    const target = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(suite.root, relative), target);
}
function write(relative, value) {
    const target = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
}
function setChecker(mode = "real") {
    write("package.json", JSON.stringify({ private: true, scripts: mode === "none" ? {} : {
        "assets:check": mode === "real" ? "node tools/assets.cjs check" : "node tools/corrupt-check-result.cjs"
    } }));
}
function child(script, args, name, env = {}) {
    const result = spawnSync(process.execPath, [path.join(fixture, "tools", script), ...args], {
        cwd: fixture, encoding: "utf8", windowsHide: true, shell: false, timeout: 30000,
        env: { ...process.env, ...env }
    });
    fs.writeFileSync(path.join(cases, `${name}.log`), `${result.stdout || ""}${result.stderr || ""}`, { flag: "wx" });
    assert.ifError(result.error);
    return result;
}
function assets(command, name, extra = []) {
    const reportDir = path.join(cases, name), runId = crypto.randomUUID(), notBefore = new Date().toISOString();
    const result = child("assets.cjs", [command, "--report-dir", reportDir, "--run-id", runId, ...extra], name);
    const reportPath = path.join(reportDir, "assets-result.json");
    return { result, runId, notBefore, reportPath, report: fs.existsSync(reportPath) ? json(reportPath) : null };
}
function build(name, mode, success = false) {
    setChecker(mode);
    const reportDir = path.join(cases, name);
    const result = child("build.cjs", ["--report-dir", reportDir], name,
        { LH_ASSET_TEST_CHECK_MODE: mode, LH_ASSET_TEST_NATIVE_SUCCESS: success ? "1" : "0" });
    return { result, report: json(path.join(reportDir, "build-summary.json")), reportDir,
        boundary: path.join(reportDir, "ide-boundary.json") };
}
function requiresBaseline() { assert.equal(baseline?.status, "PASS", "Copied baseline must pass before testing mutations"); }

suite.test("real_asset_check_passes_in_isolated_project", () => {
    originalBefore = snapshot(suite.root);
    fs.mkdirSync(fixture, { recursive: false }); fs.mkdirSync(cases, { recursive: false });
    for (const name of ["assets", "src", "settings"]) fs.cpSync(path.join(suite.root, name), path.join(fixture, name), { recursive: true });
    for (const relative of ["LH.laya", "config/assets.manifest.json", "config/assets.lock.json",
        "tools/assets.cjs", "tools/assets-lib.cjs", "tools/build.cjs", "tools/run-ide.cjs"]) copy(relative);
    visitData(manifest, (_key, spec) => {
        if (spec && typeof spec === "object" && typeof spec.path === "string" && spec.sha256 && !fs.existsSync(path.join(fixture, spec.path))) copy(spec.path);
    });
    write("tools/project-config.cjs", `const path=require('node:path');
const root=path.resolve(__dirname,'..');
module.exports={getProjectRoot:()=>root,EXPECTED_LAYA_VERSION:'3.4.1',resolveLayaIde:()=>({root,version:'3.4.1'})};\n`);
    fs.renameSync(path.join(fixture, "tools/run-ide.cjs"), path.join(fixture, "tools/run-ide-real.cjs"));
    write("tools/run-ide.cjs", `const fs=require('node:fs'),path=require('node:path');
const original=require('./run-ide-real.cjs');
module.exports={...original,runIdeScript:async({run,script,request})=>{
  const reportPath=path.join(run.directory,'ide-boundary.json');
  const success=process.env.LH_ASSET_TEST_NATIVE_SUCCESS==='1'&&script==='StableBaselineTools.build';
  const result={status:success?'PASS':'FAIL',reportPath,script,request,
    error:success?undefined:'Injected IDE failure; no native process was started',
    native:success?{nativeStatus:1,engineVersion:'3.4.1',output:request.output}:undefined};
  if(success){fs.mkdirSync(request.output,{recursive:true});fs.writeFileSync(path.join(request.output,'index.html'),'<!doctype html><title>Tooling fixture</title>');}
  fs.writeFileSync(reportPath,JSON.stringify(result,null,2));return result;
}};\n`);
    write("tools/corrupt-check-result.cjs", `const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const args=process.argv.slice(2),directory=args[args.indexOf('--report-dir')+1];
const child=cp.spawnSync(process.execPath,[path.join(__dirname,'assets.cjs'),'check',...args],{encoding:'utf8',windowsHide:true});
if(child.status!==0){process.stderr.write(child.stderr||child.stdout||'Actual check failed');process.exit(1);}
const file=path.join(directory,'assets-result.json'),report=JSON.parse(fs.readFileSync(file,'utf8'));
switch(process.env.LH_ASSET_TEST_CHECK_MODE){
 case 'missing':fs.unlinkSync(file);process.exit(0);
 case 'nonce':report.runId='00000000-0000-4000-8000-000000000000';break;
 case 'time':report.startedAt=report.finishedAt=report.assetCheck.checkedAt='2000-01-01T00:00:00.000Z';break;
 case 'digest':report.assetCheck.manifestSHA256='0'.repeat(64);break;
 default:throw Error('Unknown corruption mode');
}
fs.writeFileSync(file,JSON.stringify(report,null,2));\n`);
    fixtureBefore = snapshot(fixture);
    const check = assets("check", "baseline");
    assert.equal(check.result.status, 0); baseline = check.report;
    validateCheckReport(check.reportPath, { root: fixture, runId: check.runId, notBefore: check.notBefore });
    assert.deepEqual(snapshot(fixture), fixtureBefore);
    return { checks: baseline.assetCheck.total, runtimeAndMetadataWrites: 0, report: check.reportPath };
}, tooling);

suite.test("legacy_source_override_is_rejected_before_writes", () => {
    requiresBaseline();
    const check = assets("prepare", "legacy-source", ["--source", "source_art/obsolete.glb"]);
    assert.notEqual(check.result.status, 0); assert.match(check.result.stderr, /Unknown or incomplete argument: --source/);
    assert.equal(check.report, null); assert.equal(fs.existsSync(path.join(fixture, ".baseline-cache")), false);
    return { exitCode: check.result.status, acceptedSourceOverride: false };
}, tooling);

suite.test("unapproved_source_hash_blocks_prepare_before_generation", () => {
    requiresBaseline();
    const source = path.join(fixture, manifest.groups.player.sourceGlb.path), bytes = fs.readFileSync(source);
    try {
        fs.appendFileSync(source, Buffer.from([0]));
        const check = assets("prepare", "source-hash", ["--asset", "player"]);
        assert.notEqual(check.result.status, 0); assert.equal(check.report.status, "FAIL");
        assert.match(check.report.error, /Manifest source differs:/); assert.equal(check.report.prepared, undefined);
        assert.equal(fs.existsSync(path.join(fixture, ".baseline-cache")), false);
        return { exitCode: check.result.status, generationStarted: false, report: check.reportPath };
    } finally { fs.writeFileSync(source, bytes); }
}, tooling);

suite.test("native_import_failure_cannot_be_reported_as_pass", () => {
    requiresBaseline();
    const check = assets("import", "import-failure", ["--asset", "world"]);
    assert.notEqual(check.result.status, 0); assert.equal(check.report.status, "FAIL");
    assert.equal(check.report.ideImport.status, "FAIL"); assert.match(check.report.error, /IDE asset import failed/);
    assert.equal(check.report.nativeCache, undefined); assert.equal(check.report.prepared[0].written, false);
    assert.deepEqual(snapshot(fixture), fixtureBefore);
    return { exitCode: check.result.status, nativeProcessStarted: false, runtimeAndMetadataWrites: 0, report: check.reportPath };
}, tooling);

for (const [name, mode, error] of [
    ["missing_checker", "none", /Required assets:check npm script is missing/],
    ["missing_current_result", "missing", /produced no current result/],
    ["stale_run_id", "nonce", /runId does not match/],
    ["stale_timestamp", "time", /stale timestamps/],
    ["wrong_manifest_hash", "digest", /does not match the current manifest\/lock/]
]) suite.test(`build_rejects_${name}_before_native_call`, () => {
    requiresBaseline();
    const check = build(`build-${name}`, mode);
    assert.notEqual(check.result.status, 0); assert.equal(check.report.status, "FAIL");
    assert.equal(check.report.assetsCheck.status, "FAIL"); assert.match(check.report.error, error);
    assert.equal(fs.existsSync(check.boundary), false, "Invalid checker result must prevent the native boundary call");
    return { exitCode: check.result.status, nativeBoundaryCalled: false, report: path.join(check.reportDir, "build-summary.json") };
}, tooling);

suite.test("fresh_check_forwards_manifest_build_options_and_notices", () => {
    requiresBaseline();
    const check = build("build-fresh", "real", true);
    assert.equal(check.result.status, 0, check.report.error); assert.equal(check.report.status, "PASS");
    assert.equal(check.report.assetsCheck.status, "PASS");
    const boundary = json(check.boundary);
    assert.deepEqual(boundary.request.options, manifest.build.options);
    assert.equal(boundary.request.platform, manifest.build.defaultPlatform);
    assert.equal(check.report.attribution.length, manifest.build.notices.length);
    for (const notice of manifest.build.notices) {
        assert.equal(sha256(path.join(check.report.output, notice.destination)), sha256(path.join(fixture, notice.source)));
        assert.ok(check.report.attribution.some(item => item.source === notice.source && item.output === notice.destination));
    }
    return { checks: check.report.assetsCheck.checks, options: boundary.request.options, notices: check.report.attribution,
        nativeExecution: "STUBBED; this verifies Node orchestration, not native engine build success" };
}, tooling);

suite.test("all_entry_paths_leave_runtime_metadata_and_settings_untouched", () => {
    requiresBaseline();
    assert.deepEqual(snapshot(fixture), fixtureBefore);
    assert.deepEqual(snapshot(suite.root), originalBefore);
    return { copiedProtectedFiles: Object.keys(fixtureBefore).length,
        metadataFiles: Object.keys(fixtureBefore).filter(file => file.endsWith(".meta")).length,
        changedFiles: 0, newFiles: 0, deletedFiles: 0, timestampOnlyWrites: 0 };
}, tooling);

let fixtureRemoved = false;
if (suite.tests.every(test => test.status === "PASS")) {
    const reportRoot = fs.realpathSync(suite.run.directory), target = fs.realpathSync(fixture);
    assert.equal(path.dirname(target), reportRoot); assert.equal(path.basename(target), "asset-entry-fixture");
    fs.rmSync(target, { recursive: true }); fixtureRemoved = true;
}
suite.finish({ scope: "Real asset/build entrypoints and actual copied baseline; only IDE boundary and corrupt checker output injected",
    native_ide_executions: 0, fixture_removed_after_pass: fixtureRemoved,
    limitations: ["No native IDE import/build or browser rendering was exercised by this tooling suite"] });
