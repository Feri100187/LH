/* Local, opt-in release timing sidecar. Real DOM input and clocks; never writes the game's HUD. */
(() => {
    "use strict";
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(location.hostname) || document.getElementById("m01-input-timing-panel")) return;
    const now = () => performance.now(), iso = () => new Date().toISOString();
    const report = { protocol: "m01-input-release-v1", createdAt: iso(), url: location.href, userAgent: navigator.userAgent, status: "IDLE", active: null, history: [], archived: [],
        boundaries: ["synthetic pointer events through actual .touch-shoot", "no teleport or clock substitution", "original HUD is read-only", "visual firing pulse may finish within 0.2s; it is not a held-input leak"] };
    let active = null, sequence = 0, pointerId = 91000, panel, message, startButton, stopButton, idleTimer, lastPublish = 0;
    const otherCache = new Map();
    class Incomplete extends Error {}
    function otherActive() {
        return [["m01-runtime-panel", "m01Status"], ["m01-routes-panel", "m01RouteStatus"]].some(([id, key]) => {
            const raw = document.getElementById(id)?.dataset[key] || "{}", cached = otherCache.get(id);
            if (cached?.raw === raw) return cached.active;
            try { const active = !!JSON.parse(raw).active; otherCache.set(id, { raw, active }); return active; } catch { return true; }
        });
    }
    function publish(force = false) {
        if (!panel || (!force && now() - lastPublish < 100)) return;
        lastPublish = now(); report.status = active ? "RUNNING" : report.history.at(-1)?.status || "IDLE";
        report.active = active ? { runId: active.result.runId, phase: active.phase, frameCount: active.frames.length } : null;
        panel.dataset.m01InputStatus = JSON.stringify(report); startButton.disabled = !!active || otherActive(); stopButton.hidden = !active;
    }
    const directClear = s => s?.triggerHeld === false && s.touch?.shooting === false && s.touch?.shootPointers === 0;
    const hudClear = s => directClear(s) && s.avatar?.triggerHeld === false;
    const brief = s => ({ ready: s.ready, inputMode: s.inputMode, triggerHeld: s.triggerHeld, touch: s.touch,
        avatar: { triggerHeld: s.avatar?.triggerHeld, shooting: s.avatar?.shooting, shots: s.avatar?.shots, upper: s.avatar?.upper },
        updateAtMs: s.updateAtMs, publishedAtMs: s.publishedAtMs });
    function sample(t, source) {
        const atMs = now(), state = t.game.getStatus(), raw = document.getElementById("lingshui-hud")?.dataset.playerStatus ?? null;
        let hud = null; try { hud = raw ? JSON.parse(raw) : null; } catch { }
        if (raw !== t.lastHudRaw) { t.lastHudRaw = raw; t.result.hudVersions.push({ observedAtMs: atMs, raw, fields: hud ? brief(hud) : null }); }
        const row = { atMs, source, direct: brief(state), hudVersion: t.result.hudVersions.length - 1 };
        if (t.result.samples.length >= 2000) throw new Incomplete("采样达到上限。");
        t.result.samples.push(row);
        const events = state.shotEvents ?? state.avatar?.shotEvents;
        if (Array.isArray(events)) for (const event of events) if (!t.seenShots.has(event.id)) {
            t.seenShots.add(event.id); t.result.shots.push({ ...event, observedAtMs: atMs, source: "getStatus.shotEvents" });
        }
        if (t.upReturnedAtMs == null && hud && !hudClear(hud)) t.hudHeldSeen = !!(hud.triggerHeld || hud.avatar?.triggerHeld || hud.touch?.shooting);
        if (t.upReturnedAtMs != null) {
            if (directClear(state) && t.result.firstDirectClearAtMs == null) t.result.firstDirectClearAtMs = atMs;
            if (state.avatar?.triggerHeld === false && t.result.firstAvatarClearAtMs == null) t.result.firstAvatarClearAtMs = atMs;
            if (hud && hudClear(hud) && t.hudHeldSeen && t.result.firstHudClearAtMs == null) t.result.firstHudClearAtMs = atMs;
            if (hud && !hudClear(hud)) t.result.lastHudHeldAtMs = atMs;
        }
        publish(); return row.direct;
    }
    function observe(t, source) { try { return sample(t, source); } catch (e) { t.cancelReason = String(e.message); return null; } }
    function hook(t, object, key, factory) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key), original = object[key];
        if (typeof original !== "function") throw new Incomplete(`真实${key}接口不可用。`);
        const wrapped = factory(original); object[key] = wrapped;
        t.restorers.push(() => { if (object[key] !== wrapped) throw new Error(`${key}包装已被其他工具替换。`);
            if (descriptor) Object.defineProperty(object, key, descriptor); else delete object[key]; });
    }
    function install(t) {
        hook(t, t.game, "onUpdate", original => function (...args) {
            const atMs = now(); try { return original.apply(this, args); }
            finally { t.frames.push({ atMs, endedAtMs: now() }); observe(t, "after-original-onUpdate"); }
        });
        if (!t.hasShotEvents) hook(t, t.game.avatar, "step", original => function (...args) {
            const beforeAtMs = now(), before = this.getStatus().shots, result = original.apply(this, args), after = this.getStatus().shots;
            if (after > before) t.result.shots.push({ delta: after - before, beforeAtMs, observedAtMs: now(), source: "original avatar.step counter delta; exact emission time unavailable" });
            return result;
        });
        const raf = () => { if (active !== t || t.restored) return; observe(t, "requestAnimationFrame"); t.raf = requestAnimationFrame(raf); };
        t.raf = requestAnimationFrame(raf); t.timer = setInterval(() => observe(t, "8ms-read-only-poll"), 8);
    }
    function dispatch(t, type) {
        const up = type !== "pointerdown";
        (up ? document : t.button).dispatchEvent(new PointerEvent(type, { pointerId: t.pointerId, pointerType: "touch", isPrimary: true,
            clientX: t.x, clientY: t.y, button: 0, buttons: up ? 0 : 1, pressure: up ? 0 : .5, bubbles: true, cancelable: true, composed: true }));
    }
    function cleanup(t) {
        if (t.restored) return; t.restored = true;
        clearInterval(t.timer); cancelAnimationFrame(t.raf);
        if (t.owned) { t.owned = false; try { dispatch(t, "pointerup"); } catch (e) { t.result.errors.push(String(e)); } }
        t.hooksRestored = true;
        for (const restore of t.restorers.reverse()) try { restore(); } catch (e) { t.hooksRestored = false; t.result.errors.push(String(e)); }
        if (t.rate) try { Laya.Render.frameInterval = t.rate.interval; Laya.stage.frameRate = t.rate.stage; } catch (e) { t.result.errors.push(String(e)); }
    }
    function guard(t) {
        if (active !== t || t.cancelReason || otherActive()) throw new Incomplete(t.cancelReason || "另一M0.1探针活动，拒绝并行采样。");
        if (document.hidden || !document.hasFocus() || window.lingshuiGame !== t.game || !t.game.getStatus().ready) throw new Incomplete("页面失焦、后台或游戏实例变化。");
        if (now() - t.started > 6000) throw new Incomplete("释放采样超过6秒时限。");
    }
    async function until(t, predicate, timeoutMs) {
        const end = now() + timeoutMs;
        while (!predicate()) { guard(t); if (now() >= end) throw new Incomplete("等待真实帧或HUD更新超时。"); await new Promise(r => setTimeout(r, 8)); }
        guard(t);
    }
    function assess(t) {
        const r = t.result, release = t.upReturnedAtMs, firstFrame = t.frames.findIndex(f => f.endedAtMs >= release);
        const intervals = t.frames.slice(1).map((f, i) => f.atMs - t.frames[i].atMs);
        const oneFrameMs = firstFrame > 0 ? t.frames[firstFrame].endedAtMs - t.frames[firstFrame - 1].endedAtMs : null;
        const measured = t.frames.filter(f => f.atMs >= r.down.dispatchAtMs && f.atMs <= r.observationEndedAtMs);
        r.frameRate = { targetCapFps: 15, originalOnUpdateCalls: measured.length, intervalsMs: intervals,
            actualHz: measured.length > 1 ? (measured.length - 1) * 1000 / (measured.at(-1).atMs - measured[0].atMs) : null, oneReleaseFrameMs: oneFrameMs };
        const delay = at => at == null ? null : at - release;
        r.delaysMs = { direct: delay(r.firstDirectClearAtMs), avatar: delay(r.firstAvatarClearAtMs), hud: delay(r.firstHudClearAtMs) };
        const late = r.shots.filter(e => (e.atMs ?? e.beforeAtMs) >= release);
        const hudLimit = oneFrameMs == null ? null : 100 + oneFrameMs;
        r.assertions = { directClearAtEventReturn: directClear(r.up.returnedState),
            avatarClearedWithinOneFrame: oneFrameMs != null && r.delaysMs.avatar != null && r.delaysMs.avatar <= oneFrameMs,
            noPostReleaseEmission: late.length === 0 && r.endState.avatar.shots === r.up.returnedState.avatar.shots,
            hudClearedWithin100msPlusFrame: t.hudHeldSeen && hudLimit != null && r.delaysMs.hud != null && r.delaysMs.hud <= hudLimit };
        r.postReleaseEmissions = late; r.hudLimitMs = hudLimit; r.hudHeldObservedBeforeRelease = t.hudHeldSeen;
        const ambiguousHud = !r.assertions.hudClearedWithin100msPlusFrame && r.delaysMs.hud != null && r.lastHudHeldAtMs != null && r.lastHudHeldAtMs - release <= hudLimit;
        const knownFailure = !r.assertions.directClearAtEventReturn || !r.assertions.noPostReleaseEmission ||
            (oneFrameMs != null && !r.assertions.avatarClearedWithinOneFrame) ||
            (t.hudHeldSeen && hudLimit != null && !r.assertions.hudClearedWithin100msPlusFrame && !ambiguousHud);
        r.status = knownFailure ? "FAIL" : measured.length < 5 || oneFrameMs == null || !t.hudHeldSeen || ambiguousHud ? "INCOMPLETE" : "PASS";
        if (ambiguousHud) r.reason = "HUD变化落在轮询区间与时限交界，不能伪造更早的发布时间。";
    }
    async function run() {
        if (active || otherActive()) { message.textContent = "其他M0.1探针运行中，请等待。"; return; }
        const t = { game: window.lingshuiGame, started: now(), phase: "检查", frames: [], restorers: [], seenShots: new Set(),
            pointerId: ++pointerId, owned: false, restored: false, upReturnedAtMs: null, hudHeldSeen: false, lastHudRaw: undefined,
            result: { runId: `m01-input-${Date.now()}-${++sequence}`, startedAt: iso(), status: "RUNNING", inputSource: "synthetic-input", samples: [], hudVersions: [], shots: [], errors: [] } };
        active = t; report.history.push(t.result); if (report.history.length > 8) { const old = report.history.shift(); report.archived.push({ runId: old.runId, status: old.status, delaysMs: old.delaysMs }); }
        try {
            const s = t.game?.getStatus?.(), button = document.querySelector("#lingshui-hud .touch-shoot"), box = button?.getBoundingClientRect();
            if (!s?.ready || s.inputMode !== "touch" || !s.touch?.enabled || !directClear(s) || s.avatar?.triggerHeld || s.avatar?.shooting || s.touch?.pointers || s.keys?.length) throw new Incomplete("需要ready、空闲touch模式，并等待当前射击脉冲结束。");
            if (!button?.isConnected || !box || box.width < 2 || box.height < 2 || !window.Laya?.Render || !Laya.stage || !Number.isFinite(Laya.Render.frameInterval)) throw new Incomplete("真实触屏控件/Render帧率接口不可用。");
            if (Object.hasOwn(t.game, "onUpdate") && t.game.onUpdate !== Object.getPrototypeOf(t.game).onUpdate) throw new Incomplete("onUpdate已被另一探针包装；拒绝接管，即使其DOM状态尚未刷新。");
            t.button = button; t.x = box.left + box.width / 2; t.y = box.top + box.height / 2;
            const previous = s.shotEvents ?? s.avatar?.shotEvents; t.hasShotEvents = Array.isArray(previous); for (const e of previous || []) t.seenShots.add(e.id);
            t.result.shotObservation = t.hasShotEvents ? "original getStatus shotEvents timestamps" : "original avatar.step count deltas; only observation times are known";
            t.result.initialView = s.firstPerson ? "FP" : "TPS";
            t.rate = { interval: Laya.Render.frameInterval, stage: Laya.stage.frameRate }; t.result.rateBefore = { ...t.rate }; install(t);
            Laya.Render.frameInterval = 1000 / 15; Laya.stage.frameRate = "fast"; t.phase = "等待5个真实帧"; publish(true);
            await until(t, () => t.frames.length >= 5, 3000);
            // Align only by reading an original publication, making old HUD throttling observable.
            const raw = t.lastHudRaw; await until(t, () => t.lastHudRaw !== raw, 700); const alignedAtMs = now();
            await until(t, () => now() - alignedAtMs >= 8, 200); t.result.alignedOriginalHudAtMs = alignedAtMs;
            t.phase = "真实触屏按住约400ms"; t.owned = true; const down = now(); dispatch(t, "pointerdown");
            t.result.down = { dispatchAtMs: down, returnedAtMs: now(), returnedState: sample(t, "down-event-return") }; publish(true);
            if (!t.result.down.returnedState.triggerHeld || !t.result.down.returnedState.touch?.shooting) throw new Incomplete("pointerdown未使实际触屏射击输入置位。");
            await until(t, () => now() - t.result.down.returnedAtMs >= 400, 1200);
            t.phase = "释放后只读观察600ms"; const up = now(); t.owned = false; dispatch(t, "pointerup"); t.upReturnedAtMs = now();
            t.result.up = { dispatchAtMs: up, returnedAtMs: t.upReturnedAtMs, returnedState: sample(t, "up-event-return") };
            t.result.actualHoldMs = up - down; publish(true); await until(t, () => now() - t.upReturnedAtMs >= 600, 1400);
            t.result.endState = sample(t, "observation-end"); t.result.observationEndedAtMs = now(); assess(t);
        } catch (e) { t.result.status = e instanceof Incomplete ? "INCOMPLETE" : "FAIL"; t.result.reason = String(e.message); }
        finally {
            cleanup(t); t.result.finishedAt = iso(); t.result.frames = t.frames;
            t.result.cleanup = { ownedPointerReleased: !t.owned, hooksRestored: t.hooksRestored, frameInterval: window.Laya?.Render?.frameInterval, stageFrameRate: window.Laya?.stage?.frameRate };
            if (t.rate && (t.result.cleanup.frameInterval !== t.rate.interval || t.result.cleanup.stageFrameRate !== t.rate.stage)) t.result.errors.push("原帧率设置未恢复。");
            if (t.result.errors.length) t.result.status = "FAIL"; active = null;
            message.textContent = `${t.result.status} · ${t.result.runId}；原始HUD与直接输入独立记录。`; publish(true);
        }
    }
    function cancel(reason) { if (active) { active.cancelReason = reason; if (active.owned) { active.owned = false; try { dispatch(active, "pointerup"); } catch (e) { active.result.errors.push(String(e)); } } } }
    document.addEventListener("click", e => { if (active && e.target?.closest?.("#m01-runtime-panel [data-m01-action],#m01-routes-panel [data-m01-route-action]")) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    for (const type of ["pointerdown", "keydown", "wheel"]) document.addEventListener(type, e => { if (active && e.isTrusted && !e.target?.closest?.("#m01-input-timing-panel,#m01-runtime-panel,#m01-routes-panel")) cancel("人工输入中断采样。"); }, true);
    window.addEventListener("blur", () => cancel("失焦中断采样。")); document.addEventListener("visibilitychange", () => { if (document.hidden) cancel("后台中断采样。"); });
    window.addEventListener("pagehide", () => { clearInterval(idleTimer); if (active) { cancel("页面离开。"); cleanup(active); } });
    for (const type of ["error", "unhandledrejection"]) window.addEventListener(type, e => { if (active) { active.result.errors.push(String(e.message || e.reason || type)); cancel("运行异常。"); } });
    function mount() {
        panel = document.createElement("details"); panel.id = "m01-input-timing-panel"; panel.open = true;
        panel.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483647;width:330px;max-width:90vw;background:#252438ed;color:white;padding:8px;font:12px/1.4 system-ui;border:1px solid #aeb7cf;border-radius:6px";
        panel.innerHTML = '<summary>M0.1 释放时序 · localhost</summary><p>显式启动：cap15，触屏射击400ms，释放后观察600ms。无起点传送；不改HUD。最近8轮完整数据可下载。</p>';
        for (const [action, label, handler] of [["sample", "释放时序采样", () => { void run(); }], ["stop", "停止", () => cancel("用户停止。")], ["download", "下载JSON历史", () => {
            publish(true); const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
            const a = document.createElement("a"); a.href = url; a.download = `${report.history.at(-1)?.runId || "m01-input-idle"}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        }]]) { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.dataset.m01InputAction = action; b.addEventListener("click", handler); panel.appendChild(b); if (action === "sample") startButton = b; if (action === "stop") stopButton = b; }
        message = document.createElement("p"); message.textContent = "尚未采样；未修改游戏状态、帧率或方法。"; panel.appendChild(message); panel.addEventListener("pointerdown", e => e.stopPropagation()); document.body.appendChild(panel); publish(true);
        idleTimer = setInterval(() => { if (!active) startButton.disabled = otherActive(); }, 250);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
})();
