/* Independent M0.1 route/jump/camera acceptance. localhost only; not a game feature.
 * Historical route files supply coordinates only. Their results are never imported. */
(() => {
    "use strict";
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(location.hostname)) return;
    if (document.getElementById("m01-routes-panel")) return;
    const now = () => performance.now(), iso = () => new Date().toISOString();
    const finite = n => typeof n === "number" && Number.isFinite(n);
    const round = n => finite(n) ? Math.round(n * 1e6) / 1e6 : null;
    const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
    const RECIPE_SOURCE = { file: "docs/site_repair/运行验收.json", sha256: "302b7219136c2defc20ee4abca9abf04513f6746f3d8c151070a286e500815d5", fieldsUsed: ["movement.routes.name", "start", "waypoints.target"], historicalResultsUsed: false };
    const RECIPES = {
        red_bridge_roundtrip: { source: { file: "docs/游戏检查记录.json", fieldsUsed: ["高架红桥桥面可通行.detail.start", "detail.end"], historicalResultsUsed: false }, start: [-15, 7.36, -49], targets: [[-5, -49], [-15, -49]] },
        pavilion_roundtrip: { source: { file: "docs/site_repair/运行验收.json", fieldsUsed: ["pavilion_roundtrip.points.target", "last point.position for start height"], historicalResultsUsed: false }, start: [-20.7, 1.74, -17.7], targets: [[-19.55, -16.4], [-17, -13], [-9, -13], [-8.2, -11], [-5, -11], [-8.2, -11], [-9, -13], [-17, -13], [-19.55, -16.4], [-20.7, -17.7]] },
        white_stairs_up: { start: [-3, 1.7399999952316285, -31.2], targets: [[-3, -34.1], [-3, -37.42], [-12, -37.42], [-12, -42.35], [-25, -42.35], [-25, -47.5]] },
        white_stairs_down: { sourceName: "white_stairs_down_final", start: [-25, 7.36, -48], targets: [[-25, -45.3], [-25, -42.35], [-12, -42.35], [-12, -37.42], [-3, -37.42], [-3, -32.25], [-7, -31.1]] },
        west_stairs_roundtrip: { start: [-47.7, 1.710000023841858, -28.1], targets: [[-47.7, -30.9], [-47.7, -34.8], [-47.7, -38.5], [-47.7, -43.5], [-47.7, -38.5], [-47.7, -34.8], [-47.7, -28.5]] },
        waterside_arc_steps_roundtrip: { start: [48, 3.2949999427795413, -26], targets: [[48, -23], [48, -21], [48, -19.35], [48, -21], [48, -23], [48, -26]] },
        entrance_threshold_roundtrip: { start: [51.9, 3.1399999713897704, -24], targets: [[51.9, -26], [51.9, -27.8], [51.9, -30], [51.9, -27.8], [51.9, -26], [51.9, -24]] },
        building_forecourt_red_path: { start: [11, 1.7600195500222475, -34], targets: [[15.5, -32.7], [17, -30.6], [18.7, -27.6], [20, -24.3], [30, -24.3], [45, -24.1], [59, -24], [80, -24.2], [85.5, -18], [83, -10], [77, 3]] }
    };
    const CAMERA_RECIPE = { start: [51.9, 3.45, -30.2], openYaw: 0, obstructedYaw: Math.PI, pitch: 0,
        sources: ["docs/entrance_fix/repair_report.json", "assets/resources/LingshuiCollision.json"],
        currentCollisionSha256: "92d9e9cc64355264f35435546ff265428540df8b67f25fe6f615457a6dbf1ec0",
        staticCandidateCheck: { rayToDoorHit: [51.63, 3.947923, -31.01], rayToForecourtHit: false, purpose: "Only establishes a candidate; real camera shapeCast and visual review remain required" } };
    const report = { schemaVersion: 1, protocol: "m01-routes-v1", createdAt: iso(), status: "IDLE", active: null,
        recipeSource: RECIPE_SOURCE, history: [], archived: [], errors: [], live: null,
        notVerified: ["低天花板跳跃限制", "真实手机/多指硬件", "未选择路线", "相机画面需要独立人工检查"] };
    let active = null, sequence = 0, pointerSequence = 81000, lastPublish = 0;
    let panel, fps, selectedRoute, view, message, results, stopButton;
    const actionButtons = [];
    class Incomplete extends Error { constructor(text) { super(text); this.name = "Incomplete"; } }
    function numericActive() {
        const raw = document.getElementById("m01-runtime-panel")?.dataset.m01Status;
        try { return raw && JSON.parse(raw).active; } catch { return null; }
    }
    function game() { const g = window.lingshuiGame; if (!g?.getStatus) throw new Incomplete("公开游戏实例尚未就绪。"); return g; }
    function status() { return game().getStatus(); }
    function short(s) {
        return { position: s.position, camera: s.camera, grounded: s.grounded, yaw: s.yaw, pitch: s.pitch,
            firstPerson: s.firstPerson, cameraDistance: s.cameraDistance, firstPersonCameraOffset: s.firstPersonCameraOffset,
            inputResetAtMs: s.inputResetAtMs, inputResetReason: s.inputResetReason, updateAtMs: s.updateAtMs, updateFrame: s.updateFrame,
            speed: s.speed, touch: s.touch, motion: s.avatar?.motion, base: s.avatar?.base, shooting: s.avatar?.shooting };
    }
    function bounded(a, n = 180) { return a.length <= n ? a : Array.from({ length: n }, (_, i) => a[Math.round(i * (a.length - 1) / (n - 1))]); }
    function publish(force = false) {
        if (!panel || (!force && now() - lastPublish < 750)) return;
        lastPublish = now(); report.updatedAt = iso(); report.status = active ? "RUNNING" : report.history.at(-1)?.status || "IDLE";
        report.active = active ? { runId: active.result.runId, type: active.type, phase: active.phase, elapsedMs: round(now() - active.started),
            gameOnUpdateCalls: active.updateTimes.length, afterPhysicsSamples: active.samples.length, pointerIds: [...active.pointers.keys()] } : null;
        panel.dataset.m01RouteStatus = JSON.stringify(report);
        for (const b of actionButtons) b.disabled = !!active || !!numericActive();
        stopButton.hidden = !active;
        results.textContent = (active?.result.cases || report.history.at(-1)?.cases || []).slice(-5).map(c => `${c.status} ${c.label}`).join("\n");
    }
    function say(s) { message.textContent = s; publish(true); }
    function clear(s) { return !(s.keys?.length || s.triggerHeld || s.touch?.pointers || s.touch?.moving || s.touch?.shooting || s.touch?.running); }
    function guard(t) {
        if (active !== t || t.cancelReason) throw new Incomplete(t.cancelReason || "测试中断。");
        if (t.measurementRespawnCount) throw new Error("测量期间引擎调用了 game.respawn；停止并保留 FAIL，不能算作连续走通。");
        if (numericActive()) throw new Incomplete("数值探针正在运行，拒绝并行改变帧率/输入。");
        if (window.lingshuiGame !== t.game || !t.game.getStatus().ready) throw new Incomplete("游戏实例失效或未 ready。");
        if (document.hidden || !document.hasFocus()) throw new Incomplete("页面失焦或进入后台。");
        if (now() - t.started > 240000) throw new Error("路线总时间超过 240 秒。");
    }
    async function wait(ms, t) {
        const until = now() + ms;
        while (now() < until) { guard(t); await new Promise(resolve => setTimeout(resolve, Math.min(40, Math.max(1, until - now())))); }
        guard(t);
    }
    function control(selector) {
        const e = document.querySelector(`#lingshui-hud ${selector}`), rect = e?.getBoundingClientRect();
        if (!e?.isConnected || !rect || rect.width < 2 || rect.height < 2) throw new Incomplete(`触屏控件不可见：${selector}`);
        return { e, rect };
    }
    function event(type, p, target = document) {
        target.dispatchEvent(new PointerEvent(type, { pointerId: p.id, pointerType: "touch", isPrimary: p.primary,
            clientX: p.x, clientY: p.y, button: type === "pointermove" ? -1 : 0,
            buttons: type === "pointerup" ? 0 : 1, pressure: type === "pointerup" ? 0 : .5, bubbles: true, cancelable: true, composed: true }));
    }
    function press(t, selector) {
        const { e, rect } = control(selector), p = { id: ++pointerSequence, x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2, primary: t.pointers.size === 0, selector, rect };
        t.pointers.set(p.id, p); event("pointerdown", p, e); return p;
    }
    function lift(t, p) { if (!p) return; try { event("pointerup", p); } finally { t.pointers.delete(p.id); } }
    function tap(t, selector) { const p = press(t, selector); lift(t, p); }
    function forward(p, analog) {
        const a = Math.max(0, Math.min(1, analog)), radius = p.rect.width * .34;
        p.x = p.rect.left + p.rect.width / 2;
        p.y = p.rect.top + p.rect.height / 2 - radius * (a ? .12 + .88 * a : 0);
        event("pointermove", p);
    }
    function toggleRun(t, on) {
        const e = control(".touch-run").e, current = e.getAttribute("aria-pressed") === "true";
        if (!on && (!t.ownsRun || !current)) { t.ownsRun = false; return; }
        if (on && current) throw new Incomplete("已有奔跑输入，不能接管。");
        if (on) t.ownsRun = true;
        tap(t, ".touch-run");
        if ((e.getAttribute("aria-pressed") === "true") !== on) throw new Error("奔跑按钮未响应。");
        if (!on) t.ownsRun = false;
    }
    function release(t) {
        for (const p of [...t.pointers.values()]) try { lift(t, p); } catch (e) { t.result.errors.push(String(e)); }
        if (t.ownsRun) try { toggleRun(t, false); } catch (e) { t.result.errors.push(String(e)); }
    }
    function cancel(reason) { if (active) { active.cancelReason = reason; release(active); say(reason); } }
    document.addEventListener("click", e => {
        const action = e.target?.closest?.("#m01-runtime-panel [data-m01-action]")?.dataset.m01Action;
        if (active && action && !["download", "stop"].includes(action)) { e.preventDefault(); e.stopImmediatePropagation(); say("路线探针运行中，不能同时启动数值探针。"); }
    }, true);
    for (const type of ["pointerdown", "pointermove", "wheel", "keydown"]) document.addEventListener(type, e => {
        if (active && e.isTrusted) cancel("检测到人工输入；停止自动路线并保留当前位置。");
    }, { capture: true, passive: true });
    window.addEventListener("blur", e => { if (active && e.isTrusted) cancel("窗口失焦，停止路线。"); });
    document.addEventListener("visibilitychange", () => { if (active && document.hidden) cancel("页面进入后台，停止路线。"); });
    function install(t, object, name, create) {
        const own = Object.getOwnPropertyDescriptor(object, name), original = object[name];
        if (typeof original !== "function") throw new Incomplete(`真实方法 ${name} 不可用。`);
        const wrapper = create(original); object[name] = wrapper;
        t.restorers.push(() => { if (object[name] === wrapper) { if (own) Object.defineProperty(object, name, own); else delete object[name]; } });
    }
    function hooks(t) {
        install(t, t.game, "respawn", original => function (...args) {
            const entry = { atMs: now(), phase: t.phase, measurementActive: t.measurementActive, before: null, after: null };
            try { entry.before = this.getStatus().position.slice(); } catch { }
            t.totalRespawnCount++;
            if (entry.measurementActive) t.measurementRespawnCount++;
            t.result.respawnCalls.push(entry);
            if (t.result.respawnCalls.length > 200) { t.result.respawnCalls.shift(); t.result.droppedRespawnRecords++; }
            try { return original.apply(this, args); }
            finally { try { entry.after = this.getStatus().position.slice(); } catch { } entry.endedAtMs = now(); }
        });
        t.respawnInstrumented = true;
        install(t, t.game, "onUpdate", original => function (...args) {
            t.updateTimes.push(now()); return original.apply(this, args);
        });
        if (!t.game.cameraFollow?.follow) throw new Incomplete("真实 afterPhysics 相机回调不可用。");
        install(t, t.game.cameraFollow, "follow", original => function (...args) {
            const result = original.apply(this, args);
            try {
                const s = t.game.getStatus();
                if (t.samples.length >= 40000) { t.cancelReason = "位置样本达到上限。"; return result; }
                t.samples.push({ atMs: now(), gameFrame: t.updateTimes.length, ...short(s),
                    history: s.avatar?.history?.slice(-5), cameraCast: t.lastCast ? { ...t.lastCast } : null });
            } catch (e) { t.cancelReason = `采样异常：${e.message}`; }
            return result;
        });
        if (t.type === "camera") {
            if (!t.game.cameraSphere?.shape || !t.game.world?.physicsSimulation?.shapeCast) throw new Incomplete("相机真实shapeCast观察接口不可用。");
            install(t, t.game.world.physicsSimulation, "shapeCast", original => function (...args) {
                const result = original.apply(this, args);
                if (args[0] === t.game.cameraSphere.shape) {
                    const a = args[1], b = args[2], hit = args[3];
                    t.lastCast = { atMs: now(), result: !!result, hitFraction: result && finite(hit?.hitFraction) ? hit.hitFraction : null,
                        from: [a.x, a.y, a.z], to: [b.x, b.y, b.z], source: "original game updateCamera shapeCast; no extra cast by probe" };
                }
                return result;
            });
        }
    }
    function restore(t) {
        if (t.restored) return; t.restored = true;
        for (const fn of t.restorers.reverse()) try { fn(); } catch (e) { t.result.errors.push(String(e)); }
        if (t.oldRate) { Laya.Render.frameInterval = t.oldRate.interval; Laya.stage.frameRate = t.oldRate.stage; }
    }
    window.addEventListener("pagehide", () => { if (active) { release(active); restore(active); } });
    for (const type of ["error", "unhandledrejection"]) window.addEventListener(type, e => {
        if (!active) return; const text = String(e.error?.message || e.reason?.message || e.message || e.reason || type);
        active.result.errors.push(text); active.cancelReason = text;
    });
    function measuredRate(t, start, end) {
        const n = t.updateTimes.filter(at => at >= start && at <= end).length, actual = n / ((end - start) / 1000);
        return { targetFps: t.fps, actualOnUpdateHz: round(actual), count: n, wallSeconds: round((end - start) / 1000),
            targetStatus: actual >= t.fps * .9 && actual <= t.fps * 1.1 ? "ACHIEVED" : "NOT TESTED" };
    }
    async function perspective(t, firstPerson) {
        if (t.game.getStatus().firstPerson !== firstPerson) { tap(t, ".touch-view"); await wait(200, t); }
        if (t.game.getStatus().firstPerson !== firstPerson) throw new Error("实际触屏视角按钮未切换。");
    }
    async function seed(t, point, label) {
        t.measurementActive = false;
        release(t); guard(t); t.phase = `test-only setup: ${label}`; say(t.phase);
        const before = t.game.getStatus().position.slice(), p = new Laya.Vector3(...point);
        t.game.motor.position = p; t.game.player.transform.position = p.clone();
        t.result.setups.push({ label, atMs: now(), before, requested: point.slice(), method: "test-only motor.position + player.transform.position", measurementActive: false });
        await wait(800, t); const until = now() + 2500;
        while (!t.game.getStatus().grounded && now() < until) await wait(100, t);
        const s = t.game.getStatus(); t.result.setups.at(-1).settled = s.position.slice();
        if (!s.grounded || !clear(s) || !t.samples.length) throw new Incomplete("起点未落地/输入未清空/未取得afterPhysics样本。");
    }
    async function aim(t, yaw, pitch = null) {
        for (let attempt = 0; attempt < 24; attempt++) {
            guard(t); const s = t.game.getStatus(), dyaw = angle(yaw - s.yaw), dpitch = pitch === null ? 0 : pitch - s.pitch;
            if (Math.abs(dyaw) < .012 && Math.abs(dpitch) < .012) return;
            const sensitivity = .004 * t.game.touchSensitivity;
            if (!finite(sensitivity) || sensitivity <= 0) throw new Incomplete("实际touchSensitivity不可用。");
            const p = press(t, ".touch-look"), maxX = Math.min(100, p.rect.width * .3), maxY = Math.min(80, p.rect.height * .25);
            p.x += Math.max(-maxX, Math.min(maxX, dyaw / sensitivity));
            p.y -= Math.max(-maxY, Math.min(maxY, dpitch / sensitivity));
            event("pointermove", p); lift(t, p); await wait(35, t);
        }
        throw new Error("通过触屏look调整朝向超时。");
    }
    function distance(s, target) { return Math.hypot(target[0] - s.position[0], target[1] - s.position[2]); }
    function teleportEvidence(t, since) {
        const calls = t.result.respawnCalls.filter(e => e.measurementActive && e.atMs >= since);
        return { probeMeasurementTeleportCount: 0, engineRespawnCount: calls.length, measurementTeleportCount: calls.length,
            engineRespawnCalls: calls, noEngineRespawnAssertion: { pass: calls.length === 0, expected: 0, actual: calls.length },
            teleportObservationScope: "Probe setup writes are explicit; original game.respawn is observed without suppressing its execution" };
    }
    async function route(t) {
        const recipe = RECIPES[t.routeName];
        t.result.recipe = { name: t.routeName, sourceName: recipe.sourceName || t.routeName, start: recipe.start, targets: recipe.targets, source: recipe.source || RECIPE_SOURCE };
        await seed(t, recipe.start, t.routeName); await perspective(t, t.routeView === "FP");
        t.measurementActive = true;
        for (let index = 0; index < recipe.targets.length; index++) {
            const target = recipe.targets[index], start = t.game.getStatus(), began = now(), sampleIndex = t.samples.length;
            t.phase = `${t.routeName} ${index + 1}/${recipe.targets.length}`; say(t.phase);
            const initialDistance = distance(start, target), timeout = Math.max(15000, initialDistance / Math.max(.1, t.game.walkSpeed) * 2500 + 8000);
            let best = initialDistance, progressAt = now(), maxStuckMs = 0, stick = null, stoppedChecks = 0;
            try {
                while (true) {
                    guard(t); const s = t.game.getStatus(), d = distance(s, target);
                    if (stick && s.touch && (s.touch.moving === false || s.touch.pointers === 0)) {
                        maxStuckMs = Math.max(maxStuckMs, now() - progressAt);
                        const error = new Incomplete(`游戏已清空移动输入（reset=${s.inputResetReason || "未提供"}）；本地摇杆指针仍在，停止本轮，不重新按下。`);
                        error.inputInterruption = { observedAtMs: now(), localPointerId: stick.id,
                            pointerStillOwnedByProbe: t.pointers.has(stick.id), millisecondsSinceLastProgress: round(now() - progressAt),
                            publicState: short(s), automaticRepressAttempted: false };
                        throw error;
                    }
                    if (d < best - .025) { best = d; progressAt = now(); }
                    maxStuckMs = Math.max(maxStuckMs, now() - progressAt);
                    if (d <= .2) {
                        if (stick) { lift(t, stick); stick = null; }
                        await wait(220, t); stoppedChecks++;
                        if (distance(t.game.getStatus(), target) <= .2) {
                            if (!t.game.getStatus().grounded) await wait(350, t);
                            if (distance(t.game.getStatus(), target) <= .2 && t.game.getStatus().grounded) break;
                            if (!t.game.getStatus().grounded) throw new Error("目标附近未重新落地，不能将空中经过判作路线通过。");
                        }
                        progressAt = now(); if (stoppedChecks > 8) throw new Error("目标附近无法稳定停在0.2m容差内。");
                    }
                    if (now() - began > timeout) throw new Error(`该段超过 ${Math.round(timeout / 1000)} 秒时限。`);
                    if (now() - progressAt > 4000) throw new Error("连续4秒无至少0.025m接近目标，判为卡住。");
                    const current = t.game.getStatus(), desired = Math.atan2(target[0] - current.position[0], -(target[1] - current.position[2]));
                    if (Math.abs(angle(desired - current.yaw)) > .035) {
                        if (stick) { lift(t, stick); stick = null; }
                        await aim(t, desired); progressAt = now();
                    }
                    if (!stick) stick = press(t, ".touch-stick");
                    const remaining = distance(t.game.getStatus(), target);
                    forward(stick, Math.max(.14, Math.min(1, (remaining - .07) / .9)));
                    await wait(65, t);
                }
                const end = t.game.getStatus(), samples = t.samples.slice(sampleIndex);
                const frameRate = measuredRate(t, began, now());
                t.result.cases.push({ label: t.phase, type: "route-segment", status: frameRate.targetStatus === "ACHIEVED" ? "PASS" : "INCOMPLETE",
                    target, toleranceMeters: .2, start: start.position, end: end.position, distance: round(distance(end, target)), grounded: end.grounded,
                    maxStuckMs: round(maxStuckMs), wallMs: round(now() - began), sampleCount: samples.length, frameRate,
                    heightRange: [Math.min(...samples.map(p => p.position[1])), Math.max(...samples.map(p => p.position[1]))],
                    groundedFraction: samples.length ? samples.filter(p => p.grounded).length / samples.length : null,
                    positions: bounded(samples.map(p => ({ atMs: p.atMs, position: p.position, grounded: p.grounded, yaw: p.yaw }))), ...teleportEvidence(t, began) });
                publish(true);
            } catch (error) {
                release(t); const end = t.game.getStatus(), samples = t.samples.slice(sampleIndex);
                t.result.cases.push({ label: t.phase, type: "route-segment", status: error instanceof Incomplete ? "INCOMPLETE" : "FAIL", target,
                    start: start.position, end: end.position, distance: round(distance(end, target)), reason: String(error.message),
                    maxStuckMs: round(maxStuckMs), inputInterruption: error.inputInterruption || null,
                    sampleCount: samples.length, positions: samples, samplePolicy: "All recorded failing-segment samples with touch/yaw/reset/update fields; no field removal or downsampling",
                    ...teleportEvidence(t, began) });
                throw error;
            } finally { if (stick) lift(t, stick); }
        }
    }
    async function jumpCase(t, running) {
        const expectedAir = running ? "RunJump" : "Jump", expectedLand = running ? "RunLand" : "Land";
        await seed(t, [0, 1.88, 100], expectedAir); await perspective(t, true);
        t.measurementActive = true;
        await aim(t, 0, 0);
        if (running) { toggleRun(t, true); const stick = press(t, ".touch-stick"); forward(stick, 1); await wait(450, t); }
        t.phase = `${expectedAir} / ${expectedLand} · FP`; say(t.phase);
        const start = t.game.getStatus(), began = now(), offset = t.samples.length;
        const oldEvents = new Set((start.avatar?.history || []).map(e => JSON.stringify(e)));
        const jump = press(t, ".touch-jump"); await wait(150, t); lift(t, jump);
        let airborne = false, landedAt = null;
        const deadline = now() + 4500;
        while (now() < deadline) {
            await wait(50, t);
            const samples = t.samples.slice(offset);
            if (samples.some(p => p.grounded === false)) airborne = true;
            if (airborne && t.game.getStatus().grounded && now() - began > 300) { landedAt = now(); break; }
        }
        release(t); await wait(500, t);
        const end = t.game.getStatus(), samples = t.samples.slice(offset), events = (end.avatar?.history || []).filter(e => !oldEvents.has(JSON.stringify(e)));
        const nativeStates = [...new Set([...samples.map(s => s.base), ...events.map(e => e.base)])].filter(Boolean);
        const peak = samples.length ? Math.max(...samples.map(s => s.position[1])) - start.position[1] : 0;
        const offsets = samples.map(s => s.firstPersonCameraOffset).filter(a => Array.isArray(a) && a.length === 3);
        const maxOffsetError = offsets.length ? Math.max(...offsets.map(a => Math.max(Math.abs(a[0]), Math.abs(a[1] - .72), Math.abs(a[2])))) : null;
        const assertions = [
            { label: "真实离地并回落", pass: start.grounded && airborne && !!landedAt && end.grounded && peak > .1 && Math.abs(end.position[1] - start.position[1]) < .08 },
            { label: "原生起跳和落地状态", pass: nativeStates.includes(expectedAir) && nativeStates.includes(expectedLand) },
            { label: "全过程FP相机偏移[0,.72,0]", pass: offsets.length === samples.length && maxOffsetError !== null && maxOffsetError <= .005 },
            { label: "输入清空", pass: clear(end) },
            { label: "测量期无引擎respawn", pass: t.measurementRespawnCount === 0 }
        ];
        const frameRate = measuredRate(t, began, now());
        t.result.cases.push({ label: t.phase, type: "jump", status: assertions.every(a => a.pass) ? frameRate.targetStatus === "ACHIEVED" ? "PASS" : "INCOMPLETE" : "FAIL",
            inputSource: "synthetic-input: actual touch-jump + optional run/joystick", start: start.position, end: end.position,
            peakAboveStartMeters: round(peak), landedAtMs: landedAt, nativeStates, nativeHistory: events, assertions,
            maxFpOffsetErrorMeters: round(maxOffsetError), sampleCount: samples.length, positions: bounded(samples), frameRate,
            ...teleportEvidence(t, began), lowCeilingRestriction: "NOT TESTED" }); publish(true);
    }
    async function cameraPhase(t, label, yaw) {
        await aim(t, yaw, CAMERA_RECIPE.pitch); await wait(800, t);
        const start = now(), index = t.samples.length; t.phase = label; say(label); await wait(800, t);
        const samples = t.samples.slice(index), distances = samples.map(s => s.cameraDistance).filter(finite);
        return { label, yaw, frameRate: measuredRate(t, start, now()), sampleCount: samples.length,
            minDistance: distances.length ? Math.min(...distances) : null, maxDistance: distances.length ? Math.max(...distances) : null,
            lastDistance: distances.at(-1) ?? null, hitSamples: samples.filter(s => s.cameraCast?.result).length,
            castSamples: samples.filter(s => s.cameraCast && s.cameraCast.atMs >= start).length,
            samples: bounded(samples.map(s => ({ atMs: s.atMs, position: s.position, camera: s.camera, cameraDistance: s.cameraDistance, cast: s.cameraCast })), 30) };
    }
    async function camera(t) {
        await seed(t, CAMERA_RECIPE.start, "entrance camera candidate"); await perspective(t, false);
        t.measurementActive = true; const began = now();
        const open = await cameraPhase(t, "TPS镜头朝空旷门廊", CAMERA_RECIPE.openYaw);
        const blocked = await cameraPhase(t, "TPS镜头靠近闭合门面", CAMERA_RECIPE.obstructedYaw);
        const restored = await cameraPhase(t, "TPS镜头重新展开", CAMERA_RECIPE.openYaw);
        const autoPass = open.castSamples > 0 && blocked.castSamples > 0 && restored.castSamples > 0 &&
            open.lastDistance > 1.3 && blocked.hitSamples > blocked.sampleCount * .7 && blocked.lastDistance < open.lastDistance - .3 &&
            restored.lastDistance >= open.lastDistance - .1 && blocked.lastDistance > .03;
        await aim(t, CAMERA_RECIPE.obstructedYaw, CAMERA_RECIPE.pitch); await wait(350, t);
        t.result.cases.push({ label: "TPS入口相机避障", type: "camera-obstacle", status: autoPass ? "INCOMPLETE" : "FAIL",
            numericStatus: autoPass ? "PASS" : "FAIL", recipe: CAMERA_RECIPE, open, blocked, restored,
            directCameraLengthWrites: 0, extraProbeShapeCasts: 0, ...teleportEvidence(t, began),
            visualReview: { status: "NOT TESTED", required: "保存实际靠墙画面，确认无穿墙/近裁剪异常；再人工转向查看镜头恢复。工具数值PASS不能替代画面。" } });
        t.result.finalCameraPose = "Left facing out of doorway with TPS camera against the closed door for visual review";
    }
    async function execute(type) {
        if (active) return;
        if (numericActive()) { say("数值探针正在运行，请等待完成后再启动路线探针。"); return; }
        const t = { type, started: now(), phase: "准备", game: null, fps: Number(fps.value), routeName: selectedRoute.value, routeView: view.value,
            pointers: new Map(), ownsRun: false, restorers: [], restored: false, updateTimes: [], samples: [], lastCast: null, cancelReason: null,
            measurementActive: false, measurementRespawnCount: 0, totalRespawnCount: 0, respawnInstrumented: false,
            result: { runId: `m01-route-${Date.now()}-${++sequence}`, type, startedAt: iso(), status: "RUNNING", inputSource: "synthetic-input",
                cases: [], setups: [], respawnCalls: [], droppedRespawnRecords: 0, errors: [] } };
        active = t; report.history.push(t.result);
        if (report.history.length > 8) { const old = report.history.shift(); report.archived.push({ runId: old.runId, status: old.status, type: old.type, cases: old.cases.map(c => ({ label: c.label, status: c.status, reason: c.reason })) }); if (report.archived.length > 40) report.archived.shift(); }
        try {
            t.game = game(); const s = t.game.getStatus();
            if (!s.ready || !s.touch?.enabled || s.inputMode !== "touch" || !clear(s) || document.hidden || !document.hasFocus()) throw new Incomplete("需要ready、空闲触屏控件和前台焦点。");
            if (![15, 60].includes(t.fps) || !window.Laya?.Render || !Laya.stage) throw new Incomplete("目标FPS或实际Render接口不可用。");
            t.result.environment = { userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], devicePixelRatio, targetFps: t.fps, initialView: s.firstPerson ? "FP" : "TPS" };
            t.oldRate = { interval: Laya.Render.frameInterval, stage: Laya.stage.frameRate };
            hooks(t); Laya.Render.frameInterval = 1000 / t.fps; Laya.stage.frameRate = "fast"; await wait(500, t);
            if (type === "route") await route(t);
            else if (type === "jumps") { await jumpCase(t, false); await jumpCase(t, true); }
            else await camera(t);
            t.result.status = t.result.cases.some(c => c.status === "FAIL") ? "FAIL" : t.result.cases.some(c => c.status === "INCOMPLETE") ? "INCOMPLETE" : "PASS";
        } catch (e) { t.result.status = e instanceof Incomplete ? "INCOMPLETE" : "FAIL"; t.result.reason = String(e.message); t.result.interruptedPhase = t.phase; }
        finally {
            release(t); restore(t); t.result.endedAt = iso(); t.result.wallMs = round(now() - t.started);
            try { t.result.end = short(t.game.getStatus()); } catch { }
            t.result.cleanup = { ownedPointersReleased: t.pointers.size === 0, ownRunToggleRestored: !t.ownsRun, methodsRestored: t.restored,
                frameInterval: window.Laya?.Render?.frameInterval, stageFrameRate: window.Laya?.stage?.frameRate };
            t.result.originalOnUpdateCalls = t.updateTimes.length; t.result.afterPhysicsSamples = t.samples.length;
            t.result.respawnAudit = { status: t.respawnInstrumented ? t.measurementRespawnCount === 0 ? "PASS" : "FAIL" : "NOT TESTED",
                totalCalls: t.totalRespawnCount, measurementCalls: t.measurementRespawnCount, requiredMeasurementCalls: 0,
                originalRespawnAlwaysExecuted: true, setupCallsSeparated: true };
            if (t.measurementRespawnCount) t.result.status = "FAIL";
            if (t.result.errors.length) t.result.status = "FAIL";
            active = null; say(`${t.result.status} · ${t.result.runId}。当前位置保留；相机画面需独立人工检查。`);
        }
    }
    function download() {
        publish(true); const href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
        const a = document.createElement("a"); a.href = href; a.download = `${report.history.at(-1)?.runId || "m01-routes-idle"}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
    }
    function mount() {
        panel = document.createElement("details"); panel.id = "m01-routes-panel";
        panel.style.cssText = "position:fixed;left:8px;top:8px;z-index:2147483646;width:330px;max-width:calc(100vw - 16px);max-height:80vh;overflow:auto;background:#18312cef;color:#edfff6;padding:10px;box-sizing:border-box;border:1px solid #8eada0;border-radius:8px;font:12px/1.5 system-ui";
        const summary = document.createElement("summary"); summary.textContent = "M0.1 路线 / 跳跃 / 相机回归"; panel.appendChild(summary);
        const help = document.createElement("p"); help.textContent = "显式开始才设置起点/FPS；途中仅触屏UI驱动。不复用旧PASS，不与数值探针并行。Esc/人工输入会中止。"; panel.appendChild(help);
        function select(name, values, initial) {
            const e = document.createElement("select"); e.dataset.m01RouteField = name; e.setAttribute("aria-label", name);
            for (const value of values) { const o = document.createElement("option"); o.value = o.textContent = value; e.appendChild(o); }
            e.value = initial; e.style.maxWidth = "100%"; panel.appendChild(e); return e;
        }
        fps = select("fps", [15, 60], 60); view = select("view", ["FP", "TPS"], "FP");
        selectedRoute = select("route", Object.keys(RECIPES), "white_stairs_up");
        const actions = document.createElement("div"); actions.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;margin-top:8px"; panel.appendChild(actions);
        function button(name, label, fn, tracked = true) {
            const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.dataset.m01RouteAction = name;
            b.style.cssText = "background:#2b5b4c;color:white;border:1px solid #8eada0;border-radius:4px;padding:5px;font:inherit";
            b.addEventListener("click", fn); actions.appendChild(b); if (tracked) actionButtons.push(b); return b;
        }
        button("route", "运行所选主要路线", () => { void execute("route"); });
        button("jumps", "原地跳 + 跑跳", () => { void execute("jumps"); });
        button("camera", "TPS入口相机避障", () => { void execute("camera"); });
        button("download", "下载JSON历史", download, false); stopButton = button("stop", "停止", () => cancel("用户停止，结果保留。"), false); stopButton.hidden = true;
        message = document.createElement("p"); message.textContent = "等待显式操作；旧路线结果未加载。"; message.setAttribute("aria-live", "polite"); panel.appendChild(message);
        results = document.createElement("pre"); results.style.cssText = "white-space:pre-wrap;font:11px/1.4 system-ui"; panel.appendChild(results);
        panel.addEventListener("pointerdown", e => e.stopPropagation()); document.body.appendChild(panel);
        setInterval(() => { try { report.live = short(status()); } catch { report.live = null; } publish(); }, 250); publish(true);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
})();
