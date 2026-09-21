/* M0.1 localhost-only runtime acceptance. Never bundle this file with the game.
 * Setup teleports are explicit test-only operations. Measurements use real frames,
 * real performance.now(), and the original game methods without time substitution. */
(() => {
    "use strict";
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(location.hostname)) return;
    if (document.getElementById("m01-runtime-panel")) return;
    const now = () => performance.now(), iso = () => new Date().toISOString();
    const finite = n => typeof n === "number" && Number.isFinite(n);
    const r = n => finite(n) ? Math.round(n * 1e6) / 1e6 : null;
    const clone = value => JSON.parse(JSON.stringify(value));
    const HOLD_MS = 2500, HISTORY_LIMIT = 8;
    const report = { schemaVersion: 1, numericProtocol: "m01-postphysics-v1", backgroundProtocol: "m01-native-interruption-v2",
        boundaryProtocol: "m01-recovery-observation-v3",
        tool: "LH M0.1 localhost acceptance", createdAt: iso(), url: location.href,
        status: "IDLE", active: null, history: [], archivedSummaries: [], discardedSummaryCount: 0, errors: [],
        live: null, realBackgroundVerification: { status: "NOT TESTED" },
        nativeEnginePauseVerification: { status: "NOT TESTED", doesNotVerifyNativeVisibility: true },
        boundaries: ["synthetic-input through existing touch controls", "test-only setup position changes are logged; no measurement-stage teleport",
            "Render.frameInterval changes only the real loop gate; no fake timer/delta/clock", "GPU time, physical touch hardware and native Escape are not verified"] };
    let panel, message, output, fpsSelect, viewSelect, xInput, yInput, zInput, stopButton;
    let active = null, nextPointer = 71000, lastPublish = 0, runSequence = 0;
    const buttons = [];
    class Incomplete extends Error { constructor(message) { super(message); this.name = "Incomplete"; } }
    function game() {
        const g = window.lingshuiGame;
        if (!g || typeof g.getStatus !== "function") throw new Incomplete("window.lingshuiGame.getStatus() 尚不可用。");
        return g;
    }
    function status() { return game().getStatus(); }
    function short(s) {
        return { ready: s.ready, firstPerson: s.firstPerson, grounded: s.grounded, position: s.position,
            yaw: s.yaw, speed: s.speed, fps: s.fps, keys: s.keys, triggerHeld: s.triggerHeld, touch: s.touch,
            avatar: s.avatar ? { motion: s.avatar.motion, base: s.avatar.base, upper: s.avatar.upper,
                shots: s.avatar.shots, shooting: s.avatar.shooting, triggerHeld: s.avatar.triggerHeld } : null };
    }
    function environment() {
        return { userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], devicePixelRatio,
            engineVersion: window.Laya?.version || window.Laya?.VERSION || null,
            renderFrameInterval: window.Laya?.Render?.frameInterval, stageFrameRate: window.Laya?.stage?.frameRate,
            canvases: [...document.querySelectorAll("canvas")].slice(0, 8).map(c => ({ id: c.id, width: c.width, height: c.height, clientWidth: c.clientWidth, clientHeight: c.clientHeight })) };
    }
    function publish(force = false) {
        if (!panel || (!force && now() - lastPublish < 750)) return;
        lastPublish = now(); report.updatedAt = iso();
        report.active = active ? { runId: active.result.runId, type: active.type, phase: active.phase,
            elapsedMs: r(now() - active.started), frameCount: active.frames.length, postPhysicsSamples: active.positions.length,
            pointerIds: [...active.pointers.keys()] } : null;
        report.status = active ? "RUNNING" : report.history.at(-1)?.status || "IDLE";
        panel.dataset.m01Status = JSON.stringify(report);
        for (const b of buttons) b.disabled = !!active;
        stopButton.hidden = !active;
        output.textContent = (active?.result.cases || report.history.at(-1)?.cases || []).slice(-5).map(c => `${c.status} ${c.label}`).join("\n");
    }
    function say(text) { if (message) message.textContent = text; publish(true); }
    function addError(type, error) {
        const item = { at: iso(), type, message: String(error?.message || error).slice(0, 1000), phase: active?.phase || null };
        report.errors.push(item); if (report.errors.length > 40) report.errors.shift();
        if (active) { active.result.errors.push(item); active.cancelReason = `运行异常：${item.message}`; }
        publish(true);
    }
    window.addEventListener("error", e => addError("error", e.error || e.message || "resource error"));
    window.addEventListener("unhandledrejection", e => addError("unhandledrejection", e.reason));
    function check(t, allowBackground = false) {
        if (active !== t || t.cancelReason) throw new Incomplete(t.cancelReason || "测试已中止。");
        if (window.lingshuiGame !== t.game) throw new Incomplete("游戏实例在测试期间改变。");
        if (!allowBackground && (document.hidden || !document.hasFocus())) throw new Incomplete("页面后台或失焦，当前数值样本无效。");
        if (!t.game.getStatus().ready) throw new Incomplete("游戏未 ready。");
        if (now() - t.started > 180000) throw new Incomplete("单轮超过 180 秒时限。");
    }
    async function wait(ms, t, allowBackground = false) {
        const end = now() + ms;
        while (now() < end) { check(t, allowBackground); await new Promise(resolve => setTimeout(resolve, Math.min(40, Math.max(1, end - now())))); }
        check(t, allowBackground);
    }
    function control(selector) {
        const e = document.querySelector(`#lingshui-hud ${selector}`), b = e?.getBoundingClientRect();
        if (!e?.isConnected || !b || b.width < 2 || b.height < 2) throw new Incomplete(`公开触屏控件不可用：${selector}`);
        return { e, b };
    }
    function dispatch(type, p, target = document) {
        target.dispatchEvent(new PointerEvent(type, { pointerType: "touch", pointerId: p.id, isPrimary: p.primary,
            clientX: p.x, clientY: p.y, button: type === "pointermove" ? -1 : 0,
            buttons: /up|cancel/.test(type) ? 0 : 1, pressure: /up|cancel/.test(type) ? 0 : .5,
            bubbles: true, cancelable: true, composed: true }));
    }
    function press(t, selector) {
        const { e, b } = control(selector), p = { id: ++nextPointer, x: b.left + b.width / 2, y: b.top + b.height / 2,
            primary: t.pointers.size === 0, selector };
        t.pointers.set(p.id, p); dispatch("pointerdown", p, e); return { p, b };
    }
    function lift(t, p) { try { dispatch("pointerup", p); } finally { t.pointers.delete(p.id); } }
    function tap(t, selector) { const { p } = press(t, selector); lift(t, p); }
    function runToggle(t, enable) {
        const e = control(".touch-run").e, current = e.getAttribute("aria-pressed") === "true";
        if (!enable && (!t.ownsRun || !current)) { t.ownsRun = false; return; }
        if (enable && current) throw new Incomplete("奔跑开关已被其他输入开启。");
        if (enable) t.ownsRun = true;
        tap(t, ".touch-run");
        if ((e.getAttribute("aria-pressed") === "true") !== enable) throw new Error("奔跑按钮未响应。");
        if (!enable) t.ownsRun = false;
    }
    function moveInput(t, x, z, running) {
        if (running) runToggle(t, true);
        const { p, b } = press(t, ".touch-stick"), radius = b.width * .4 / Math.hypot(x, z);
        p.x += x * radius; p.y -= z * radius;
        const at = now(); dispatch("pointermove", p); return at;
    }
    function release(t) {
        for (const p of [...t.pointers.values()]) {
            try { lift(t, p); } catch (error) { t.result.errors.push({ type: "release", message: String(error) }); }
        }
        if (t.ownsRun) try { runToggle(t, false); } catch (error) { t.result.errors.push({ type: "run-release", message: String(error) }); }
    }
    function inputsClear(s) {
        return !(s.keys?.length || s.triggerHeld || s.avatar?.triggerHeld || s.touch?.pointers || s.touch?.shootPointers || s.touch?.moving || s.touch?.shooting || s.touch?.running);
    }
    function cancel(reason) { if (active) { active.cancelReason = reason; release(active); say(reason); } }
    for (const type of ["pointerdown", "pointermove", "wheel", "keydown"]) document.addEventListener(type, event => {
        if (active && event.isTrusted && active.type !== "background") cancel("检测到人工输入；本轮中止，保留已取得结果。");
    }, { capture: true, passive: true });
    function visibilityEvent(type, event) {
        if (!active) return;
        const item = { type, atMs: now(), hidden: document.hidden, focused: document.hasFocus(), isTrusted: event.isTrusted };
        // Background protocol v2 anchors recovery to the actual native interruption,
        // not the earlier instruction asking the operator to switch tabs.
        if (active.type === "background") {
            item.postPhysicsSampleCount = active.positions.length;
            item.originalOnUpdateCount = active.frames.length;
            try { item.state = clone(active.game.getStatus()); }
            catch (error) { item.stateCaptureError = String(error.message || error); }
        }
        active.nativeEvents.push(item);
        if (event.isTrusted && active.type !== "background" && (type === "blur" || document.hidden)) cancel("真实后台/失焦中断本轮；请用独立后台恢复测试。");
    }
    window.addEventListener("blur", e => visibilityEvent("blur", e));
    window.addEventListener("focus", e => visibilityEvent("focus", e));
    document.addEventListener("visibilitychange", e => visibilityEvent("visibilitychange", e));
    window.addEventListener("pagehide", () => { if (active) { release(active); restore(active); } });
    function install(t, target, name, factory) {
        const own = Object.getOwnPropertyDescriptor(target, name), original = target[name];
        if (typeof original !== "function") throw new Incomplete(`需要真实方法 ${name}。`);
        const wrapped = factory(original); target[name] = wrapped;
        t.restorers.push(() => { if (target[name] === wrapped) { if (own) Object.defineProperty(target, name, own); else delete target[name]; } });
    }
    function hooks(t) {
        const avatar = t.game.avatar;
        if (!avatar?.getStatus || !avatar?.step || !avatar?.getMovementSpeedScale) throw new Incomplete("角色观测接口未就绪。");
        const existing = avatar.getStatus().shotEvents || [];
        t.seenEvents = new Set(existing.map(e => e.id));
        install(t, avatar, "getMovementSpeedScale", original => function (...args) {
            const value = original.apply(this, args);
            t.configuration = { right: args[0], forward: args[1], running: !!args[2], scale: value,
                speed: (args[2] ? t.game.runSpeed : t.game.walkSpeed) * value };
            return value;
        });
        install(t, avatar, "step", original => function (...args) {
            const before = this.getStatus().shots, result = original.apply(this, args), state = this.getStatus();
            const delta = Math.max(0, state.shots - before), observedAt = now();
            if (delta) {
                t.shotBatches.push({ atMs: observedAt, gameFrame: t.frameId, delta });
                const fresh = (state.shotEvents || []).filter(e => !t.seenEvents.has(e.id));
                for (const e of state.shotEvents || []) t.seenEvents.add(e.id);
                if (fresh.length === delta && fresh.every(e => finite(e.atMs))) {
                    for (const e of fresh) t.shots.push({ id: e.id, atMs: e.atMs, observedAtMs: observedAt, gameFrame: t.frameId,
                        frameIntervalMs: t.currentFrameInterval, source: "avatar.getStatus().shotEvents" });
                } else for (let i = 0; i < delta; i++) t.shots.push({ id: `observed-${state.shots - delta + i + 1}`,
                    atMs: observedAt, observedAtMs: observedAt, gameFrame: t.frameId, frameIntervalMs: t.currentFrameInterval, source: "real avatar.step fireCount delta" });
            }
            return result;
        });
        install(t, t.game, "onUpdate", original => function (...args) {
            const at = now(); t.frameId++; t.currentFrameInterval = t.lastFrameAt === null ? null : at - t.lastFrameAt; t.lastFrameAt = at;
            try { return original.apply(this, args); }
            finally {
                try {
                    const s = this.getStatus();
                    if (t.frames.length >= 50000) throw new Incomplete("真实帧记录达到内存上限。");
                    t.frames.push({ atMs: at, endedAtMs: now(), frame: t.frameId, timerDeltaMs: window.Laya.timer.delta,
                        phase: "original game.onUpdate count; not used as a postphysics position sample", shots: s.avatar?.shots });
                } catch (error) { t.cancelReason = `观测失败：${error.message}`; }
            }
        });
        if (!t.game.cameraFollow || typeof t.game.cameraFollow.follow !== "function") throw new Incomplete("真实 cameraFollow.follow afterPhysics 回调不可用，不能回退到物理前位置。");
        install(t, t.game.cameraFollow, "follow", original => function (...args) {
            const value = original.apply(this, args);
            try {
                const s = t.game.getStatus();
                if (t.positions.length >= 50000) throw new Incomplete("afterPhysics位置记录达到内存上限。");
                t.positions.push({ atMs: now(), gameFrame: t.frameId, phase: "after original cameraFollow.follow / onAfterSceneUpdate",
                    timerDeltaMs: window.Laya.timer.delta, position: s.position.slice(), speed: s.speed,
                    grounded: s.grounded, firstPerson: s.firstPerson, motion: s.avatar?.motion, base: s.avatar?.base,
                    shots: s.avatar?.shots, inputClear: inputsClear(s), target: t.configuration ? { ...t.configuration } : null });
            } catch (error) { t.cancelReason = `afterPhysics观测失败：${error.message}`; }
            return value;
        });
    }
    function restore(t) {
        if (t.restored) return;
        t.restored = true;
        for (const restoreMethod of t.restorers.reverse()) try { restoreMethod(); } catch (error) { t.result.errors.push({ type: "restore", message: String(error) }); }
        if (t.pausedOverride && window.Laya?.Render) {
            try {
                if (Laya.Render.paused !== t.pausedOverride.originalValue) Laya.Render.paused = t.pausedOverride.originalValue;
                t.pausedOverride.restored = Laya.Render.paused === t.pausedOverride.originalValue;
            } catch (error) { t.result.errors.push({ type: "paused-restore", message: String(error) }); }
        }
        if (t.originalRate) { Laya.Render.frameInterval = t.originalRate.interval; Laya.stage.frameRate = t.originalRate.stageRate; }
    }
    function stats(values) {
        if (!values.length) return { n: 0, mean: null, min: null, max: null, p50: null, p95: null };
        const a = values.slice().sort((x, y) => x - y), q = p => a[Math.min(a.length - 1, Math.floor((a.length - 1) * p))];
        return { n: a.length, mean: r(values.reduce((x, y) => x + y, 0) / values.length), min: r(a[0]), max: r(a.at(-1)), p50: r(q(.5)), p95: r(q(.95)) };
    }
    function bounded(values, limit = 120) {
        if (values.length <= limit) return values;
        return Array.from({ length: limit }, (_, i) => values[Math.round(i * (values.length - 1) / (limit - 1))]);
    }
    function rate(t, from, until) {
        const frames = t.frames.filter(f => f.atMs >= from && f.atMs <= until), seconds = (until - from) / 1000;
        const actual = seconds > 0 ? frames.length / seconds : 0;
        return { requestedFps: t.fps, actualOnUpdateHz: r(actual), observedOnUpdateCount: frames.length, wallSeconds: r(seconds),
            targetStatus: actual >= t.fps * .90 && actual <= t.fps * 1.10 ? "ACHIEVED" : "NOT TESTED",
            explanation: "Measured original game.onUpdate calls per wall-clock second; loop cap is not a promise of display/engine throughput." };
    }
    function assertion(label, passed, actual, limit) { return { label, status: passed === null ? "NOT TESTED" : passed ? "PASS" : "FAIL", actual, limit }; }
    function addCase(t, data, assertions) {
        const states = assertions.map(a => a.status);
        data.assertions = assertions;
        data.status = states.includes("FAIL") ? "FAIL" : states.includes("NOT TESTED") || data.frameRate?.targetStatus === "NOT TESTED" ? "INCOMPLETE" : "PASS";
        t.result.cases.push(data); publish(true); return data;
    }
    async function setup(t, label) {
        check(t); release(t); t.phase = `test-only setup: ${label}`; say(t.phase);
        const before = short(t.game.getStatus()), point = new Laya.Vector3(...t.origin);
        t.game.motor.position = point; t.game.player.transform.position = point.clone();
        t.result.setups.push({ atMs: now(), label, operation: "test-only: motor.position + player.transform.position", before: before.position, requested: t.origin.slice(), measurementActive: false });
        await wait(800, t);
        const deadline = now() + 2500;
        while (!t.game.getStatus().grounded && now() < deadline) await wait(100, t);
        const s = t.game.getStatus();
        if (!s.grounded || !inputsClear(s)) throw new Incomplete("固定起点未落地或输入未清空；请确认空旷平地 XYZ。");
        if (Math.hypot(s.position[0] - t.origin[0], s.position[2] - t.origin[2]) > .25) throw new Incomplete("固定起点产生明显横向滑移，不能用作平地数值路线。");
        t.result.setups.at(-1).settled = s.position.slice();
        if (t.frames.length < 2 || t.positions.length < 2) throw new Incomplete("没有观察到真实 onUpdate 和 afterPhysics 回调，不能制造测试帧。");
    }
    async function afterPhysics(t, atMs, firstEligibleIndex) {
        const deadline = now() + 1600;
        while (now() < deadline) {
            check(t);
            const sample = t.positions.slice(firstEligibleIndex).find(p => p.atMs >= atMs);
            if (sample) return sample;
            await wait(10, t);
        }
        throw new Incomplete("输入释放后未观察到真实 afterPhysics 位置。");
    }
    async function movement(t, name, x, z, running) {
        await setup(t, name); t.phase = `${running ? "Run" : "Walk"} ${name} · ${t.fps} FPS`; say(t.phase);
        const s0 = t.game.getStatus(), startPositionSample = t.positions.at(-1), yaw = s0.yaw, norm = Math.hypot(x, z);
        const startPosition = startPositionSample.position.slice();
        const dir = [(Math.cos(yaw) * x + Math.sin(yaw) * z) / norm, (Math.sin(yaw) * x - Math.cos(yaw) * z) / norm];
        const downAt = moveInput(t, x, z, running);
        await wait(HOLD_MS, t);
        const upSampleCount = t.positions.length, upAt = now(); release(t); const immediateUpState = t.game.getStatus();
        const endPositionSample = await afterPhysics(t, upAt, upSampleCount), endPosition = endPositionSample.position.slice();
        const frames = t.positions.filter(f => f.atMs >= downAt && f.atMs <= upAt);
        const configs = frames.filter(f => f.target?.running === running && Math.sign(f.target.right) === Math.sign(x) && Math.sign(f.target.forward) === Math.sign(z)).map(f => f.target.speed).filter(finite);
        const speed = configs.length ? stats(configs).p50 : null, duration = (upAt - downAt) / 1000;
        const dx = endPosition[0] - startPosition[0], dz = endPosition[2] - startPosition[2];
        const projected = dx * dir[0] + dz * dir[1], lateral = Math.abs(dx * dir[1] - dz * dir[0]);
        const expected = speed === null ? null : speed * duration;
        const distanceTolerance = speed === null ? null : .03 * expected + 2 * speed * t.physicsStep;
        const perFrame = [], windows = [];
        for (let i = 1; i < frames.length; i++) {
            const a = frames[i - 1], b = frames[i], seconds = (b.atMs - a.atMs) / 1000;
            if (seconds > 0) perFrame.push({ gameFrame: b.gameFrame, atMs: b.atMs, seconds: r(seconds),
                metersPerSecond: r(((b.position[0] - a.position[0]) * dir[0] + (b.position[2] - a.position[2]) * dir[1]) / seconds) });
            let j = i - 1; while (j > 0 && b.atMs - frames[j].atMs < 500) j--;
            const first = frames[j], secondsLong = (b.atMs - first.atMs) / 1000;
            if (secondsLong >= .4 && secondsLong <= .65 && first.atMs - downAt >= 150 && speed !== null) {
                const measured = ((b.position[0] - first.position[0]) * dir[0] + (b.position[2] - first.position[2]) * dir[1]) / secondsLong;
                const allowed = speed * (1.05 + t.physicsStep / secondsLong);
                windows.push({ fromMs: first.atMs, untilMs: b.atMs, seconds: r(secondsLong), measured: r(measured), upperBound: r(allowed), pass: measured <= allowed });
            }
        }
        await wait(350, t); const stopped = t.game.getStatus();
        const stoppedPosition = t.positions.at(-1).position;
        const stopDrift = Math.hypot(stoppedPosition[0] - endPosition[0], stoppedPosition[2] - endPosition[2]);
        const measuredRate = rate(t, downAt, upAt);
        const stopDriftLimit = speed === null ? null : speed * 2 * t.physicsStep + .02;
        addCase(t, { type: "movement", label: t.phase, inputSource: "synthetic-input: touch DOM", inputVector: [x, z], running,
            inputDownAtMs: downAt, inputUpAtMs: upAt, inputWallSeconds: r(duration), start: startPosition, end: endPosition,
            startPositionSampleAtMs: startPositionSample.atMs, endPositionSampleAtMs: endPositionSample.atMs,
            postReleaseSampleDelayMs: r(endPositionSample.atMs - upAt), immediateUpPosition: immediateUpState.position,
            positionSampling: "after original cameraFollow.follow; end is first real postphysics sample at/after inputUpAtMs",
            configuredSpeed: speed, speedConfiguration: "Observed return from original avatar.getMovementSpeedScale, multiplied by actual walkSpeed/runSpeed",
            expectedDistance: r(expected), projectedDistance: r(projected), lateralDistance: r(lateral), distanceTolerance: r(distanceTolerance),
            distanceRule: "abs(projected - speed*T) <= 0.03*speed*T + 2*speed*actualPhysicsStepSeconds",
            speedWindowRule: "0.4..0.65s windows after startup: measured <= speed*(1.05 + actualPhysicsStepSeconds/windowSeconds)",
            perFrameSpeed: stats(perFrame.map(f => f.metersPerSecond)), perFrameSamples: bounded(perFrame),
            positionSamples: bounded(frames.map(f => ({ atMs: f.atMs, gameFrame: f.gameFrame, position: f.position, timerDeltaMs: f.timerDeltaMs }))),
            actualPositionSampleCount: frames.length, longWindowCount: windows.length, failedWindows: windows.filter(w => !w.pass).slice(0, 30),
            longWindowSpeed: stats(windows.map(w => w.measured)), stopDrift: r(stopDrift), stopDriftLimit: r(stopDriftLimit),
            stopDriftRule: "After first post-release physics sample: two actual physics steps + 0.02m; no added render-frame tolerance",
            frameRate: measuredRate, measurementTeleportCount: 0 },
        [assertion("距离定量误差", expected === null ? null : Math.abs(projected - expected) <= distanceTolerance, r(Math.abs(projected - expected)), r(distanceTolerance)),
            assertion("长窗速度上界", windows.length ? windows.every(w => w.pass) : null, stats(windows.map(w => w.measured)).max, "5% + one physics-step sampling error"),
            assertion("固定平地与无横向障碍偏移", speed === null ? null : lateral <= 2 * speed * t.physicsStep + .02 && Math.abs(endPosition[1] - startPosition[1]) < .12, { lateral: r(lateral), heightDelta: r(endPosition[1] - startPosition[1]) }),
            assertion("释放后停止与输入清空", speed === null ? null : stopDrift <= stopDriftLimit && inputsClear(stopped), { stopDrift: r(stopDrift), inputsClear: inputsClear(stopped) }, r(stopDriftLimit))]);
    }
    async function firing(t) {
        await setup(t, "Firing"); t.phase = `连续射击 2s / 释放 500ms · ${t.fps} FPS`; say(t.phase);
        const initial = t.game.getStatus(), from = now(); press(t, ".touch-shoot");
        await wait(2000, t); const until = now(), beforeRelease = t.game.getStatus(); release(t);
        await wait(500, t); const after = t.game.getStatus();
        const events = t.shots.filter(e => e.observedAtMs >= from && e.observedAtMs <= until);
        const batches = t.shotBatches.filter(e => e.atMs >= from && e.atMs <= now());
        const measuredRate = rate(t, from, until), frameMs = measuredRate.actualOnUpdateHz > 0 ? 1000 / measuredRate.actualOnUpdateHz : Infinity;
        const intervals = events.slice(1).map((e, i) => ({ seconds: (e.atMs - events[i].atMs) / 1000,
            allowedErrorSeconds: Math.max(frameMs, e.frameIntervalMs || 0, events[i].frameIntervalMs || 0) / 1000 }));
        const count = beforeRelease.avatar.shots - initial.avatar.shots, ideal = (until - from) / 1000 / .2;
        addCase(t, { type: "firing", label: t.phase, inputSource: "synthetic-input: touch DOM", inputDownAtMs: from, inputUpAtMs: until,
            inputWallSeconds: r((until - from) / 1000), shotCount: count, idealCountAt5Hz: r(ideal), shotEvents: events,
            intervals: intervals.map(v => ({ seconds: r(v.seconds), allowedErrorSeconds: r(v.allowedErrorSeconds) })), batches,
            postRelease500msNewShots: after.avatar.shots - beforeRelease.avatar.shots, frameRate: measuredRate, measurementTeleportCount: 0 },
        [assertion("2秒约5Hz，计数允许±1", Math.abs(count - ideal) <= 1.05, count, { ideal: r(ideal), toleranceShots: 1 }),
            assertion("相邻发射间隔0.2秒±一实际帧", intervals.length ? intervals.every(v => Math.abs(v.seconds - .2) <= v.allowedErrorSeconds + .001) : null, stats(intervals.map(v => v.seconds)), "0.2 ± one observed game frame"),
            assertion("同一真实游戏帧不补发多枪", batches.every(b => b.delta <= 1), Math.max(0, ...batches.map(b => b.delta)), 1),
            assertion("松开500ms无新增发射且输入清空", after.avatar.shots === beforeRelease.avatar.shots && inputsClear(after), { added: after.avatar.shots - beforeRelease.avatar.shots, clear: inputsClear(after) }, 0)]);
    }
    async function boundary(t, type) {
        await setup(t, type); t.phase = `${type} 边界（显式测试）`; say(t.phase);
        moveInput(t, 0, 1, false); press(t, ".touch-shoot"); await wait(600, t);
        const before = t.game.getStatus(), at = now(), config = t.configuration;
        let trigger, gapMs = 0, recoveryBefore = before, recoveryAt = at, backgroundTimeline = null, nativeResume = null, engineResume = null;
        if (type === "stall") {
            trigger = { type: "test-only busy-wait", requestedMs: 400, noInputReleaseByProbe: true };
            const began = now(); while (now() - began < 400) { /* Explicitly requested local test stall. */ } gapMs = now() - began;
        } else if (type === "escape") {
            trigger = { type: "synthetic KeyboardEvent Escape", isTrusted: false, nativeEscapeVerified: false };
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
        } else if (type === "blur") {
            trigger = { type: "synthetic window Event blur", isTrusted: false, hiddenBefore: document.hidden, focusBefore: document.hasFocus() };
            window.dispatchEvent(new Event("blur")); trigger.hiddenAfterDispatch = document.hidden; trigger.focusAfterDispatch = document.hasFocus();
        } else if (type === "engine-pause") {
            // Exercise the actual engine setter/_markResumed path while wall time
            // continues. No keyup, synthetic blur/hidden event, or timer substitution.
            const originalPaused = Laya.Render.paused;
            if (typeof originalPaused !== "boolean") throw new Incomplete("原生 Laya.Render.paused 接口不可用。");
            t.pausedOverride = { originalValue: originalPaused, restored: false };
            const pausedFrameIndex = t.frames.length, pauseStartedAtMs = now();
            trigger = { type: "native Laya.Render.paused setter", protocol: "m01-render-paused-v1", requestedPauseMs: 1500,
                originalPaused, pauseStartedAtMs, originalOnUpdateCountBeforePause: pausedFrameIndex,
                noProbeInputReleaseDuringPause: true, noTimerDeltaOrClockWrites: true, nativeVisibilityEquivalent: false };
            Laya.Render.paused = true; trigger.pausedValueDuring = Laya.Render.paused;
            t.phase = "原生引擎已暂停：保持输入1500ms"; say(t.phase);
            await wait(1500, t);
            const pauseEndedAtMs = now(), pausedCount = t.frames.length - pausedFrameIndex;
            engineResume = { atMs: pauseEndedAtMs, postPhysicsSampleCount: t.positions.length };
            Laya.Render.paused = false;
            trigger.pauseEndedAtMs = pauseEndedAtMs; trigger.actualPauseMs = r(pauseEndedAtMs - pauseStartedAtMs);
            trigger.originalOnUpdateCountDuringPause = pausedCount; trigger.pausedValueAfterResume = Laya.Render.paused;
            gapMs = pauseEndedAtMs - pauseStartedAtMs;
        } else {
            trigger = { type: "real browser visibility transition", nativeRequired: true };
            say("请切到另一个标签，停留至少1秒后返回；不会伪造document.hidden。30秒内未切换则NOT TESTED。");
            const deadline = now() + 30000;
            while (now() < deadline) {
                await wait(80, t, true);
                const hidden = t.nativeEvents.find(e => e.type === "visibilitychange" && e.hidden && e.isTrusted && e.atMs >= at);
                const returned = hidden && t.nativeEvents.find(e => e.type === "visibilitychange" && !e.hidden && e.isTrusted && e.atMs > hidden.atMs);
                if (hidden && returned && returned.atMs - hidden.atMs >= 1000) {
                    const interruption = t.nativeEvents.find(e => e.isTrusted && e.atMs >= at &&
                        (e.type === "blur" || e.type === "visibilitychange" && e.hidden));
                    if (!interruption?.state?.position || !finite(interruption.state.avatar?.shots)) {
                        addCase(t, { type, label: t.phase, trigger, nativeEvents: t.nativeEvents },
                            [assertion("真实中断事件getStatus快照", null, interruption?.stateCaptureError || "未取得位置/发射计数快照")]); return;
                    }
                    trigger.hiddenAtMs = hidden.atMs; trigger.returnedAtMs = returned.atMs;
                    trigger.interruptionAtMs = interruption.atMs; trigger.interruptionType = interruption.type;
                    trigger.baseline = "First native blur/hidden event getStatus snapshot; excludes legal prompt-to-interruption play";
                    recoveryBefore = interruption.state; recoveryAt = interruption.atMs; nativeResume = returned;
                    gapMs = returned.atMs - hidden.atMs;
                    backgroundTimeline = {
                        protocol: "m01-native-interruption-v2", promptAtMs: at, promptState: short(before),
                        interruptionAtMs: interruption.atMs, interruptionState: clone(interruption.state),
                        legalPromptToInterruptionMs: r(interruption.atMs - at),
                        legalPositionDelta: interruption.state.position.map((v, i) => v - before.position[i]),
                        legalShotsBeforeInterruption: interruption.state.avatar.shots - before.avatar.shots,
                        completePromptToInterruptionPositions: t.positions.filter(p => p.atMs >= at && p.atMs <= interruption.atMs).map(p => ({
                            atMs: p.atMs, gameFrame: p.gameFrame, position: p.position, speed: p.speed, shots: p.shots,
                            grounded: p.grounded, inputClear: p.inputClear, target: p.target })),
                        completePromptToInterruptionShotEvents: t.shots.filter(s => s.observedAtMs >= at && s.observedAtMs <= interruption.atMs),
                        completePromptToInterruptionShotBatches: t.shotBatches.filter(s => s.atMs >= at && s.atMs <= interruption.atMs)
                    };
                    break;
                }
            }
            if (!trigger.returnedAtMs) { addCase(t, { type, label: t.phase, trigger, nativeEvents: t.nativeEvents }, [assertion("真实后台与返回", null, "未取得真实hidden>=1s再返回")]); return; }
        }
        const resumeReference = nativeResume || engineResume;
        const resumedAt = resumeReference ? resumeReference.atMs : now();
        await wait(resumeReference ? Math.max(0, 550 - (now() - resumedAt)) : 550, t);
        const after = t.game.getStatus(), first = (resumeReference ? t.positions.slice(resumeReference.postPhysicsSampleCount) : t.positions).find(f => f.atMs >= resumedAt);
        const drift = Math.hypot(after.position[0] - recoveryBefore.position[0], after.position[2] - recoveryBefore.position[2]);
        const firstJump = first ? Math.hypot(first.position[0] - recoveryBefore.position[0], first.position[2] - recoveryBefore.position[2]) : null;
        const tolerance = (config?.speed || t.game.walkSpeed) * t.physicsStep * 2 + .02;
        const batches = t.shotBatches.filter(b => b.atMs >= recoveryAt), added = after.avatar.shots - recoveryBefore.avatar.shots;
        const result = addCase(t, { type, label: t.phase, trigger, gapMs: r(gapMs), inputSource: "synthetic-input: held touch UI",
            before: short(recoveryBefore), after: short(after), firstResumedFrame: first, drift: r(drift), driftLimit: r(tolerance), addedShots: added,
            recoveryBaselineAtMs: recoveryAt, resumedAtMs: resumedAt, recoveryObservedMs: r(now() - resumedAt), backgroundTimeline,
            nativeEvents: t.nativeEvents, noProbeReleaseBeforeMeasurement: true, frameRate: rate(t, resumedAt, now()), measurementTeleportCount: 0 },
        [assertion("游戏自身清空输入", inputsClear(after), short(after)), assertion("恢复无大跳", firstJump === null ? null : firstJump <= tolerance && drift <= tolerance, { firstJump: r(firstJump), drift: r(drift) }, r(tolerance)),
            assertion("恢复不补发", added === 0 && batches.every(b => b.delta <= 1), { added, batchCounts: batches.map(b => b.delta) }, 0)]);
        if (type === "engine-pause") {
            result.enginePauseEvidence = { protocol: "m01-render-paused-v1", pausedOnUpdateCount: trigger.originalOnUpdateCountDuringPause,
                actualPauseMs: trigger.actualPauseMs, firstResumedTimerDeltaMs: first?.timerDeltaMs ?? null,
                firstResumedGameFrame: first?.gameFrame ?? null, expectedSetterBehavior: "Real Render.paused=false marks timers resumed; recorded timer delta is never overwritten by this probe",
                nativeVisibilityEquivalent: false };
            result.assertions.push(assertion("原生暂停期间原onUpdate调用为0", trigger.originalOnUpdateCountDuringPause === 0,
                trigger.originalOnUpdateCountDuringPause, 0), assertion("真实暂停至少1500ms", trigger.actualPauseMs >= 1500,
                trigger.actualPauseMs, 1500));
        }
        if (type === "background" || type === "engine-pause") {
            const freshInput = await backgroundFreshInput(t, after, type === "engine-pause" ? {
                type: "engine-pause-fresh-input", protocol: "m01-render-paused-v1", label: "引擎暂停恢复后新前向输入 500ms"
            } : undefined);
            // Keep the v2 fresh-input start immediately after the 550ms checks.
            // Only afterward finish the predeclared two-second FPS evidence window.
            await boundaryFrameRateEvidence(t, [result, freshInput], resumedAt);
            const status = [result.status, freshInput.status].includes("FAIL") ? "FAIL" :
                [result.status, freshInput.status].includes("INCOMPLETE") ? "INCOMPLETE" : "PASS";
            if (type === "background") report.realBackgroundVerification = { status, runId: t.result.runId, protocol: "m01-native-interruption-v2",
                boundaryProtocol: "m01-recovery-observation-v3", nativeEvents: t.nativeEvents };
            else report.nativeEnginePauseVerification = { status, runId: t.result.runId, protocol: "m01-render-paused-v1",
                boundaryProtocol: "m01-recovery-observation-v3", doesNotVerifyNativeVisibility: true,
                actualPauseMs: trigger.actualPauseMs, pausedOnUpdateCount: trigger.originalOnUpdateCountDuringPause,
                firstResumedTimerDeltaMs: first?.timerDeltaMs ?? null };
        } else await boundaryFrameRateEvidence(t, [result], resumedAt);
    }
    async function backgroundFreshInput(t, recovered, context = { type: "background-fresh-input", protocol: "m01-native-interruption-v2", label: "background 恢复后新前向输入 500ms" }) {
        // Separate post-recovery pulse: no teleport, no releaseInput/reset/physics-debt
        // write. The game must already have cleared its input before a new pointer starts.
        t.phase = context.label; say(t.phase);
        if (!inputsClear(recovered)) return addCase(t, { type: context.type, label: t.phase },
            [assertion("游戏先自行清空输入，才可发新输入", null, short(recovered))]);
        const start = t.positions.at(-1), initial = t.game.getStatus(), previousIds = new Set(t.pointers.keys());
        const direction = [Math.sin(initial.yaw), -Math.cos(initial.yaw)], downAt = moveInput(t, 0, 1, false);
        const freshPointers = [...t.pointers.values()].filter(p => !previousIds.has(p.id));
        let upAt, upSampleCount;
        try { await wait(500, t); }
        finally {
            upSampleCount = t.positions.length; upAt = now();
            for (const p of freshPointers) lift(t, p);
        }
        const end = await afterPhysics(t, upAt, upSampleCount), after = t.game.getStatus();
        const samples = t.positions.filter(p => p.atMs >= downAt && p.atMs <= upAt);
        const configured = samples.filter(p => p.target && !p.target.running && p.target.right === 0 && p.target.forward > 0).map(p => p.target.speed).filter(finite);
        const speed = configured.length ? stats(configured).p50 : null, duration = (upAt - downAt) / 1000;
        const projected = (end.position[0] - start.position[0]) * direction[0] + (end.position[2] - start.position[2]) * direction[1];
        const expected = speed === null ? null : speed * duration;
        const tolerance = speed === null ? null : .03 * expected + 2 * speed * t.physicsStep;
        return addCase(t, { type: context.type, label: t.phase, protocol: context.protocol,
            inputSource: "synthetic-input: new touch-stick pointer after game-cleared state", inputDownAtMs: downAt, inputUpAtMs: upAt,
            inputWallSeconds: r(duration), start: start.position, end: end.position, startSampleAtMs: start.atMs, endSampleAtMs: end.atMs,
            configuredSpeed: speed, expectedDistance: r(expected), projectedDistance: r(projected), distanceTolerance: r(tolerance),
            distanceRule: "abs(projected - speed*T) <= 0.03*speed*T + 2*speed*actualPhysicsStepSeconds",
            postPhysicsPositions: samples.map(p => ({ atMs: p.atMs, gameFrame: p.gameFrame, position: p.position, target: p.target })),
            frameRate: rate(t, downAt, upAt), measurementTeleportCount: 0, directInputClearCalls: 0, directPhysicsDebtWrites: 0,
            oldOwnedPointersRetainedUntilFinalCleanup: true, addedShots: after.avatar.shots - initial.avatar.shots },
        [assertion("新500ms前向距离无旧物理债务追赶", speed === null ? null : Math.abs(projected - expected) <= tolerance,
            { expected: r(expected), projected: r(projected), absoluteError: r(expected === null ? null : Math.abs(projected - expected)) }, r(tolerance)),
            assertion("新移动不补发旧射击", after.avatar.shots === initial.avatar.shots, after.avatar.shots - initial.avatar.shots, 0),
            assertion("新指针正常up后输入清空", inputsClear(after), short(after))]);
    }
    async function boundaryFrameRateEvidence(t, cases, resumedAt) {
        // Boundary protocol v3 changes only target-FPS evidence. Functional samples,
        // their strict assertions, and the background fresh-input timing stay intact.
        // Count every original onUpdate in a fixed [resume, resume+2000ms] interval,
        // including early recovery frames; never select a favorable stable subwindow.
        const until = resumedAt + 2000;
        for (const item of cases) {
            const states = item.assertions.map(a => a.status);
            item.functionalStatus = states.includes("FAIL") ? "FAIL" : states.includes("NOT TESTED") ? "INCOMPLETE" : "PASS";
            item.transientFrameRate = item.frameRate || null;
            item.boundaryProtocol = "m01-recovery-observation-v3";
            item.targetFrameRateEvidence = { targetStatus: "PENDING", windowStartMs: resumedAt, windowEndMs: until, plannedWallMs: 2000 };
        }
        t.phase = "恢复后目标FPS证据：完整2秒窗口"; say(t.phase);
        await wait(Math.max(0, until - now()), t);
        const evidence = { ...rate(t, resumedAt, until), windowStartMs: resumedAt, windowEndMs: until,
            observedThroughAtMs: now(), plannedWallMs: 2000, includesEveryRecoveryFrame: true,
            windowActivity: t.type === "background" || t.type === "engine-pause" ?
                cases.some(c => ["background-fresh-input", "engine-pause-fresh-input"].includes(c.type) && finite(c.inputDownAtMs)) ?
                    "550ms recovery checks, immediate 500ms fresh movement pulse, then observation only" :
                    "550ms recovery checks; fresh input was not executed; remaining time is observation only" :
                "Original 550ms functional checks, then observation only",
            targetRule: "Unchanged: actual original onUpdate Hz must be within requested FPS ±10%" };
        for (const item of cases) {
            item.targetFrameRateEvidence = evidence;
            // Canonical frameRate now refers to the declared two-second target window;
            // the complete original short-window measurement remains above unchanged.
            item.frameRate = evidence;
            item.status = item.functionalStatus === "FAIL" ? "FAIL" :
                item.functionalStatus === "INCOMPLETE" || evidence.targetStatus === "NOT TESTED" ? "INCOMPLETE" : "PASS";
            item.statusBasis = "Unchanged functional assertions plus fixed two-second targetFrameRateEvidence; short-window rate is retained, not reclassified";
        }
        publish(true);
    }
    async function execute(type) {
        if (active) return;
        const t = { type, started: now(), phase: "准备", game: null, fps: Number(fpsSelect.value), view: viewSelect.value,
            origin: [Number(xInput.value), Number(yInput.value), Number(zInput.value)], pointers: new Map(), ownsRun: false,
            restorers: [], restored: false, frames: [], positions: [], frameId: 0, lastFrameAt: null, currentFrameInterval: null, configuration: null,
            shots: [], shotBatches: [], nativeEvents: [], cancelReason: null,
            result: { runId: `m01-${Date.now()}-${++runSequence}`, startedAt: iso(), status: "RUNNING", type, cases: [], setups: [], errors: [], inputSource: "synthetic-input", testOnlySetup: true } };
        active = t; report.history.push(t.result);
        if (report.history.length > HISTORY_LIMIT) {
            const old = report.history.shift(); report.archivedSummaries.push({ runId: old.runId, status: old.status, startedAt: old.startedAt, type: old.type,
                cases: old.cases.map(c => ({ label: c.label, status: c.status, frameRate: c.frameRate, assertions: c.assertions })) });
            if (report.archivedSummaries.length > 40) { report.archivedSummaries.shift(); report.discardedSummaryCount++; }
        }
        try {
            t.game = game(); const s = t.game.getStatus();
            if (!s.ready || !s.avatar?.loaded || !s.touch?.enabled || s.inputMode !== "touch") throw new Incomplete("需要真实游戏ready及现有?controls=touch触屏入口。");
            if (!inputsClear(s) || document.hidden || !document.hasFocus()) throw new Incomplete("请先松开控件、关闭奔跑，并保持页面前台。");
            if (!t.origin.every(finite) || ![15, 30, 60, 120, 240].includes(t.fps)) throw new Incomplete("起点或FPS参数无效。");
            if (!window.Laya?.Render || !finite(Laya.Render.frameInterval) || !Laya.stage || !t.game.motor || !t.game.player) throw new Incomplete("真实Laya帧门控/物理起点接口不可用。");
            t.physicsStep = t.game.world?.physicsSimulation?.fixedTimeStep;
            if (!finite(t.physicsStep) || t.physicsStep <= 0) throw new Incomplete("实例 world.physicsSimulation.fixedTimeStep 不可读取；禁止回退默认60Hz。");
            const globalStep = Laya.Scene3D?.physicsSettings?.fixedTimeStep;
            t.result.request = { targetFps: t.fps, view: t.view, setupPosition: t.origin, holdMs: HOLD_MS, physicsStepSeconds: t.physicsStep,
                physicsStepBasis: "actual game.world.physicsSimulation.fixedTimeStep; no physics clock changes",
                scene3DPhysicsSettings: { fixedTimeStep: finite(globalStep) ? globalStep : null, maxSubSteps: Laya.Scene3D?.physicsSettings?.maxSubSteps ?? null },
                instanceMatchesScene3DSetting: finite(globalStep) ? Math.abs(globalStep - t.physicsStep) < 1e-9 : "NOT AVAILABLE" };
            t.result.environmentBefore = environment();
            t.originalRate = { interval: Laya.Render.frameInterval, stageRate: Laya.stage.frameRate };
            hooks(t); Laya.Render.frameInterval = 1000 / t.fps; Laya.stage.frameRate = "fast";
            if (s.firstPerson !== (t.view === "FP")) tap(t, ".touch-view");
            t.result.rateSetting = { api: "Laya.Render.frameInterval = 1000/target; Laya.stage.frameRate = fast", timerMutation: false, setAtMs: now() };
            await wait(1000, t);
            if (type === "quick" || type === "numeric") {
                const directions = type === "quick" ? [["Forward", 0, 1]] : [["Forward", 0, 1], ["Back", 0, -1], ["Left", -1, 0], ["Right", 1, 0],
                    ["ForwardLeft", -1, 1], ["ForwardRight", 1, 1], ["BackLeft", -1, -1], ["BackRight", 1, -1]];
                for (const running of [false, true]) for (const [name, x, z] of directions) await movement(t, name, x, z, running);
                await firing(t);
            } else await boundary(t, type);
            t.result.status = t.result.errors.length || t.result.cases.some(c => c.status === "FAIL") ? "FAIL" : t.result.cases.some(c => c.status === "INCOMPLETE") ? "INCOMPLETE" : "PASS";
        } catch (error) {
            t.result.status = error instanceof Incomplete ? "INCOMPLETE" : "FAIL";
            t.result.reason = String(error.message || error); t.result.interruptedPhase = t.phase;
        } finally {
            release(t); restore(t);
            t.result.endedAt = iso(); t.result.wallElapsedMs = r(now() - t.started);
            t.result.cleanup = { releasedPointerIds: t.pointers.size === 0, restoredOwnedRunToggle: !t.ownsRun,
                originalMethodsRestored: t.restored, restoredFrameInterval: window.Laya?.Render?.frameInterval, restoredStageFrameRate: window.Laya?.stage?.frameRate };
            if (t.pausedOverride) t.result.cleanup.renderPaused = { originalValue: t.pausedOverride.originalValue,
                restoredValue: window.Laya?.Render?.paused, restored: t.pausedOverride.restored };
            t.result.totalOriginalOnUpdateCalls = t.frames.length;
            t.result.totalPostPhysicsPositionSamples = t.positions.length;
            t.result.nativeEvents = t.nativeEvents;
            try { t.result.finalState = short(t.game.getStatus()); } catch { }
            if (t.result.errors.length) t.result.status = "FAIL";
            active = null; say(`${t.result.status} · ${t.result.runId}。失败与未达目标帧率结果均保留，可下载JSON。`);
        }
    }
    function download() {
        publish(true); const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
        const a = document.createElement("a"); a.href = url; a.download = `${report.history.at(-1)?.runId || "m01-idle"}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function mount() {
        panel = document.createElement("details"); panel.id = "m01-runtime-panel"; panel.open = true;
        panel.style.cssText = "position:fixed;right:8px;top:8px;z-index:2147483646;width:340px;max-width:calc(100vw - 16px);max-height:80vh;overflow:auto;padding:10px;box-sizing:border-box;background:#13222ff2;color:#eef6ff;border:1px solid #91a8ba;border-radius:8px;font:12px/1.5 system-ui";
        const title = document.createElement("summary"); title.textContent = "M0.1 数值验收 · localhost / test-only"; panel.appendChild(title);
        const help = document.createElement("p"); help.textContent = "显式启动才设置起点/帧率。真实帧实测；不伪造delta。起点必须有半径11m以上平坦无障碍区域。240目标未达到会标NOT TESTED。"; panel.appendChild(help);
        function select(label, values, initial) {
            const wrapper = document.createElement("label"); wrapper.textContent = `${label} `;
            const input = document.createElement("select"); input.dataset.m01Field = label;
            for (const value of values) { const option = document.createElement("option"); option.value = option.textContent = value; input.appendChild(option); }
            input.value = initial; wrapper.appendChild(input); panel.appendChild(wrapper); return input;
        }
        fpsSelect = select("fps", [15, 30, 60, 120, 240], 60); viewSelect = select("view", ["FP", "TPS"], "FP");
        const originLine = document.createElement("p"); originLine.textContent = "test-only 起点 "; panel.appendChild(originLine);
        function number(name, value) {
            const input = document.createElement("input"); input.type = "number"; input.step = "0.01"; input.value = value;
            input.dataset.m01Field = name; input.setAttribute("aria-label", `测试起点${name}`); input.style.width = "70px"; originLine.appendChild(input); return input;
        }
        xInput = number("x", 0); yInput = number("y", 1.88); zInput = number("z", 100);
        const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:5px;flex-wrap:wrap"; panel.appendChild(actions);
        function button(name, label, callback, controlled = true) {
            const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.dataset.m01Action = name;
            b.style.cssText = "background:#2b4c65;color:white;border:1px solid #7e9eb5;border-radius:4px;padding:6px;font:inherit";
            b.addEventListener("click", callback); actions.appendChild(b); if (controlled) buttons.push(b); return b;
        }
        button("quick", "前向数值：走/跑/射击", () => { void execute("quick"); });
        button("numeric", "完整8向数值矩阵", () => { void execute("numeric"); });
        button("stall", "显式400ms卡顿", () => { void execute("stall"); });
        button("escape", "合成Esc释放", () => { void execute("escape"); });
        button("blur", "合成blur释放", () => { void execute("blur"); });
        button("background", "记录真实后台/恢复", () => { void execute("background"); });
        button("engine-pause", "原生引擎暂停/恢复", () => { void execute("engine-pause"); });
        button("download", "下载JSON历史", download, false);
        stopButton = button("stop", "停止并清理", () => cancel("用户停止，当前测量未完成。"), false); stopButton.hidden = true;
        message = document.createElement("p"); message.setAttribute("aria-live", "polite"); message.textContent = "等待显式操作；没有修改帧率、起点或游戏方法。"; panel.appendChild(message);
        output = document.createElement("pre"); output.style.cssText = "white-space:pre-wrap;font:11px/1.4 system-ui"; panel.appendChild(output);
        panel.addEventListener("pointerdown", e => e.stopPropagation()); document.body.appendChild(panel);
        setInterval(() => { try { report.live = short(status()); } catch { report.live = null; } publish(); }, 250); publish(true);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
})();
