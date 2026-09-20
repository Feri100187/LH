/* Optional, development-only DOM probe. The --probe server injects this file in
 * the HTTP response; it is not part of the game build or its public input API. */
(() => {
    "use strict";
    const ROOT_ID = "baseline-runtime-probe";
    if (document.getElementById(ROOT_ID)) return;
    const SAMPLE_LIMIT = 200, ERROR_LIMIT = 50, RAF_LIMIT = 20000;
    const clock = () => performance.now();
    const finite = value => typeof value === "number" && Number.isFinite(value);
    const round = value => finite(value) ? Math.round(value * 1000) / 1000 : null;
    const wrap = value => Math.atan2(Math.sin(value), Math.cos(value));
    const nowIso = () => new Date().toISOString();
    const report = {
        schemaVersion: 1, probe: "LH DOM runtime baseline", createdAt: nowIso(), url: location.href, environment: null,
        inputSource: "synthetic-input", status: "IDLE", lastOperation: null, active: null, latest: null,
        smoke: null, touchSmoke: null, performance: null, samples: [], sampleLimit: SAMPLE_LIMIT, droppedSamples: 0,
        errors: [], errorCount: 0, droppedErrors: 0,
        notVerified: ["真实物理键盘与鼠标点击/锁定交互", "pointer capture", "手机硬件及多指输入", "GPU 帧时", "全场景障碍和碰撞覆盖", "模型/材质的人工画面验收"],
        notes: ["只读取公开 HUD JSON；键盘测试派发 document KeyboardEvent，触屏测试派发公开控件的 PointerEvent。", "FPS 和 RAF 测量来自当前可见页面，可能受工具、窗口焦点、浏览器调度影响。"]
    };
    let root, message, summary, results, smokeButton, touchButton, fpsButton, stopButton;
    let active = null, latest = null, lastPlayerRaw = null, playerChangedAt = 0, lastPublish = 0;
    let pollTimer = null, sequence = 0, pointerSequence = 50000, hasReadyEnvironment = false;
    const isSmoke = task => task?.kind === "smoke" || task?.kind === "touch-smoke";
    const keyInfo = {
        KeyW: ["w", 87], KeyS: ["s", 83], KeyA: ["a", 65], KeyD: ["d", 68],
        ShiftLeft: ["Shift", 16], Space: [" ", 32], KeyF: ["f", 70], KeyV: ["v", 86]
    };
    function failIncomplete(reason) { const error = new Error(reason); error.probeIncomplete = true; throw error; }
    function setMessage(text) { if (message) message.textContent = text; }
    function publish(force = false) {
        if (!root || (!force && clock() - lastPublish < 500)) return;
        lastPublish = clock(); report.updatedAt = nowIso();
        report.status = active ? "RUNNING" : (report[report.lastOperation]?.status || "IDLE");
        report.active = active ? { kind: active.kind, inputSource: active.inputSource || null, stage: active.stage,
            heldKeys: [...active.held], heldPointers: [...(active.pointers?.keys() || [])], elapsedMs: round(clock() - active.started) } : null;
        root.dataset.baselineStatus = JSON.stringify(report);
        summary.textContent = `运行基线 · ${active ? active.stage : report.status}`;
        smokeButton.disabled = touchButton.disabled = fpsButton.disabled = !!active;
        stopButton.hidden = !active;
        const steps = report[active?.operation || report.lastOperation]?.steps || report.touchSmoke?.steps || report.smoke?.steps || [];
        results.textContent = steps.slice(-5).map(step => `${step.status}  ${step.label}`).join("\n");
        if (!active && report.performance) results.textContent += `${steps.length ? "\n" : ""}${report.performance.status}  可见页面 FPS / RAF 采样`;
    }
    function errorRecord(kind, detail) {
        report.errorCount++;
        report.errors.push({ at: nowIso(), elapsedMs: round(clock()), stage: active?.stage || null, kind, ...detail });
        if (report.errors.length > ERROR_LIMIT) { report.errors.shift(); report.droppedErrors++; }
        publish(true);
    }
    window.addEventListener("error", event => {
        const target = event.target;
        errorRecord(event.message ? "error" : "resource-error", {
            message: String(event.message || "资源加载失败").slice(0, 1000),
            file: String(event.filename || target?.src || target?.href || "").slice(0, 1000),
            line: event.lineno || null, column: event.colno || null,
            stack: String(event.error?.stack || "").slice(0, 2000)
        });
    }, true);
    window.addEventListener("unhandledrejection", event => {
        errorRecord("unhandledrejection", { message: String(event.reason?.message || event.reason).slice(0, 1000), stack: String(event.reason?.stack || "").slice(0, 2000) });
    });
    function parseHud(raw, field) {
        if (!raw) return null;
        try { return JSON.parse(raw); }
        catch { return { diagnosticParseError: field }; }
    }
    function refreshEnvironment() {
        const canvases = [...document.querySelectorAll("canvas")].slice(0, 8).map(canvas => ({
            id: canvas.id || null, width: canvas.width, height: canvas.height,
            clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight
        })).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
        report.environment = { capturedAt: nowIso(), userAgent: navigator.userAgent,
            viewport: [window.innerWidth, window.innerHeight], devicePixelRatio: window.devicePixelRatio,
            canvas: canvases[0] || null, canvasSelection: "largest CSS-area canvas from DOM", canvases };
    }
    function compact(player) {
        if (!player || typeof player !== "object") return null;
        const avatar = player.avatar || {}, arms = player.firstPersonArms || {};
        return {
            ready: player.ready, locked: player.locked, firstPerson: player.firstPerson, grounded: player.grounded,
            position: player.position, yaw: round(player.yaw), speed: round(player.speed), fps: player.fps, keys: player.keys,
            triggerHeld: player.triggerHeld, cameraDistance: round(player.cameraDistance), touch: player.touch,
            avatar: { loaded: avatar.loaded, motion: avatar.motion, base: avatar.base, upper: avatar.upper,
                direction: avatar.direction, heading: round(avatar.heading), shooting: avatar.shooting,
                shots: avatar.shots, visibleMeshes: avatar.visibleMeshes },
            arms: { visible: arms.visible, base: arms.base, meshes: arms.meshes, cameraParent: arms.cameraParent }
        };
    }
    function poll() {
        const hud = document.getElementById("lingshui-hud");
        const raw = hud?.dataset.playerStatus || null;
        if (raw !== lastPlayerRaw) { lastPlayerRaw = raw; playerChangedAt = clock(); }
        latest = { player: parseHud(raw, "playerStatus"), ducks: parseHud(hud?.dataset.duckStatus, "duckStatus") };
        if (latest.player?.ready && !hasReadyEnvironment) { refreshEnvironment(); hasReadyEnvironment = true; }
        report.latest = { ...latest, readAt: nowIso(), playerUnchangedForMs: round(clock() - playerChangedAt), visible: !document.hidden, focused: document.hasFocus() };
        if (active) {
            const sample = { elapsedMs: round(clock() - active.started), stage: active.stage,
                visible: !document.hidden, focused: document.hasFocus(), player: compact(latest.player),
                duckCount: Array.isArray(latest.ducks) ? latest.ducks.length : null };
            report.samples.push(sample);
            if (report.samples.length > SAMPLE_LIMIT) { report.samples.shift(); report.droppedSamples++; }
            if (active.observations && sample.player) active.observations.push(sample.player);
            if (active.observations?.length > 60) active.observations.shift();
            if (active.kind === "performance") samplePerformance(active);
        }
        publish();
    }
    function key(code, down, task) {
        const info = keyInfo[code];
        if (!info) throw new Error(`Unknown probe key ${code}`);
        if (down) task.held.add(code); else task.held.delete(code);
        document.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", {
            key: info[0], code, keyCode: info[1], which: info[1], bubbles: true, cancelable: true,
            repeat: false, shiftKey: task.held.has("ShiftLeft"), location: code === "ShiftLeft" ? 1 : 0
        }));
    }
    function control(selector) {
        const element = document.querySelector(`#lingshui-hud ${selector}`);
        const rect = element?.getBoundingClientRect();
        if (!element?.isConnected || !rect || rect.width < 2 || rect.height < 2) failIncomplete(`触屏控件不可用：${selector}`);
        return { element, rect };
    }
    function pointerEvent(type, pointer, target = document) {
        target.dispatchEvent(new PointerEvent(type, { pointerId: pointer.id, pointerType: "touch", isPrimary: pointer.primary,
            clientX: pointer.x, clientY: pointer.y, button: type === "pointermove" ? -1 : 0,
            buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
            pressure: type === "pointerup" || type === "pointercancel" ? 0 : .5,
            bubbles: true, cancelable: true, composed: true }));
    }
    function beginPointer(task, selector) {
        const { element, rect } = control(selector);
        const pointer = { id: ++pointerSequence, target: selector, x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2, primary: task.pointers.size === 0 };
        task.pointers.set(pointer.id, pointer); pointerEvent("pointerdown", pointer, element);
        return { pointer, rect };
    }
    function endPointer(task, pointer) {
        try { pointerEvent("pointerup", pointer); }
        finally { task.pointers.delete(pointer.id); }
    }
    function setOwnedRun(task, enabled) {
        const button = document.querySelector("#lingshui-hud .touch-run");
        const running = button?.getAttribute("aria-pressed") === "true";
        if (!enabled && (!task.ownedRunToggle || !running)) { task.ownedRunToggle = false; return; }
        if (enabled && running) failIncomplete("触屏奔跑已经开启；请先通过原按钮关闭后再测试。");
        if (enabled) task.ownedRunToggle = true;
        const { pointer } = beginPointer(task, ".touch-run"); endPointer(task, pointer);
        const result = button.getAttribute("aria-pressed") === "true";
        if (result !== enabled) throw new Error("触屏奔跑按钮未切换到预期状态。");
        if (!enabled) task.ownedRunToggle = false;
    }
    function beginInput(task, codes) {
        if (task.inputMode !== "touch") { for (const code of codes) key(code, true, task); return; }
        if (codes.includes("ShiftLeft")) setOwnedRun(task, true);
        const x = Number(codes.includes("KeyD")) - Number(codes.includes("KeyA"));
        const z = Number(codes.includes("KeyW")) - Number(codes.includes("KeyS"));
        if (x || z) {
            const { pointer, rect } = beginPointer(task, ".touch-stick"), distance = rect.width * .40 / Math.hypot(x, z);
            pointer.x += x * distance; pointer.y -= z * distance;
            pointerEvent("pointermove", pointer);
        }
        for (const [code, selector] of [["Space", ".touch-jump"], ["KeyF", ".touch-shoot"], ["KeyV", ".touch-view"]]) {
            if (codes.includes(code)) beginPointer(task, selector);
        }
    }
    function release(task) {
        for (const code of [...task.held].reverse()) {
            try { key(code, false, task); }
            catch (error) { task.held.delete(code); errorRecord("probe-key-release", { message: String(error) }); }
        }
        for (const pointer of [...(task.pointers?.values() || [])]) {
            try { endPointer(task, pointer); }
            catch (error) { errorRecord("probe-pointer-release", { message: String(error) }); }
        }
        if (task.ownedRunToggle) {
            try { setOwnedRun(task, false); }
            catch (error) { errorRecord("probe-run-toggle-release", { message: String(error) }); }
        }
    }
    function cancel(reason) {
        if (!active) return;
        active.cancelReason = reason; release(active); setMessage(reason); publish(true);
    }
    window.addEventListener("blur", () => { if (isSmoke(active) && active.armed) cancel("窗口失焦，合成输入测试已中止。"); });
    document.addEventListener("visibilitychange", () => {
        if (isSmoke(active) && active.armed && document.hidden) cancel("页面进入后台，合成输入测试已中止。");
        if (active?.kind === "performance") { accountVisibility(active); active.lastRaf = null; }
    });
    document.addEventListener("pointerlockchange", () => {
        if (active?.kind === "smoke" && active.armed && !document.pointerLockElement) cancel("鼠标锁定已解除，合成按键测试已中止。");
    });
    document.addEventListener("keydown", event => {
        if (!active || !event.isTrusted) return;
        if (event.code === "Escape") cancel("已按 Esc 停止测试。");
        else if (isSmoke(active) && active.armed && (active.inputMode === "touch" || keyInfo[event.code])) cancel("检测到人工按键，结果存在混合输入；请重新测试。");
    });
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "wheel"]) {
        document.addEventListener(type, event => {
            if (event.isTrusted && active?.inputMode === "touch" && active.armed) cancel("检测到人工指针操作，触屏合成测试已中止；请重新测试。");
        }, { capture: true, passive: true });
    }
    window.addEventListener("pagehide", () => { if (active) { active.cancelReason = "页面离开"; release(active); } });
    function guard(task) {
        if (task.cancelReason) failIncomplete(task.cancelReason);
        if (active !== task) failIncomplete("测试会话已更换。");
        if (!task.armed) return;
        if (document.hidden || !document.hasFocus()) failIncomplete("输入前置条件丢失：需页面可见且有焦点。");
        if (task.inputMode === "touch") {
            if (latest?.player?.inputMode !== "touch" || latest.player.touch?.enabled !== true) failIncomplete("公开触屏输入模式已关闭。");
        } else if (!document.pointerLockElement || !latest?.player?.locked) failIncomplete("输入前置条件丢失：需真实锁定鼠标。");
        if (!latest.player.ready || clock() - playerChangedAt > 1600) failIncomplete("公开玩家状态未就绪或停止更新。");
        if (clock() - task.armedAt > 60000) failIncomplete("按键冒烟测试执行超过 60 秒时限。");
    }
    async function delay(ms, task) {
        const until = clock() + ms;
        do { guard(task); await new Promise(resolve => setTimeout(resolve, Math.min(50, Math.max(1, until - clock())))); } while (clock() < until);
        guard(task);
    }
    async function waitForLock(task) {
        task.stage = "等待游戏锁定鼠标";
        setMessage("已准备测试。请在空旷平地点击原游戏入口锁定鼠标；随后自动按键。Esc 可中止。"); publish(true);
        const deadline = clock() + 60000;
        while (clock() < deadline) {
            guard(task);
            const p = latest?.player;
            if (p?.ready && p.avatar?.loaded && p.locked && p.inputMode === "desktop" && document.pointerLockElement && document.hasFocus() && !document.hidden) {
                task.armed = true; task.armedAt = clock(); report[task.operation].inputReadyAt = nowIso(); return;
            }
            await delay(100, task);
        }
        failIncomplete("60 秒内未获得可用的真实桌面鼠标锁定；此浏览器可能不支持 Pointer Lock。");
    }
    async function waitForTouch(task) {
        task.stage = "等待公开触屏 UI 就绪"; setMessage("准备触屏合成测试；保持页面前台，请勿同时手动操作。"); publish(true);
        if (typeof PointerEvent !== "function") failIncomplete("浏览器不支持 PointerEvent。");
        const deadline = clock() + 10000;
        while (clock() < deadline) {
            guard(task); const p = latest?.player;
            if (p?.ready && p.avatar?.loaded && p.inputMode === "touch" && p.touch?.enabled && !document.hidden && document.hasFocus()) {
                if (p.touch.running || p.touch.pointers || p.touch.moving || p.touch.shooting) failIncomplete("触屏控件当前正在使用或奔跑已开启；请先松开控件并关闭奔跑。");
                for (const selector of [".touch-stick", ".touch-run", ".touch-jump", ".touch-shoot", ".touch-view"]) control(selector);
                task.armed = true; task.armedAt = clock(); report[task.operation].inputReadyAt = nowIso(); return;
            }
            await delay(100, task);
        }
        failIncomplete("10 秒内触屏 UI 未就绪；请使用游戏已有的 ?controls=touch 入口，保持页面有焦点。");
    }
    async function observe(task, id, label, codes, holdMs, settleMs = 0) {
        guard(task); task.stage = label; task.observations = [];
        const start = compact(latest?.player), began = clock();
        setMessage(`${label}（${task.inputMode === "touch" ? "合成触屏" : "合成按键"}）；Esc 可中止。`); publish(true);
        try {
            beginInput(task, codes);
            await delay(holdMs, task);
        } finally { release(task); }
        if (settleMs) await delay(settleMs, task);
        const samples = task.observations.slice(); task.observations = null;
        const end = compact(latest?.player);
        return { id, label, reportKey: task.operation, inputSource: task.inputSource, equivalentKeys: codes, holdMs, settleMs,
            elapsedMs: round(clock() - began), samples, start, end };
    }
    function finishStep(step, checks) {
        const { samples, ...base } = step;
        const evidence = {
            ...base, observedSampleCount: samples.length,
            observedStates: [...new Set(samples.map(p => p.avatar?.base).filter(Boolean))],
            observedDirections: [...new Set(samples.map(p => p.avatar?.direction).filter(Boolean))],
            maxSpeed: round(Math.max(0, ...samples.map(p => finite(p.speed) ? p.speed : 0)))
        };
        const assertions = checks.map(([name, passed, actual]) => ({ name, status: passed === null ? "INCOMPLETE" : passed ? "PASS" : "FAIL", actual }));
        const status = assertions.some(a => a.status === "FAIL") ? "FAIL" : assertions.some(a => a.status === "INCOMPLETE") ? "INCOMPLETE" : "PASS";
        report[step.reportKey].steps.push({ ...evidence, status, assertions }); publish(true);
    }
    function movementChecks(step, expected, x, z) {
        const samples = step.samples, a = step.start, b = step.end;
        const positions = Array.isArray(a?.position) && Array.isArray(b?.position) && finite(a.yaw);
        let forwardTravel = null;
        if (positions) {
            const norm = Math.hypot(x, z), dx = (Math.cos(a.yaw) * x + Math.sin(a.yaw) * z) / norm;
            const dz = (Math.sin(a.yaw) * x - Math.cos(a.yaw) * z) / norm;
            forwardTravel = (b.position[0] - a.position[0]) * dx + (b.position[2] - a.position[2]) * dz;
        }
        const headings = samples.filter(p => finite(p.yaw) && finite(p.avatar?.heading));
        const headingError = headings.length ? Math.max(...headings.map(p => Math.abs(wrap(p.avatar.heading + p.yaw - Math.PI)))) : null;
        return [
            ["真实原生动作状态", samples.length ? samples.some(p => p.avatar?.base === expected) : null, expected],
            ["观察到有效移动速度", samples.length ? samples.some(p => p.speed > .1) : null, Math.max(0, ...samples.map(p => p.speed || 0))],
            ["位移沿输入方向", forwardTravel === null ? null : forwardTravel > .06, round(forwardTravel)],
            ["身体保持面向视线", headingError === null ? null : headingError < .07, round(headingError)]
        ];
    }
    async function smoke(inputMode = "keyboard") {
        if (active) return;
        refreshEnvironment();
        const touch = inputMode === "touch", operation = touch ? "touchSmoke" : "smoke";
        const task = active = { id: ++sequence, kind: touch ? "touch-smoke" : "smoke", operation, inputMode,
            inputSource: touch ? "synthetic-touch-input" : "synthetic-input", stage: "准备", started: clock(),
            held: new Set(), pointers: new Map(), ownedRunToggle: false, armed: false, cancelReason: null };
        report.samples = []; report.droppedSamples = 0;
        report.lastOperation = operation; report.inputSource = task.inputSource;
        const outcome = report[operation] = { runId: `${task.kind}-${Date.now()}-${task.id}`, status: "RUNNING", startedAt: nowIso(), inputSource: task.inputSource, steps: [], limitations: "会正常移动角色；障碍、地形、人工操作和低帧率会影响结果，不能代替真实硬件输入、原生指针捕获验收。" };
        try {
            if (touch) await waitForTouch(task); else await waitForLock(task);
            const idle = await observe(task, "ready-idle", "就绪与待机", [], 750);
            finishStep(idle, [["玩家和动画加载", idle.end?.ready === true && idle.end?.avatar?.loaded === true, idle.end?.avatar?.loaded],
                ["地面待机", idle.samples.some(p => p.grounded && p.avatar?.base === "Idle"), idle.end?.avatar?.base]]);
            const moves = [
                ["walk-forward", "W 前进", ["KeyW"], "Walk", 0, 1], ["walk-back", "S 后退", ["KeyS"], "WalkBack", 0, -1],
                ["walk-left", "A 左移", ["KeyA"], "WalkLeft", -1, 0], ["walk-right", "D 右移", ["KeyD"], "WalkRight", 1, 0],
                ["walk-forward-left", "W+A 左前", ["KeyW", "KeyA"], "WalkForwardLeft", -1, 1],
                ["walk-back-right", "S+D 右后", ["KeyS", "KeyD"], "WalkBackRight", 1, -1],
                ["walk-forward-right", "W+D 右前", ["KeyW", "KeyD"], "WalkForwardRight", 1, 1],
                ["walk-back-left", "S+A 左后", ["KeyS", "KeyA"], "WalkBackLeft", -1, -1],
                ["run-forward", "Shift+W 奔跑", ["ShiftLeft", "KeyW"], "Run", 0, 1]
            ];
            for (const [id, label, keys, expected, x, z] of moves) {
                const step = await observe(task, id, label, keys, 850, 200);
                finishStep(step, movementChecks(step, expected, x, z));
            }
            const jump = await observe(task, "jump-land", "Space 起跳与落地", ["Space"], 750, 1800);
            const air = jump.samples.findIndex(p => p.grounded === false);
            const landed = air >= 0 && jump.samples.slice(air + 1).some(p => p.grounded === true);
            const peak = Array.isArray(jump.start?.position) ? Math.max(...jump.samples.map(p => p.position?.[1] ?? -Infinity)) - jump.start.position[1] : null;
            finishStep(jump, [["起跳前在地面", jump.start?.grounded === true, jump.start?.grounded],
                ["观察到腾空", air >= 0, air], ["起跳高度增加", peak === null ? null : peak > .08, round(peak)],
                ["在时限内落地", landed && jump.end?.grounded === true, jump.end?.grounded]]);
            const fire = await observe(task, "fire-hold", "F 长按连射", ["KeyF"], 1000);
            const shots = finite(fire.start?.avatar?.shots) && finite(fire.end?.avatar?.shots) ? fire.end.avatar.shots - fire.start.avatar.shots : null;
            finishStep(fire, [["长按触发至少三次发射", shots === null ? null : shots >= 3, shots],
                ["射击动作与扳机状态", fire.samples.some(p => p.triggerHeld && p.avatar?.shooting), fire.samples.some(p => p.avatar?.shooting)]]);
            const released = await observe(task, "fire-release", "F 松开停止连射", [], 850);
            const tail = released.samples.slice(-4), counts = tail.map(p => p.avatar?.shots).filter(finite);
            finishStep(released, [["松开后停止射击", released.end ? !released.end.triggerHeld && !released.end.avatar?.shooting : null, released.end?.avatar?.shooting],
                ["尾段发射数稳定", counts.length >= 3 ? new Set(counts).size === 1 : null, counts]]);
            for (let index = 1; index <= 2; index++) {
                const view = await observe(task, `view-${index}`, `V 切换视角 ${index}/2`, ["KeyV"], 750, 150);
                const changed = typeof view.start?.firstPerson === "boolean" && typeof view.end?.firstPerson === "boolean";
                const p = view.end;
                finishStep(view, [["视角标志改变", changed ? p.firstPerson !== view.start.firstPerson : null, p?.firstPerson],
                    ["世界角色与相机双臂互斥", p?.avatar && p?.arms ? (p.firstPerson ? p.avatar.visibleMeshes === 0 && p.arms.visible === true : p.avatar.visibleMeshes > 0 && p.arms.visible === false) : null,
                        p ? { firstPerson: p.firstPerson, worldMeshes: p.avatar?.visibleMeshes, armsVisible: p.arms?.visible } : null]]);
            }
            outcome.status = report.errorCount || outcome.steps.some(s => s.status === "FAIL") ? "FAIL" : outcome.steps.some(s => s.status === "INCOMPLETE") ? "INCOMPLETE" : "PASS";
            outcome.errorCountSinceProbeLoad = report.errorCount;
            setMessage(`${touch ? "合成触屏" : "合成按键"}测试 ${outcome.status}；此结果不代表真实鼠标捕获或手机硬件已通过。`);
        } catch (error) {
            outcome.status = error.probeIncomplete ? "INCOMPLETE" : "FAIL";
            outcome.interruptedAt = task.stage; outcome.reason = String(error.message || error);
            setMessage(`${outcome.status}：${outcome.reason}`);
        } finally {
            release(task); task.observations = null;
            outcome.endedAt = nowIso(); outcome.elapsedMs = round(clock() - task.started);
            outcome.releasedAllOwnedKeys = task.held.size === 0;
            outcome.releasedAllOwnedPointers = task.pointers.size === 0;
            outcome.restoredOwnedRunToggle = !task.ownedRunToggle;
            if (active === task) active = null; publish(true);
        }
    }
    function statistics(values) {
        if (!values.length) return { n: 0, mean: null, p50: null, p95: null, min: null, max: null };
        const sorted = values.slice().sort((a, b) => a - b);
        const percentile = p => { const index = (sorted.length - 1) * p, lo = Math.floor(index); return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (index - lo); };
        return { n: values.length, mean: round(values.reduce((a, b) => a + b, 0) / values.length),
            p50: round(percentile(.5)), p95: round(percentile(.95)), min: round(sorted[0]), max: round(sorted[sorted.length - 1]) };
    }
    function accountVisibility(task) {
        const time = clock(), elapsed = time - task.accountAt;
        if (task.wasVisible) task.visibleMs += elapsed; else task.hiddenMs += elapsed;
        if (!task.wasFocused) task.unfocusedMs += elapsed;
        task.accountAt = time; task.wasVisible = !document.hidden; task.wasFocused = document.hasFocus();
    }
    function samplePerformance(task) {
        accountVisibility(task);
        if (!document.hidden && clock() >= task.nextHudSample) {
            if (latest?.player?.ready && finite(latest.player.fps) && latest.player.fps > 0) task.hudFps.push(latest.player.fps);
            task.nextHudSample = clock() + 1000;
        }
        task.stage = `FPS / RAF ${Math.min(30, Math.floor(task.visibleMs / 1000))}/30 秒`;
    }
    async function performanceSample() {
        if (active) return;
        refreshEnvironment();
        const time = clock();
        const task = active = { id: ++sequence, kind: "performance", stage: "FPS / RAF 准备", started: time,
            held: new Set(), cancelReason: null, armed: false, raf: [], hudFps: [], rafOverflow: 0, lastRaf: null,
            accountAt: time, wasVisible: !document.hidden, wasFocused: document.hasFocus(), visibleMs: 0, hiddenMs: 0, unfocusedMs: 0,
            nextHudSample: time + 1000, rafHandle: 0, errorsBefore: report.errorCount };
        report.samples = []; report.droppedSamples = 0;
        report.lastOperation = "performance";
        report.performance = { runId: `fps-${Date.now()}-${task.id}`, status: "RUNNING", startedAt: nowIso(), targetVisibleMs: 30000,
            measurement: "公开 HUD fps 和可见页面 requestAnimationFrame 间隔；不是 GPU 帧时。" };
        setMessage("开始 30 秒可见页面采样；无需操作，隐藏时间剔除，最多等待 60 秒。可按 Esc 或停止。"); publish(true);
        const tick = timestamp => {
            if (active !== task || task.cancelReason) return;
            if (!document.hidden) {
                if (task.lastRaf !== null) {
                    const elapsed = timestamp - task.lastRaf;
                    if (finite(elapsed) && elapsed > 0) {
                        if (task.raf.length < RAF_LIMIT) task.raf.push(elapsed); else task.rafOverflow++;
                    }
                }
                task.lastRaf = timestamp;
            } else task.lastRaf = null;
            task.rafHandle = requestAnimationFrame(tick);
        };
        try {
            if (!latest?.player?.ready) failIncomplete("公开玩家状态尚未 ready，未开始帧率测量。");
            task.rafHandle = requestAnimationFrame(tick);
            while (task.visibleMs < 30000) {
                guard(task); accountVisibility(task);
                if (clock() - task.started > 60000) failIncomplete("60 秒内未积累到 30 秒可见页面样本。");
                await delay(100, task);
            }
            if (task.raf.length < 2 || task.hudFps.length < 2 || task.rafOverflow) failIncomplete("有效 RAF / HUD 样本不足，或超过采样容量。");
            report.performance.status = report.errorCount > task.errorsBefore ? "FAIL" : "PASS";
        } catch (error) {
            report.performance.status = error.probeIncomplete ? "INCOMPLETE" : "FAIL";
            report.performance.reason = String(error.message || error);
        } finally {
            cancelAnimationFrame(task.rafHandle); accountVisibility(task); release(task);
            Object.assign(report.performance, { endedAt: nowIso(), wallElapsedMs: round(clock() - task.started),
                visibleElapsedMs: round(task.visibleMs), hiddenExcludedMs: round(task.hiddenMs), unfocusedMs: round(task.unfocusedMs),
                hudFps: statistics(task.hudFps), rafIntervalMs: statistics(task.raf), rafOverflow: task.rafOverflow,
                intervalsOver250ms: task.raf.filter(ms => ms > 250).length, runtimeErrorsDuringSample: report.errorCount - task.errorsBefore,
                pageVisibleAndFocusedAtEnd: !document.hidden && document.hasFocus(),
                caveat: "页面 RAF 间隔受浏览器/工具调度影响；HUD fps 为游戏公开计数，二者均非 GPU 时间。隐藏期间及恢复后的第一段 RAF 间隔已剔除。" });
            if (active === task) active = null;
            setMessage(`FPS / RAF 采样 ${report.performance.status}。可下载 JSON 查看统计及后台影响。`); publish(true);
        }
    }
    function download() {
        publish(true);
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob), link = document.createElement("a");
        const runId = report[report.lastOperation]?.runId || "idle";
        link.href = url; link.download = `lh-runtime-baseline-${runId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function mount() {
        if (document.getElementById(ROOT_ID)) return;
        root = document.createElement("details"); root.id = ROOT_ID; root.open = true;
        root.style.cssText = "position:fixed;right:10px;top:10px;z-index:2147483646;width:292px;max-width:calc(100vw - 20px);max-height:65vh;overflow:auto;box-sizing:border-box;background:#18232ef2;color:#edf5fa;border:1px solid #8093a5;border-radius:8px;padding:9px;font:12px/1.5 system-ui,sans-serif;box-shadow:0 3px 14px #0005;user-select:text";
        summary = document.createElement("summary"); summary.textContent = "运行基线 · IDLE"; summary.style.cursor = "pointer"; root.appendChild(summary);
        const help = document.createElement("p"); help.textContent = "开发测试工具；默认不发输入。请在空旷平地测试。键盘测试需原入口锁鼠标；触屏测试需已有触屏模式。Esc 中止。"; root.appendChild(help);
        const buttons = document.createElement("div"); buttons.style.cssText = "display:flex;flex-wrap:wrap;gap:6px"; root.appendChild(buttons);
        function button(action, label, callback) {
            const element = document.createElement("button"); element.type = "button"; element.dataset.baselineAction = action;
            element.textContent = label; element.style.cssText = "border:1px solid #90a2b3;border-radius:5px;background:#30495e;color:white;padding:5px 7px;cursor:pointer;font:inherit";
            element.addEventListener("click", callback); buttons.appendChild(element); return element;
        }
        smokeButton = button("smoke", "自动按键冒烟测试", () => { void smoke(); });
        touchButton = button("touch-smoke", "触屏合成冒烟测试", () => { void smoke("touch"); });
        fpsButton = button("fps", "30秒 FPS / RAF 采样", () => { void performanceSample(); });
        button("download", "下载 JSON", download);
        stopButton = button("stop", "停止", () => cancel("已手动停止测试。")); stopButton.hidden = true;
        message = document.createElement("p"); message.setAttribute("aria-live", "polite"); message.textContent = "等待操作；公开 HUD 每 100 毫秒只读采样。"; root.appendChild(message);
        results = document.createElement("pre"); results.style.cssText = "margin:0;white-space:pre-wrap;font:11px/1.5 system-ui,sans-serif"; root.appendChild(results);
        root.addEventListener("pointerdown", event => event.stopPropagation());
        document.body.appendChild(root); refreshEnvironment(); poll(); publish(true); pollTimer = setInterval(poll, 100);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
    window.addEventListener("pagehide", () => { if (pollTimer !== null) clearInterval(pollTimer); });
})();
