#!/usr/bin/env node
"use strict";
// Summarize preserved browser exports without modifying them or reclassifying
// their assertions. Logic tests, build reports and M0.1 exports are excluded.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, "../.."), directory = path.join(root, "docs/m1/runs/20260921");
const protocol = "m1-emission-settlement-v1", grouped = new Map(), excluded = [];
const countStatuses = values => values.reduce((out, value) => { out[value || "UNKNOWN"] = (out[value || "UNKNOWN"] || 0) + 1; return out; }, {});
const diff = (a, b) => Number.isFinite(a) && Number.isFinite(b) ? a - b : null;
const round = (x, n = 3) => Number.isFinite(x) ? Number(x.toFixed(n)) : null;
const training = s => s?.training || s;
function compact(value, depth = 0) {
    if (value == null || typeof value !== "object") return value;
    if (depth >= 4) return { summaryOnly: true, originalType: Array.isArray(value) ? "array" : "object" };
    if (Array.isArray(value)) return value.length <= 24 ? value.map(v => compact(v, depth + 1))
        : { length: value.length, first24: value.slice(0, 24).map(v => compact(v, depth + 1)), truncated: true };
    return Object.fromEntries(Object.entries(value).filter(([key]) => !["shots", "shotEvents", "targets", "history", "positionSamples"].includes(key))
        .map(([key, v]) => [key, compact(v, depth + 1)]));
}
for (const filename of fs.readdirSync(directory).filter(f => f.endsWith(".json")).sort()) {
    const bytes = fs.readFileSync(path.join(directory, filename)), doc = JSON.parse(bytes);
    if (doc.protocol !== protocol) { excluded.push({ file: filename, reason: "different_or_missing_protocol", protocol: doc.protocol || null }); continue; }
    for (const run of doc.history || []) {
        if (!run.runId) throw new Error(`Missing runId: ${filename}`);
        const versions = grouped.get(run.runId) || [];
        versions.push({ run, file: filename, url: doc.url, rootNotTested: doc.notTested || [],
            sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
        grouped.set(run.runId, versions);
    }
}
function summarizeCase(c) {
    const emissions = c.emissions || [], shots = c.settlements || [];
    const times = emissions.map(e => e.atMs).filter(Number.isFinite).sort((a, b) => a - b);
    const intervals = times.slice(1).map((v, i) => v - times[i]);
    const before = training(c.before), after = training(c.after), immediate = training(c.immediateRelease);
    const assertions = (c.assertions || []).map(a => ({ label: a.label, status: a.status }));
    const release = (c.assertions || []).find(a => a.actual && typeof a.actual === "object" && Number.isFinite(a.actual.postReleaseShots));
    return { label: c.label, status: c.status, inputSource: c.inputSource || null,
        inputDownAtMs: c.inputDownAtMs ?? null, inputUpAtMs: c.inputUpAtMs ?? null, inputWallSeconds: c.inputWallSeconds ?? null,
        releaseObservedAtMs: c.releaseObservedAtMs ?? null, frameRate: c.frameRate || null,
        emissions: c.emissions ? emissions.length : null, emissionIds: emissions.map(e => e.id), emissionTimesMs: times,
        receivedDelta: diff(after?.receivedEvents, before?.receivedEvents), consumedDelta: diff(after?.consumedShots, before?.consumedShots),
        acceptedSettlements: c.settlements ? shots.filter(s => s.accepted).length : null,
        targetHits: c.settlements ? shots.filter(s => s.accepted && s.result?.outcome === "target").length : null,
        targetHitsDelta: diff(after?.targetHits, before?.targetHits), completionDelta: diff(after?.completionEvents, before?.completionEvents),
        newlyCompletedSettlements: c.settlements ? shots.filter(s => s.accepted && s.newlyCompleted).length : null,
        postReleaseShots: release?.actual.postReleaseShots ?? diff(c.after?.avatar?.shots, c.immediateRelease?.avatar?.shots),
        postReleaseConsumedDelta: diff(after?.consumedShots, immediate?.consumedShots),
        shotIntervalsMs: intervals, shotIntervalMinMs: intervals.length ? Math.min(...intervals) : null,
        shotIntervalMaxMs: intervals.length ? Math.max(...intervals) : null,
        observedSettlements: shots.length, sameFrameSettlements: shots.filter(s => s.frame === s.resolvedFrame).length,
        inRangeSettlements: shots.filter(s => Number.isFinite(s.result?.distance) && s.result.distance >= 0 && s.result.distance <= 18 + 1e-7).length,
        assertions, assertionCounts: countStatuses(assertions.map(a => a.status)),
        failures: (c.assertions || []).filter(a => a.status !== "PASS").map(a => ({ label: a.label, status: a.status,
            actualSummary: compact(a.actual), expectedSummary: compact(a.expected), note: "完整 actual/expected 保留在原始 JSON 对应用例中" })),
        reason: c.reason || null };
}
const runs = [...grouped.values()].map(versions => {
    // Prefer completed/richer snapshots of the SAME run. Separate attempts have
    // separate IDs and are never replaced by a successful retry.
    versions.sort((a, b) => Number(!!b.run.endedAt) - Number(!!a.run.endedAt)
        || (b.run.cases?.length || 0) - (a.run.cases?.length || 0) || a.file.localeCompare(b.file));
    const chosen = versions[0], r = chosen.run, cases = (r.cases || []).map(summarizeCase);
    return { runId: r.runId, type: r.type, requestedView: r.requestedView, requestedFps: r.requestedFps,
        status: r.status, startedAt: r.startedAt, endedAt: r.endedAt || null, frameRate: r.frameRate || null,
        sourceFile: chosen.file, url: chosen.url, sourceCopies: versions.map(v => ({ file: v.file, sha256: v.sha256, status: v.run.status, cases: v.run.cases?.length || 0 })),
        snapshotStatusConflict: new Set(versions.map(v => v.run.status)).size > 1,
        caseCounts: countStatuses(cases.map(c => c.status)), cases,
        errors: compact(r.errors || []), respawns: compact(r.respawns || []),
        notTested: [...new Set([...(r.notTested || []), ...chosen.rootNotTested])],
        environment: compact(r.environment),
        observedSettlements: cases.reduce((n, c) => n + c.observedSettlements, 0),
        sameFrameSettlements: cases.reduce((n, c) => n + c.sameFrameSettlements, 0),
        inRangeSettlements: cases.reduce((n, c) => n + c.inRangeSettlements, 0) };
}).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
const report = { schemaVersion: 1, protocol, generatedAt: new Date().toISOString(),
    scope: "本轮浏览器真实 LayaAir 引擎报告；输入来源按原记录保留。synthetic-touch-DOM 不等于物理触屏或真实键鼠。",
    rules: ["按 runId 去重；独立失败与重试均保留", "不改写原 status/断言，不以计数正确替代整体 PASS", "实际 FPS 来源为游戏 onUpdate 调用次数/墙钟时长，非 HUD", "未验证列表是各 run 的原始边界，不被其他报告静默覆盖", "逻辑测试、构建、M0.1 与原生事件单独报告不计入本文件"],
    runCount: runs.length, runStatuses: countStatuses(runs.map(r => r.status)), runs, excluded };
fs.writeFileSync(path.join(root, "docs/m1/runtime-comparison.json"), JSON.stringify(report, null, 2) + "\n");
const esc = x => String(x ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
const num = (x, n = 3) => x == null ? "—" : String(round(x, n));
const link = r => `[${r.sourceFile}](runs/20260921/${r.sourceFile})`;
const table = (heads, rows) => ["| " + heads.join(" | ") + " |", "| " + heads.map(() => "---").join(" | ") + " |", ...rows.map(row => "| " + row.map(esc).join(" | ") + " |"), ""];
const lines = ["# M1 真实引擎数值结果", "", `自动生成：\`node tools/testing/summarize-m1.cjs\`。协议：\`${protocol}\`。`, "",
    "仅汇总本轮实际 LayaAir 浏览器报告。脚本注入的触屏 DOM 事件与真实硬件输入分开记录；逻辑桩、构建报告、M0.1 和原生输入尝试不混入这些通过计数。", "",
    "每个 runId 只统计一次；独立失败、未达到目标帧率的尝试和成功重试都保留。表中实际 FPS 为游戏更新次数/墙钟时长。原始断言与状态不作改写，发射与消费数相等不能替代完整 PASS。", "", "## 运行总览", ""];
lines.push(...table(["类型", "视角", "目标 FPS", "实际 FPS", "原状态", "用例状态数", "原始报告"], runs.map(r => [r.type, r.requestedView, r.requestedFps,
    num(r.frameRate?.actualOnUpdateHz), r.status, JSON.stringify(r.caseCounts), link(r)])));
lines.push("## 连射逐模式数据", "", "received/consumed 均为该用例开始到释放观察结束的累计计数增量；完成新增来自 completionEvents。间隔是实际发射事件时间之差。", "");
for (const r of runs.filter(r => r.type === "continuous")) {
    lines.push(`### ${r.sourceFile}`, "", `${r.requestedView}，目标 ${r.requestedFps} FPS；运行原状态 **${r.status}**。${link(r)}，runId：\`${r.runId}\`。`, "");
    lines.push(...table(["模式", "原状态", "实际 FPS", "帧率目标", "输入秒", "emit", "received Δ", "consumed Δ", "accepted", "靶命中", "完成新增", "释放后发射", "间隔 min/max ms"],
        r.cases.filter(c => c.inputWallSeconds != null).map(c => [c.label.split(" ")[0], c.status, num(c.frameRate?.actualOnUpdateHz), c.frameRate?.targetStatus, num(c.inputWallSeconds, 4),
            c.emissions, c.receivedDelta, c.consumedDelta, c.acceptedSettlements, c.targetHits, c.completionDelta, c.postReleaseShots,
            `${num(c.shotIntervalMinMs)}/${num(c.shotIntervalMaxMs)}`])));
    for (const c of r.cases.filter(c => c.status !== "PASS")) lines.push(`- ${c.label}：**${c.status}**；${c.failures.map(f => f.label).join("；") || "目标帧率未达到或记录不完整"}。`);
    lines.push("");
}
lines.push("## 功能与路线逐项结果", "");
for (const r of runs.filter(r => r.type !== "continuous")) {
    lines.push(`### ${r.sourceFile}`, "", `${r.type} / ${r.requestedView} / 目标 ${r.requestedFps} FPS / 实际 ${num(r.frameRate?.actualOnUpdateHz)} FPS / **${r.status}**。${link(r)}。`, "",
        `观测结算 ${r.observedSettlements}；同帧 ${r.sameFrameSettlements}；射程内 ${r.inRangeSettlements}。逐项断言在 JSON 中保留。`, "");
    lines.push(...table(["用例", "原状态", "断言状态数", "失败或缺口"], r.cases.map(c => [c.label, c.status, JSON.stringify(c.assertionCounts), c.failures.map(f => f.label).join("；") || c.reason || "—"])));
}
lines.push("## 保留的失败与验证边界", "",
    "`final-functional-60-fp.json` 是修复前真实命中失败：枪口射线截断在相机表面点，导致靶表面交点被排除。后续 corrected 报告验证完整枪口射程修复；旧 FAIL 没有覆盖。", "",
    "`corrected-continuous-60-fp.json` 包含发射间隔断言失败；`corrected-continuous-240-fp.json` 同时含间隔失败和未达到目标帧率的用例。fresh 重试作为新的 runId 单独列出，不把旧尝试计为 PASS。", "");
for (const r of runs.filter(r => r.status !== "PASS")) lines.push(`- ${link(r)}：${r.status}，实际 ${num(r.frameRate?.actualOnUpdateHz)} FPS。`);
lines.push("", "以下是各报告产生时声明的未验证项；后续独立人工/原生报告是否补齐，应看验收文档，不能由本汇总推断：", "");
for (const item of [...new Set(runs.flatMap(r => r.notTested))]) lines.push(`- ${item}`);
lines.push("", "完整精度、发射 ID/时间、断言状态、数据来源及排除文件清单见 [runtime-comparison.json](runtime-comparison.json)。原始 JSON 未被修改。", "");
fs.writeFileSync(path.join(root, "docs/m1/numeric-results.md"), lines.join("\n"));
console.log(JSON.stringify({ runs: runs.length, statuses: report.runStatuses, excluded: excluded.length, outputs: ["docs/m1/runtime-comparison.json", "docs/m1/numeric-results.md"] }, null, 2));
