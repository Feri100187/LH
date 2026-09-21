/* Explicit localhost-only M1 engine acceptance. Not a production script.
 * Synthetic touch DOM input is labelled as such; this does not verify hardware.
 * Only setup teleports. No fake clock, manual update, direct shot or consume call. */
(() => {
    "use strict";
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(location.hostname)
        || document.getElementById("m1-runtime-panel")) return;
    const now = () => performance.now(), clone = value => JSON.parse(JSON.stringify(value));
    const iso = () => new Date().toISOString(), angle = a => Math.atan2(Math.sin(a), Math.cos(a));
    const targets = { near: [-23, 2.3, 41], medium: [-12, 2.3, 42], covered: [-33, 2.3, 40] };
    const spawn = [-26, 1.74, 37.2], flank = [-30, 1.66, 40.2];
    const report = { schemaVersion: 1, protocol: "m1-emission-settlement-v1", createdAt: iso(), url: location.href,
        status: "IDLE", active: null, history: [], errors: [], nativeActivity: [],
        boundaries: ["Synthetic touch PointerEvents through original controls; not real mouse/F/touch hardware",
            "Explicit setup teleport only; measurement position comes after physics and camera follow",
            "Actual game.onUpdate count and performance.now; no timer replacement or manual updates",
            "Raycast, target response and shot emission execute in the actual loaded game",
            "Native background restoration and visual quality require separate verification"],
        notTested: ["native desktop pointer lock", "physical F key", "physical touchscreen", "native browser background/resume", "visual splash and stream review"] };
    let panel, message, output, fpsSelect, viewSelect, active = null, sequence = 0, pointerId = 85000;
    const startButtons = [];
    class Incomplete extends Error { constructor(message) { super(message); this.name = "Incomplete"; } }
    function game() {
        const g = window.lingshuiGame;
        if (!g?.getStatus || !g.getStatus().training || !g.getStatus().ready) throw new Incomplete("M1 游戏未就绪。");
        return g;
    }
    function inputsClear(s) {
        return !(s.keys?.length || s.triggerHeld || s.avatar?.triggerHeld || s.touch?.moving
            || s.touch?.shooting || s.touch?.pointers || s.touch?.shootPointers || s.touch?.running);
    }
    function publish() {
        if (!panel) return;
        report.status = active ? "RUNNING" : report.history.at(-1)?.status || "IDLE";
        report.active = active ? { runId: active.result.runId, phase: active.phase,
            elapsedMs: now() - active.started, frames: active.frames.length, samples: active.samples.length } : null;
        report.updatedAt = iso();
        // Keep every original run in memory/download. DOM polling must not re-serialize
        // all old frame/shot arrays while another quantitative measurement is running.
        const summary = run => ({ runId: run.runId, type: run.type, status: run.status,
            requestedFps: run.requestedFps, requestedView: run.requestedView, startedAt: run.startedAt, endedAt: run.endedAt,
            caseCount: run.cases.length, failedCases: run.cases.filter(c => c.status === "FAIL").map(c => c.label),
            incompleteCases: run.cases.filter(c => c.status === "INCOMPLETE").map(c => c.label), summaryOnly: true });
        const exposedHistory = active ? report.history.map(summary) : report.history.length ? [report.history.at(-1)] : [];
        panel.dataset.m1Status = JSON.stringify({ ...report, history: exposedHistory,
            previousRunIds: report.history.slice(0, active ? undefined : -1).map(run => run.runId),
            historyDelivery: active ? "summaries-only while measuring; download retains all full original runs"
                : "latest full run only; download retains all full original runs" });
        output.textContent = (active?.result.cases || report.history.at(-1)?.cases || []).slice(-6).map(c => `${c.status} ${c.label}`).join("\n");
        for (const button of startButtons) button.disabled = !!active;
    }
    function say(t, value) { t.phase = value; message.textContent = value; publish(); }
    function guard(t) {
        if (active !== t || t.cancelReason) throw new Incomplete(t.cancelReason || "当前测试已经停止。");
        if (window.lingshuiGame !== t.game) throw new Incomplete("游戏实例已改变。");
        if (document.hidden || !document.hasFocus()) throw new Incomplete("真实页面后台或失焦使本次样本无效。");
        if (now() - t.started > 180000) throw new Incomplete("单轮超过180秒，保留已有证据。");
    }
    async function wait(ms, t) {
        const end = now() + ms;
        while (now() < end) { guard(t); await new Promise(resolve => setTimeout(resolve, Math.min(35, Math.max(1, end - now())))); }
        guard(t);
    }
    function control(selector) {
        const e = document.querySelector(`#lingshui-hud ${selector}`), b = e?.getBoundingClientRect();
        if (!e?.isConnected || !b || b.width < 2 || b.height < 2) throw new Incomplete(`触屏控件 ${selector} 不可用，请使用 controls=touch。`);
        return { e, b };
    }
    function dispatch(type, p, element = document) {
        element.dispatchEvent(new PointerEvent(type, { pointerId: p.id, pointerType: "touch", isPrimary: p.primary,
            clientX: p.x, clientY: p.y, button: type === "pointermove" ? -1 : 0,
            buttons: /up|cancel/.test(type) ? 0 : 1, pressure: /up|cancel/.test(type) ? 0 : .5,
            bubbles: true, cancelable: true, composed: true }));
    }
    function press(t, selector) {
        const { e, b } = control(selector), p = { id: ++pointerId, selector, primary: t.pointers.size === 0,
            x: b.left + b.width / 2, y: b.top + b.height / 2, rect: b };
        t.pointers.set(p.id, p); dispatch("pointerdown", p, e);
        t.result.inputs.push({ type: "pointerdown", atMs: now(), id: p.id, selector, synthetic: true }); return p;
    }
    function lift(t, p) {
        if (!t.pointers.has(p.id)) return;
        dispatch("pointerup", p); t.pointers.delete(p.id);
        t.result.inputs.push({ type: "pointerup", atMs: now(), id: p.id, selector: p.selector, synthetic: true });
    }
    function tap(t, selector) { const p = press(t, selector); lift(t, p); }
    function release(t) { for (const p of [...t.pointers.values()]) lift(t, p); }
    function stop(reason) { if (active) { active.cancelReason = reason; release(active); publish(); } }
    function install(t, target, name, wrap) {
        if (!target || typeof target[name] !== "function") throw new Incomplete(`缺少实际引擎观测点 ${name}`);
        const own = Object.getOwnPropertyDescriptor(target, name), original = target[name], wrapped = wrap(original);
        target[name] = wrapped;
        t.restore.push(() => { if (target[name] === wrapped) { if (own) Object.defineProperty(target, name, own); else delete target[name]; } });
    }
    function hooks(t) {
        install(t, t.game, "onUpdate", original => function (...args) {
            const atMs = now(), gap = t.lastFrameAt === null ? null : atMs - t.lastFrameAt; t.lastFrameAt = atMs;
            if (t.measurement && gap > 250) t.cancelReason = `实际游戏更新间隔 ${gap.toFixed(1)}ms 超过250ms，禁止重按掩盖安全清理。`;
            const value = original.apply(this, args), s = this.getStatus();
            t.frames.push({ atMs, gameFrame: s.updateFrame, timerDeltaMs: Laya.timer.delta, gapMs: gap });
            return value;
        });
        install(t, t.game.cameraFollow, "follow", original => function (...args) {
            const value = original.apply(this, args), s = t.game.getStatus(), atMs = now();
            t.samples.push({ atMs, gameFrame: s.updateFrame, position: s.position.slice(), grounded: s.grounded,
                firstPerson: s.firstPerson, motion: s.avatar.motion, shots: s.avatar.shots,
                inputResetAtMs: s.inputResetAtMs, inputResetReason: s.inputResetReason, inputsClear: inputsClear(s),
                consumedShots: s.training.consumedShots, receivedEvents: s.training.receivedEvents,
                completed: s.training.completed, pendingShots: s.training.pendingShots });
            if (t.measurement && s.inputResetAtMs > t.measurementResetAt)
                t.cancelReason = `测量中输入被 ${s.inputResetReason} 清理，禁止自动重按。`;
            for (const event of s.avatar.shotEvents || []) if (!t.seenEvents.has(event.id)) {
                t.seenEvents.add(event.id); t.emits.push({ ...event, observedAtMs: atMs, observedFrame: s.updateFrame });
            }
            for (const shot of s.training.shots || []) if (!t.seenSettlements.has(shot.id)) {
                t.seenSettlements.add(shot.id); t.settlements.push(clone(shot));
            }
            return value;
        });
        install(t, t.game, "respawn", original => function (...args) {
            t.result.respawns.push({ atMs: now(), measurementActive: t.measurement });
            if (t.measurement) t.cancelReason = "测量中真实游戏发生respawn；不将传送误报为正常射击移动。";
            return original.apply(this, args);
        });
    }
    function rate(t, from, to) {
        const count = t.frames.filter(f => f.atMs >= from && f.atMs <= to).length, hz = count / ((to - from) / 1000);
        return { targetFps: t.fps, actualOnUpdateHz: hz, count, wallSeconds: (to - from) / 1000,
            targetStatus: hz >= .9 * t.fps && hz <= 1.1 * t.fps ? "ACHIEVED" : "NOT TESTED" };
    }
    const assertion = (label, pass, actual, expected) => ({ label, status: pass ? "PASS" : "FAIL", actual, expected });
    function add(t, label, data, assertions) {
        const failed = assertions.some(a => a.status === "FAIL");
        const item = { label, ...data, assertions, status: failed ? "FAIL" : data.frameRate?.targetStatus === "NOT TESTED" ? "INCOMPLETE" : "PASS" };
        t.result.cases.push(item); publish(); return item;
    }
    async function perspective(t, firstPerson) {
        if (t.game.getStatus().firstPerson !== firstPerson) { tap(t, ".touch-view"); await wait(Math.max(150, 2200 / t.fps), t); }
        if (t.game.getStatus().firstPerson !== firstPerson) throw new Error("现有触屏视角按钮未响应。");
    }
    async function seed(t, position, label) {
        t.measurement = false; release(t); guard(t); say(t, `显式起点设置：${label}`);
        const before = t.game.getStatus().position.slice(), p = new Laya.Vector3(...position);
        t.game.motor.position = p; t.game.player.transform.position = p.clone();
        const item = { atMs: now(), label, before, requested: position.slice(), method: "motor.position + player.transform.position", measurementActive: false };
        t.result.setups.push(item); await wait(650, t);
        const deadline = now() + 2500;
        while (!t.game.getStatus().grounded && now() < deadline) await wait(70, t);
        const s = t.game.getStatus(); item.settled = s.position.slice();
        if (!s.grounded || !inputsClear(s) || Math.hypot(s.position[0] - position[0], s.position[2] - position[2]) > .25)
            throw new Incomplete("起点未稳定落地、横向滑移或仍有输入。");
        await perspective(t, t.view === "FP");
    }
    async function aim(t, point) {
        const direction = new Laya.Vector3();
        for (let attempt = 0; attempt < 48; attempt++) {
            guard(t); const camera = t.game.camera.transform, p = camera.position;
            camera.getForward(direction);
            const dx = point[0] - p.x, dy = point[1] - p.y, dz = point[2] - p.z;
            const targetYaw = Math.atan2(dx, -dz), targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
            const currentYaw = Math.atan2(direction.x, -direction.z), currentPitch = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
            const dyaw = angle(targetYaw - currentYaw), dpitch = targetPitch - currentPitch;
            if (Math.abs(dyaw) < .002 && Math.abs(dpitch) < .002) return;
            const sensitivity = .004 * t.game.touchSensitivity;
            if (!(sensitivity > 0)) throw new Incomplete("触屏灵敏度不可用。");
            const touch = press(t, ".touch-look");
            touch.x += Math.max(-Math.min(100, touch.rect.width * .3), Math.min(Math.min(100, touch.rect.width * .3), dyaw / sensitivity));
            touch.y -= Math.max(-Math.min(80, touch.rect.height * .25), Math.min(Math.min(80, touch.rect.height * .25), dpitch / sensitivity));
            dispatch("pointermove", touch); lift(t, touch); await wait(Math.max(30, 1300 / t.fps), t);
        }
        throw new Error("通过真实触屏look迭代48次仍未将当前相机光轴对准目标。");
    }
    function beginMeasurement(t) {
        t.measurementResetAt = t.game.getStatus().inputResetAtMs; t.measurement = true;
    }
    function snapshot(g) { return clone(g.getStatus()); }
    function chainAssertions(before, after, events, settlements) {
        const delta = after.avatar.shots - before.avatar.shots, a = before.training, b = after.training;
        const ids = events.map(e => e.id), settled = settlements.map(s => s.id);
        return [assertion("实际发射非零", delta > 0, delta, ">0"),
            assertion("实际发射事件逐一观测", events.length === delta, events.length, delta),
            assertion("每个发射ID恰有一次结算", settlements.length === delta && new Set(settled).size === delta
                && ids.every(id => settled.includes(id)), settled, ids),
            assertion("received/consumed/accepted增量等于发射数", b.receivedEvents - a.receivedEvents === delta
                && b.consumedShots - a.consumedShots === delta && settlements.filter(s => s.accepted).length === delta,
                { received: b.receivedEvents - a.receivedEvents, consumed: b.consumedShots - a.consumedShots, accepted: settlements.filter(s => s.accepted).length }, delta),
            assertion("无重复或取消、无未决积压", b.duplicateEvents === a.duplicateEvents && b.cancelledEvents === a.cancelledEvents && b.pendingShots === 0,
                { duplicates: b.duplicateEvents - a.duplicateEvents, cancelled: b.cancelledEvents - a.cancelledEvents, pending: b.pendingShots }, 0),
            assertion("结算和实际发射使用相同游戏帧", settlements.every(s => s.frame === s.resolvedFrame && s.resolvedAtMs >= s.atMs && s.resolvedAtMs - s.atMs <= 250),
                settlements.map(s => ({ id: s.id, emitted: s.frame, resolved: s.resolvedFrame, delayMs: s.resolvedAtMs - s.atMs })), "same frame, 0..250ms"),
            assertion("所有射流端点符合射程与实际命中点", settlements.every(s => {
                const r = s.result, distance = Math.hypot(...r.end.map((n, i) => n - r.origin[i]));
                return Number.isFinite(r.distance) && r.distance <= b.range + .001 && Math.abs(distance - r.distance) <= .001
                    && (!r.hit || Math.hypot(...r.hit.point.map((n, i) => n - r.end[i])) <= .001);
            }), settlements.map(s => ({ id: s.id, distance: s.result.distance, end: s.result.end, hit: s.result.hit?.point })), "distance<=18m; end=actual hit"),
            assertion("完成事件仅来自首次靶命中", b.completionEvents - a.completionEvents === settlements.filter(s => s.newlyCompleted).length
                && settlements.every(s => !s.newlyCompleted || s.accepted && s.result.outcome === "target"),
                { completionDelta: b.completionEvents - a.completionEvents, newlyCompleted: settlements.filter(s => s.newlyCompleted).map(s => s.id) }, "one response per first target")];
    }
    async function burst(t, label, options = {}) {
        say(t, label); const before = snapshot(t.game), from = now(); beginMeasurement(t);
        const held = press(t, ".touch-shoot"); let stick = null;
        if (options.move) { stick = press(t, ".touch-stick"); stick.x += stick.rect.width * .4; dispatch("pointermove", stick); }
        if (options.jump) tap(t, ".touch-jump");
        const duration = options.duration || 120;
        if (options.switchView) {
            await wait(650, t); tap(t, ".touch-view"); await wait(650, t); tap(t, ".touch-view"); await wait(Math.max(1, duration - 1300), t);
        } else await wait(duration, t);
        const until = now(), released = snapshot(t.game); lift(t, held); if (stick) lift(t, stick);
        const immediate = snapshot(t.game); await wait(500, t); const ended = now(), after = snapshot(t.game); t.measurement = false;
        const events = t.emits.filter(e => e.id > before.avatar.shots && e.id <= after.avatar.shots);
        const settlements = t.settlements.filter(s => s.id > before.avatar.shots && s.id <= after.avatar.shots);
        const samples = t.samples.filter(s => s.atMs >= from && s.atMs <= ended);
        const assertions = chainAssertions(before, after, events, settlements);
        assertions.push(assertion("释放时held同步清除", !immediate.triggerHeld && !immediate.avatar.triggerHeld && !immediate.touch?.shooting,
            { root: immediate.triggerHeld, avatar: immediate.avatar.triggerHeld, touch: immediate.touch?.shooting }, false),
        assertion("释放500ms无新增发射且全部输入清除", after.avatar.shots === released.avatar.shots && inputsClear(after),
            { postReleaseShots: after.avatar.shots - released.avatar.shots, clear: inputsClear(after) }, { postReleaseShots: 0, clear: true }));
        if (options.expectedTarget) assertions.push(assertion("命中指定靶", settlements.length > 0 && settlements.every(s => s.result.outcome === "target" && s.result.targetId === options.expectedTarget),
            settlements.map(s => ({ id: s.id, outcome: s.result.outcome, target: s.result.targetId })), options.expectedTarget));
        if (options.outcomes) assertions.push(assertion("无靶结算且结果符合场景", settlements.length > 0 && settlements.every(s => !s.result.targetId && options.outcomes.includes(s.result.outcome)),
            settlements.map(s => s.result.outcome), options.outcomes));
        if (options.duration >= 1500) {
            const count = released.avatar.shots - before.avatar.shots, ideal = (until - from) / (before.avatar.shotInterval * 1000);
            assertions.push(assertion("持续射击保持既有频率±1发", Math.abs(count - ideal) <= 1.05, count, { ideal, tolerance: 1 }));
            const intervals = events.slice(1).map((e, i) => e.atMs - events[i].atMs), tolerance = 1000 / t.fps + 8;
            assertions.push(assertion("实际发射间隔符合射速和帧量化", intervals.every(ms => Math.abs(ms - before.avatar.shotInterval * 1000) <= tolerance), intervals,
                { intervalMs: before.avatar.shotInterval * 1000, toleranceMs: tolerance }));
        }
        if (options.onlyOnce) assertions.push(assertion("重复命中完成只增加一次", after.training.completionEvents - before.training.completionEvents === 1 && after.training.completed === 1,
            { addedCompletionEvents: after.training.completionEvents - before.training.completionEvents, completed: after.training.completed }, { addedCompletionEvents: 1, completed: 1 }));
        if (options.move) assertions.push(assertion("射击时实际位置变化", Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2]) > .2,
            { from: before.position, to: after.position }, ">0.2m"));
        if (options.jump) assertions.push(assertion("射击过程中真实离地", samples.some(s => !s.grounded), samples.filter(s => !s.grounded).length, ">0"));
        if (options.switchView) assertions.push(assertion("持射过程中双视角均有结算", settlements.some(s => s.firstPerson) && settlements.some(s => !s.firstPerson),
            settlements.map(s => ({ id: s.id, firstPerson: s.firstPerson })), "FP and TPS"));
        return add(t, label, { inputSource: "synthetic-touch-DOM", inputDownAtMs: from, inputUpAtMs: until,
            inputWallSeconds: (until - from) / 1000, releaseObservedAtMs: ended, before, immediateRelease: immediate, after,
            emissions: events, settlements, positionSamples: samples, measurementTeleportCount: 0,
            frameRate: duration >= 1500 ? rate(t, from, until) : null }, assertions);
    }
    async function resetUI(t, label) {
        t.measurement = false; release(t); const button = document.querySelector("[data-training-reset]");
        if (!button) throw new Incomplete("缺少正式训练重置入口。");
        const before = snapshot(t.game); button.click(); await wait(150, t); const after = snapshot(t.game);
        add(t, label, { inputSource: "synthetic-click original reset button", before: before.training, after: after.training }, [
            assertion("UI重置清空进度且计数增加1", after.training.completed === 0 && !after.training.complete && after.training.resetCount === before.training.resetCount + 1,
                { completed: after.training.completed, resetCount: after.training.resetCount }, { completed: 0, resetCount: before.training.resetCount + 1 }),
            assertion("重置不降低已消费发射水位且不新增消费", after.training.lastConsumedShotId >= before.training.lastConsumedShotId
                && after.training.consumedShots === before.training.consumedShots && inputsClear(after), after.training, "unchanged consumed count; nondecreasing watermark; clear input")]);
    }
    async function functional(t) {
        await resetUI(t, "功能验收起始重置"); await seed(t, spawn, "出生点");
        await aim(t, targets.near); await burst(t, "近距离命中", { expectedTarget: "near" });
        const beforeRepeat = snapshot(t.game); await burst(t, "重复命中近靶", { expectedTarget: "near" });
        const afterRepeat = snapshot(t.game);
        add(t, "重复靶完成只计一次", {}, [assertion("完成事件不重复", beforeRepeat.training.completionEvents === afterRepeat.training.completionEvents
            && afterRepeat.training.completed === 1, afterRepeat.training, "completed=1, completionEvents unchanged")]);
        await aim(t, targets.medium); await burst(t, "中距离命中", { expectedTarget: "medium" });
        await aim(t, targets.covered); await burst(t, "出生点射击掩体后的靶", { outcomes: ["world", "muzzle-blocked"] });
        await seed(t, flank, "明确设置右侧绕行验收点（本用例不验证行走路线）");
        await aim(t, targets.covered); await burst(t, "绕行点命中掩体靶", { expectedTarget: "covered" });
        const complete = snapshot(t.game);
        add(t, "三个靶全部完成", { training: complete.training, message: document.querySelector("[data-training-message]")?.textContent }, [
            assertion("3个不同目标完成", complete.training.completed === 3 && complete.training.complete && new Set(complete.training.completedIds).size === 3, complete.training.completedIds, ["near", "medium", "covered"])]);
        await seed(t, spawn, "脱靶"); await aim(t, [-26, 50, 70]); await burst(t, "朝天空脱靶", { outcomes: ["miss"] });
        await seed(t, [-23, 1.66, 65], "明确超出18m射程"); await aim(t, targets.near);
        await burst(t, "超射程不得命中", { outcomes: ["miss", "out-of-range", "world"] });
        await seed(t, [-31.8, 1.66, 38.85], "近墙枪口路径"); await aim(t, targets.covered);
        await burst(t, "近墙不能穿透掩体", { outcomes: ["world", "muzzle-blocked"] });
        for (let i = 1; i <= 3; i++) await resetUI(t, `连续重置 ${i}/3`);
        await seed(t, spawn, "重置后的第二轮");
        for (const id of ["near", "medium"]) { await aim(t, targets[id]); await burst(t, `重置后重新命中 ${id}`, { expectedTarget: id }); }
        await seed(t, flank, "第二轮掩体靶"); await aim(t, targets.covered); await burst(t, "重置后重新命中 covered", { expectedTarget: "covered" });
        const again = snapshot(t.game);
        add(t, "第二轮可正常完成", { training: again.training }, [assertion("再次3/3完成", again.training.completed === 3 && again.training.complete, again.training.completed, 3)]);
    }
    async function continuous(t) {
        for (const mode of ["static", "moving", "jumping", "perspective-switch"]) {
            await resetUI(t, `${mode} 独立起始重置`); await seed(t, spawn, mode); await aim(t, targets.near);
            await burst(t, `${mode} 持射2秒 / 释放500ms`, { duration: 2000, onlyOnce: mode === "static", expectedTarget: mode === "static" ? "near" : null,
                move: mode === "moving", jump: mode === "jumping", switchView: mode === "perspective-switch" });
        }
    }
    async function route(t) {
        t.result.notTested = t.result.notTested.filter(item => !item.startsWith("Physical traversal of the flank route:"));
        t.result.routeProtocol = { name: "m1-training-flank-walk-v1", forcedView: "FP",
            reason: "Route heading uses player world yaw with FP; no TPS optical shoulder offset steering",
            waypoints: [[-29, 37.7], [-30.2, 38.4], [-30.2, 40.2]], toleranceMeters: .2,
            stuckLimitMs: 4000, minimumProgressMeters: .025, setupTeleportsAllowed: 1 };
        await resetUI(t, "绕行验收起始重置"); await seed(t, spawn, "绕行唯一初始出生点");
        await perspective(t, true); beginMeasurement(t);
        const routeStart = now(), setupCount = t.result.setups.length;
        const distance = (s, target) => Math.hypot(target[0] - s.position[0], target[1] - s.position[2]);
        const heading = async target => {
            for (let attempt = 0; attempt < 24; attempt++) {
                guard(t); const s = t.game.getStatus(), desired = Math.atan2(target[0] - s.position[0], -(target[1] - s.position[2]));
                const dyaw = angle(desired - s.yaw), dpitch = -s.pitch;
                if (Math.abs(dyaw) < .012 && Math.abs(dpitch) < .012) return;
                const sensitivity = .004 * t.game.touchSensitivity;
                if (!(sensitivity > 0)) throw new Incomplete("路线触屏灵敏度不可用。");
                const touch = press(t, ".touch-look"), maxX = Math.min(100, touch.rect.width * .3), maxY = Math.min(80, touch.rect.height * .25);
                touch.x += Math.max(-maxX, Math.min(maxX, dyaw / sensitivity));
                touch.y -= Math.max(-maxY, Math.min(maxY, dpitch / sensitivity));
                dispatch("pointermove", touch); lift(t, touch); await wait(Math.max(30, 1300 / t.fps), t);
            }
            throw new Error("绕行world yaw经24次真实touch-look仍未对齐。");
        };
        for (const [index, target] of t.result.routeProtocol.waypoints.entries()) {
            say(t, `真实步行绕行 ${index + 1}/3 → (${target.join(", ")})`);
            const from = now(), before = snapshot(t.game), sampleIndex = t.samples.length;
            let best = distance(before, target), progressAt = now(), maxStuckMs = 0, stoppedChecks = 0, stick = null;
            try {
                await heading(target);
                while (true) {
                    guard(t); const s = t.game.getStatus(), d = distance(s, target);
                    if (d < best - .025) { best = d; progressAt = now(); }
                    maxStuckMs = Math.max(maxStuckMs, now() - progressAt);
                    if (d <= .2) {
                        if (stick) { lift(t, stick); stick = null; }
                        await wait(220, t); stoppedChecks++;
                        const stopped = t.game.getStatus();
                        if (distance(stopped, target) <= .2 && stopped.grounded) break;
                        if (stoppedChecks > 8) throw new Error("绕行路点不能停稳在0.2m内且落地。");
                    }
                    if (now() - progressAt > 4000) throw new Error("绕行连续4秒没有至少0.025m接近目标，判定卡住。");
                    if (now() - from > 25000) throw new Error("绕行单段超过25秒时限。");
                    const current = t.game.getStatus(), desired = Math.atan2(target[0] - current.position[0], -(target[1] - current.position[2]));
                    if (Math.abs(angle(desired - current.yaw)) > .035) {
                        if (stick) { lift(t, stick); stick = null; }
                        await heading(target);
                    }
                    if (!stick) stick = press(t, ".touch-stick");
                    const remaining = distance(t.game.getStatus(), target), analog = Math.max(.14, Math.min(1, (remaining - .07) / .9));
                    stick.x = stick.rect.left + stick.rect.width / 2;
                    stick.y = stick.rect.top + stick.rect.height / 2 - stick.rect.width * .34 * (.12 + .88 * analog);
                    dispatch("pointermove", stick);
                    t.result.inputs.push({ type: "pointermove", atMs: now(), id: stick.id, selector: stick.selector, synthetic: true, analog });
                    await wait(65, t);
                }
                const after = snapshot(t.game), until = now(), respawns = t.result.respawns.filter(r => r.measurementActive && r.atMs >= from);
                add(t, `绕行路点 ${index + 1}/3`, { target, before, after, wallSeconds: (until - from) / 1000,
                    positionSamples: t.samples.slice(sampleIndex), frameRate: rate(t, from, until), maxStuckMs, stoppedChecks,
                    measurementTeleportCount: t.result.setups.length - setupCount + respawns.length, respawns }, [
                    assertion("路点0.2m内停稳并落地", distance(after, target) <= .2 && after.grounded && inputsClear(after),
                        { distance: distance(after, target), grounded: after.grounded, inputsClear: inputsClear(after) }, "<=0.2m, grounded, clear"),
                    assertion("测量期间无传送或respawn", t.result.setups.length === setupCount && respawns.length === 0,
                        { setupDelta: t.result.setups.length - setupCount, respawns: respawns.length }, 0)]);
            } catch (error) {
                if (stick) { lift(t, stick); stick = null; }
                t.result.cases.push({ label: `绕行路点 ${index + 1}/3`, status: error instanceof Incomplete ? "INCOMPLETE" : "FAIL",
                    target, before, after: snapshot(t.game), reason: String(error.message || error), maxStuckMs,
                    positionSamples: t.samples.slice(sampleIndex), frameRate: rate(t, from, now()),
                    measurementTeleportCount: t.result.setups.length - setupCount + t.result.respawns.filter(r => r.measurementActive && r.atMs >= from).length });
                publish(); throw error;
            } finally { if (stick) lift(t, stick); }
        }
        await aim(t, targets.covered); await burst(t, "真实步行绕过掩体后命中", { expectedTarget: "covered" });
        add(t, "完整训练区步行绕行", { frameRate: rate(t, routeStart, now()), setupCount: t.result.setups.length,
            measurementTeleportCount: t.result.setups.length - setupCount + t.result.respawns.filter(r => r.measurementActive && r.atMs >= routeStart).length }, [
            assertion("整条路线只有一次初始setup", t.result.setups.length === 1 && t.result.respawns.every(r => !r.measurementActive || r.atMs < routeStart),
                { setups: t.result.setups.length, respawns: t.result.respawns }, "1 setup, 0 measurement respawns")]);
    }
    async function execute(type) {
        if (active) return;
        const t = { game: null, type, phase: "初始化", started: now(), fps: +fpsSelect.value, view: viewSelect.value,
            pointers: new Map(), restore: [], frames: [], samples: [], emits: [], settlements: [], lastFrameAt: null, measurement: false,
            result: { runId: `${iso()}-${++sequence}`, type, requestedFps: +fpsSelect.value, requestedView: viewSelect.value,
                startedAt: iso(), status: "RUNNING", cases: [], setups: [], inputs: [], respawns: [], errors: [],
                environment: { userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], devicePixelRatio },
                notTested: [...report.notTested, "Physical traversal of the flank route: functional test explicitly seeds the flank"] } };
        active = t;
        try {
            t.game = game(); const s = t.game.getStatus();
            if (!inputsClear(s)) throw new Incomplete("开始前仍有用户输入，未抢占或清除。");
            for (const id of ["m01-runtime-panel", "m01-routes-panel", "m01-input-timing-panel"]) {
                const node = document.getElementById(id);
                if (node && Object.values(node.dataset).some(value => { try { return JSON.parse(value)?.active; } catch { return false; } }))
                    throw new Incomplete("另一验收面板仍在运行。");
            }
            t.seenEvents = new Set(s.avatar.shotEvents.map(e => e.id)); t.seenSettlements = new Set(s.training.shots.map(e => e.id));
            t.oldRate = { interval: Laya.Render.frameInterval, stage: Laya.stage.frameRate };
            hooks(t); Laya.Render.frameInterval = 1000 / t.fps; Laya.stage.frameRate = "fast";
            t.result.rateSetting = { API: "Laya.Render.frameInterval", value: 1000 / t.fps, fakeClock: false };
            await wait(450, t); const measuredFrom = now();
            if (type === "functional") await functional(t); else if (type === "route") await route(t); else await continuous(t);
            t.result.frameRate = rate(t, measuredFrom, now());
            t.result.status = t.result.cases.some(c => c.status === "FAIL") ? "FAIL"
                : t.result.cases.some(c => c.status === "INCOMPLETE") || t.result.frameRate.targetStatus !== "ACHIEVED" ? "INCOMPLETE" : "PASS";
        } catch (error) {
            t.result.status = error instanceof Incomplete ? "INCOMPLETE" : "FAIL";
            t.result.errors.push({ atMs: now(), phase: t.phase, name: error.name, message: String(error.message || error) });
        } finally {
            t.measurement = false;
            try { release(t); } catch (error) { t.result.errors.push({ phase: "cleanup", message: String(error) }); }
            for (const restore of t.restore.reverse()) restore();
            if (t.oldRate) { Laya.Render.frameInterval = t.oldRate.interval; Laya.stage.frameRate = t.oldRate.stage; }
            t.result.endedAt = iso(); t.result.wallSeconds = (now() - t.started) / 1000;
            t.result.frames = t.frames; t.result.postPhysicsSamples = t.samples; t.result.emissions = t.emits; t.result.settlements = t.settlements;
            t.result.cleanup = { inputsClear: t.game ? inputsClear(t.game.getStatus()) : null, frameInterval: window.Laya?.Render?.frameInterval, hooksRestored: true };
            report.history.push(t.result); active = null; message.textContent = `${t.result.status} ${type}，原始记录已保留。`; publish();
        }
    }
    function download() {
        const a = document.createElement("a"), url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
        a.href = url; a.download = `lh-m1-${Date.now()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function mount() {
        panel = document.createElement("details"); panel.id = "m1-runtime-panel"; panel.open = true;
        panel.style.cssText = "position:fixed;right:12px;top:10px;z-index:2147483000;width:300px;max-height:70vh;overflow:auto;padding:10px;background:#102936f2;color:#edfbff;border:1px solid #78b7ca;border-radius:7px;font:12px/1.4 Arial,sans-serif";
        const summary = document.createElement("summary"); summary.textContent = "M1 实际引擎验收（显式执行）"; panel.appendChild(summary);
        for (const [name, values] of [["fps", [15, 30, 60, 120, 240]], ["view", ["FP", "TPS"]]]) {
            const label = document.createElement("label"); label.textContent = ` ${name} `; const select = document.createElement("select"); select.dataset.m1Field = name;
            for (const value of values) { const option = document.createElement("option"); option.value = String(value); option.textContent = String(value); select.appendChild(option); }
            label.appendChild(select); panel.appendChild(label); if (name === "fps") { fpsSelect = select; select.value = "60"; } else viewSelect = select;
        }
        const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:5px;flex-wrap:wrap;margin-top:8px"; panel.appendChild(actions);
        for (const [action, label] of [["functional", "M1 功能验收"], ["continuous", "M1 连发帧率验收"], ["route", "M1 训练区绕行"], ["stop", "停止并清理"], ["download", "下载 M1 JSON"]]) {
            const button = document.createElement("button"); button.textContent = label; button.dataset.m1Action = action;
            button.style.cssText = "padding:5px;color:white;background:#22576d;border:1px solid #80bad0;border-radius:4px;font:inherit";
            button.onclick = () => action === "stop" ? stop("用户显式停止测试。") : action === "download" ? download() : void execute(action);
            actions.appendChild(button); if (["functional", "continuous", "route"].includes(action)) startButtons.push(button);
        }
        message = document.createElement("p"); message.textContent = "默认不动作。请选择目标帧率与视角，再显式启动。"; panel.appendChild(message);
        output = document.createElement("pre"); output.style.cssText = "white-space:pre-wrap;font:11px/1.4 Arial"; panel.appendChild(output);
        panel.addEventListener("pointerdown", event => event.stopPropagation()); document.body.appendChild(panel); publish();
        setInterval(publish, 700);
    }
    function observeNativeActivity(type, event) {
        report.nativeActivity.push({ type, atMs: now(), key: event.key || null, code: event.code || null,
            button: typeof event.button === "number" ? event.button : null,
            pointerId: typeof event.pointerId === "number" ? event.pointerId : null,
            pointerType: event.pointerType || null, isTrusted: event.isTrusted,
            focused: document.hasFocus(), hidden: document.hidden,
            target: event.target?.id || event.target?.className || event.target?.nodeName || null });
        if (report.nativeActivity.length > 128) report.nativeActivity.shift();
    }
    for (const type of ["keydown", "keyup", "pointerdown", "pointerup"])
        document.addEventListener(type, event => observeNativeActivity(type, event), { capture: true, passive: true });
    for (const type of ["blur", "focus"])
        window.addEventListener(type, event => observeNativeActivity(type, event), { capture: true, passive: true });
    document.addEventListener("visibilitychange", event => observeNativeActivity("visibilitychange", event), { capture: true, passive: true });
    for (const type of ["error", "unhandledrejection"]) window.addEventListener(type, event => {
        const error = event.error || event.reason || event.message;
        const item = { type, atMs: now(), message: String(error?.message || error || "resource error"), phase: active?.phase || null };
        report.errors.push(item); if (active) { active.result.errors.push(item); stop(`实际运行异常：${item.message}`); }
    });
    for (const type of ["blur", "pagehide"]) window.addEventListener(type, e => { if (active && e.isTrusted) stop(`真实${type}，停止并清理合成输入。`); });
    document.addEventListener("visibilitychange", e => { if (active && e.isTrusted && document.hidden) stop("真实页面后台，停止并清理合成输入。"); });
    for (const type of ["pointerdown", "keydown", "wheel"]) document.addEventListener(type, e => {
        if (active && e.isTrusted && !panel?.contains(e.target)) stop("检测到人工输入，本轮中止，保留已有数据。");
    }, { capture: true, passive: true });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
})();
