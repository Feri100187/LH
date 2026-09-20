export interface MobileInputCallbacks {
    look: (dx: number, dy: number) => void;
    jump: () => void;
    shoot: () => void;
    perspective: () => void;
    modeChanged: () => void;
}

/** DOM touch controls use independent pointer IDs, so looking never steals the movement finger. */
export class MobileInput {
    enabled = false;
    moveX = 0;
    moveZ = 0;
    private root: HTMLDivElement;
    private joystick: HTMLDivElement;
    private knob: HTMLDivElement;
    private lookZone: HTMLDivElement;
    private runButton: HTMLButtonElement;
    private viewButton: HTMLButtonElement;
    private movePointer: number = null;
    private lookPointer: number = null;
    private runToggled = false;
    private captures = new Map<number, HTMLElement>();
    private shootPointers = new Set<number>();
    private lookX = 0;
    private lookY = 0;
    private coarse = window.matchMedia("(pointer: coarse)");
    private previousTouchAction: string;
    private viewport: HTMLMetaElement;
    private previousViewport: string;
    private createdViewport = false;

    constructor(private canvas: HTMLCanvasElement, private hud: HTMLElement, private callbacks: MobileInputCallbacks) {
        this.previousTouchAction = canvas.style.touchAction;
        canvas.style.touchAction = "none";
        this.viewport = document.querySelector('meta[name="viewport"]');
        if (!this.viewport) {
            this.viewport = document.createElement("meta");
            this.viewport.name = "viewport";
            this.viewport.content = "width=device-width, initial-scale=1, viewport-fit=cover";
            document.head.appendChild(this.viewport);
            this.createdViewport = true;
        } else {
            this.previousViewport = this.viewport.content;
            if (!/viewport-fit\s*=/.test(this.viewport.content)) this.viewport.content += ", viewport-fit=cover";
        }
        this.root = document.createElement("div");
        this.root.className = "mobile-controls";
        this.root.setAttribute("aria-label", "触屏游戏控制");
        this.root.innerHTML = `
          <style>
          #lingshui-hud{touch-action:none;-webkit-user-select:none;overscroll-behavior:none}
          #lingshui-hud .mobile-controls{position:absolute;inset:0;display:none;pointer-events:none}
          #lingshui-hud[data-input="touch"] .mobile-controls{display:block}
          #lingshui-hud[data-input="touch"] .desktop-help{display:none}
          #lingshui-hud[data-input="touch"] .title{left:max(18px,env(safe-area-inset-left));top:max(16px,env(safe-area-inset-top));font-size:16px}
          #lingshui-hud[data-input="touch"] .mode{right:max(18px,env(safe-area-inset-right));top:max(18px,env(safe-area-inset-top))}
          #lingshui-hud .touch-look{position:absolute;left:38%;right:0;top:0;bottom:0;pointer-events:auto;touch-action:none}
          #lingshui-hud .touch-look-hint{position:absolute;right:max(24px,env(safe-area-inset-right));top:calc(max(16px,env(safe-area-inset-top)) + 31px);font-size:11px;color:#e0eaf1b0;text-shadow:0 1px 4px #000;pointer-events:none}
          #lingshui-hud .touch-stick{position:absolute;left:calc(max(18px,env(safe-area-inset-left)) + 6px);bottom:calc(max(20px,env(safe-area-inset-bottom)) + 12px);width:136px;height:136px;border:1px solid #ffffff4d;border-radius:50%;background:#11232c40;box-shadow:inset 0 0 20px #09192333;pointer-events:auto;touch-action:none}
          #lingshui-hud .touch-stick:before,#lingshui-hud .touch-stick:after{content:"";position:absolute;left:50%;top:50%;background:#ffffff1f;pointer-events:none}
          #lingshui-hud .touch-stick:before{width:1px;height:94px;transform:translate(-50%,-50%)}
          #lingshui-hud .touch-stick:after{width:94px;height:1px;transform:translate(-50%,-50%)}
          #lingshui-hud .touch-knob{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:#edf6ff55;border:1px solid #ffffffb3;box-shadow:0 3px 14px #0003;pointer-events:none;will-change:transform}
          #lingshui-hud .touch-stick-label{position:absolute;left:0;right:0;bottom:-22px;text-align:center;font-size:11px;color:#dceaf4;text-shadow:0 1px 3px #000;pointer-events:none}
          #lingshui-hud .touch-actions{position:absolute;right:max(20px,env(safe-area-inset-right));bottom:calc(max(20px,env(safe-area-inset-bottom)) + 6px);display:grid;grid-template-columns:repeat(2,76px);gap:14px;align-items:end;pointer-events:none}
          #lingshui-hud .touch-button{appearance:none;-webkit-appearance:none;touch-action:none;pointer-events:auto;width:64px;height:64px;padding:0;border:1px solid #ffffff66;border-radius:50%;background:#142a36a6;color:#fff;font:13px Arial,'Microsoft YaHei',sans-serif;text-shadow:0 1px 3px #000;box-shadow:0 3px 14px #0002;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;outline:none}
          #lingshui-hud .touch-button[data-pressed="true"]{background:#77c8ddba;border-color:#e5faff;transform:scale(.96)}
          #lingshui-hud .touch-button small{display:block;font-size:9px;opacity:.7;margin-top:3px}
          #lingshui-hud .touch-run{grid-area:1 / 1;justify-self:center}
          #lingshui-hud .touch-jump{grid-area:2 / 1;width:76px;height:76px;background:#294958b8;font-size:15px}
          #lingshui-hud .touch-shoot{grid-area:2 / 2;width:76px;height:76px;background:#23687ab8;font-size:15px}
          #lingshui-hud .touch-view{position:absolute;right:max(21px,env(safe-area-inset-right));bottom:calc(max(20px,env(safe-area-inset-bottom)) + 102px);width:70px;height:42px;border-radius:12px;font-size:11px}
          @media (max-width:600px) and (orientation:portrait){
            #lingshui-hud[data-input="touch"] .title span{display:none}
            #lingshui-hud .touch-stick{width:116px;height:116px;left:max(15px,env(safe-area-inset-left));bottom:calc(max(28px,env(safe-area-inset-bottom)) + 12px)}
            #lingshui-hud .touch-actions{right:max(15px,env(safe-area-inset-right));grid-template-columns:repeat(2,66px);gap:10px;bottom:calc(max(28px,env(safe-area-inset-bottom)) + 6px)}
            #lingshui-hud .touch-button{width:56px;height:56px}
            #lingshui-hud .touch-jump,#lingshui-hud .touch-shoot{width:66px;height:66px}
            #lingshui-hud .touch-view{width:70px;height:42px;right:max(15px,env(safe-area-inset-right));bottom:calc(max(28px,env(safe-area-inset-bottom)) + 98px)}
          }
          @media (max-height:420px) and (orientation:landscape){
            #lingshui-hud .touch-stick{width:116px;height:116px;bottom:calc(max(12px,env(safe-area-inset-bottom)) + 14px)}
            #lingshui-hud .touch-actions{grid-template-columns:repeat(2,66px);gap:10px;bottom:max(16px,env(safe-area-inset-bottom))}
            #lingshui-hud .touch-button{width:56px;height:56px}
            #lingshui-hud .touch-jump,#lingshui-hud .touch-shoot{width:66px;height:66px}
            #lingshui-hud .touch-view{width:70px;height:42px;bottom:calc(max(16px,env(safe-area-inset-bottom)) + 90px)}
          }
          </style>
          <div class="touch-look" aria-label="右侧滑动转向"></div>
          <div class="touch-look-hint">右侧滑动转向</div>
          <div class="touch-stick" role="group" aria-label="移动摇杆"><div class="touch-knob"></div><span class="touch-stick-label">移动</span></div>
          <div class="touch-actions">
            <button class="touch-button touch-run" type="button" aria-label="开启奔跑" aria-pressed="false">奔跑<small>点击开启</small></button>
            <button class="touch-button touch-jump" type="button" aria-label="跳跃">跳跃</button>
            <button class="touch-button touch-shoot" type="button" aria-label="水枪射击">射击</button>
          </div>
          <button class="touch-button touch-view" type="button" aria-label="切换第一人称和越肩视角">切换视角</button>`;
        hud.appendChild(this.root);
        this.joystick = this.root.querySelector(".touch-stick");
        this.knob = this.root.querySelector(".touch-knob");
        this.lookZone = this.root.querySelector(".touch-look");
        this.runButton = this.root.querySelector(".touch-run");
        this.viewButton = this.root.querySelector(".touch-view");
        this.joystick.addEventListener("pointerdown", this.beginMove);
        this.lookZone.addEventListener("pointerdown", this.beginLook);
        this.runButton.addEventListener("pointerdown", this.beginRun);
        this.root.querySelector<HTMLButtonElement>(".touch-jump").addEventListener("pointerdown", this.beginJump);
        this.root.querySelector<HTMLButtonElement>(".touch-shoot").addEventListener("pointerdown", this.beginShoot);
        this.viewButton.addEventListener("pointerdown", this.beginPerspective);
        this.root.addEventListener("contextmenu", this.preventGesture);
        this.root.addEventListener("dblclick", this.preventGesture);
        this.canvas.addEventListener("pointerdown", this.detectTouch, { passive: false });
        this.hud.addEventListener("pointerdown", this.detectHudTouch, { capture: true, passive: false });
        document.addEventListener("pointermove", this.updatePointer, { passive: false });
        document.addEventListener("pointerup", this.endPointer);
        document.addEventListener("pointercancel", this.endPointer);
        document.addEventListener("lostpointercapture", this.endPointer);
        window.addEventListener("resize", this.reset);
        window.addEventListener("orientationchange", this.reset);
        this.coarse.addEventListener("change", this.onPointerTypeChange);
        // Also allows desktop QA of the real touch UI without changing OS/browser settings.
        this.setEnabled(this.coarse.matches || new URLSearchParams(window.location.search).get("controls") === "touch");
    }

    get running() { return this.runToggled; }
    get shooting() { return this.enabled && this.shootPointers.size > 0; }

    setEnabled(enabled: boolean) {
        if (this.enabled === enabled) return;
        this.reset();
        this.enabled = enabled;
        this.hud.dataset.input = enabled ? "touch" : "desktop";
        this.callbacks.modeChanged();
    }

    setPerspective(thirdPerson: boolean) {
        this.viewButton.setAttribute("aria-pressed", String(thirdPerson));
        this.viewButton.title = thirdPerson ? "当前越肩视角，点击切换第一人称" : "当前第一人称，点击切换越肩视角";
    }

    /** Used when the game must bypass Laya's canvas capture handlers during pointer lock. */
    handleCanvasPointer(event: PointerEvent) {
        if (event.type === "pointerdown") this.detectTouch(event);
        else this.endPointer(event);
    }

    private detectTouch = (event: PointerEvent) => {
        if (event.pointerType === "mouse") return;
        this.setEnabled(true);
        event.preventDefault();
        this.canvas.focus({ preventScroll: true });
        // Hybrid devices may reveal their controls only after the first touch.
        if (event.clientX >= window.innerWidth * 0.38) this.beginLook(event);
    };

    private detectHudTouch = (event: PointerEvent) => {
        // The desktop capture prompt covers the canvas on touch-capable laptops.
        if (!this.enabled && event.pointerType !== "mouse") this.detectTouch(event);
    };

    private onPointerTypeChange = () => { this.setEnabled(this.coarse.matches); };
    private preventGesture = (event: Event) => { event.preventDefault(); };

    private capture(event: PointerEvent, target: HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        this.captures.set(event.pointerId, target);
        // Pointer lock and detached elements make capture invalid; document listeners still track this pointer.
        if (!document.pointerLockElement && target.isConnected && typeof target.setPointerCapture === "function") {
            try { target.setPointerCapture(event.pointerId); } catch (_) { /* The pointer may already have ended; document listeners remain a fallback. */ }
        }
    }

    private beginMove = (event: PointerEvent) => {
        if (this.movePointer !== null) { event.preventDefault(); return; }
        this.movePointer = event.pointerId;
        this.capture(event, this.joystick);
        this.updateMove(event.clientX, event.clientY);
    };

    private updateMove(x: number, y: number) {
        const rect = this.joystick.getBoundingClientRect();
        const radius = rect.width * 0.34;
        const dx = x - rect.left - rect.width / 2, dy = y - rect.top - rect.height / 2;
        const length = Math.hypot(dx, dy);
        const fraction = Math.min(1, length / radius);
        const analog = Math.max(0, (fraction - 0.12) / 0.88);
        this.moveX = length > 0 ? dx / length * analog : 0;
        this.moveZ = length > 0 ? -dy / length * analog : 0;
        const visual = length > 0 ? Math.min(radius, length) / length : 0;
        this.knob.style.transform = `translate(${dx * visual}px,${dy * visual}px)`;
    }

    private beginLook = (event: PointerEvent) => {
        if (this.lookPointer !== null) { event.preventDefault(); return; }
        this.lookPointer = event.pointerId;
        this.lookX = event.clientX;
        this.lookY = event.clientY;
        this.capture(event, event.currentTarget === this.canvas ? this.canvas : this.lookZone);
    };

    private beginRun = (event: PointerEvent) => {
        this.capture(event, this.runButton);
        this.runToggled = !this.runToggled;
        this.updateRunButton();
    };

    private updateRunButton() {
        this.runButton.dataset.pressed = String(this.runToggled);
        this.runButton.setAttribute("aria-pressed", String(this.runToggled));
        this.runButton.setAttribute("aria-label", this.runToggled ? "关闭奔跑" : "开启奔跑");
        this.runButton.innerHTML = this.runToggled ? "奔跑中<small>点击关闭</small>" : "奔跑<small>点击开启</small>";
    }

    private beginJump = (event: PointerEvent) => {
        const button = event.currentTarget as HTMLElement;
        this.capture(event, button);
        button.dataset.pressed = "true";
        this.callbacks.jump();
    };

    private beginPerspective = (event: PointerEvent) => {
        this.capture(event, this.viewButton);
        this.viewButton.dataset.pressed = "true";
        this.callbacks.perspective();
    };

    private beginShoot = (event: PointerEvent) => {
        if (this.shootPointers.has(event.pointerId)) { event.preventDefault(); return; }
        const button = event.currentTarget as HTMLElement;
        this.capture(event, button);
        this.shootPointers.add(event.pointerId);
        button.dataset.pressed = "true";
        this.callbacks.shoot();
    };

    private updatePointer = (event: PointerEvent) => {
        if (!this.enabled || !this.captures.has(event.pointerId)) return;
        event.preventDefault();
        if (event.pointerId === this.movePointer) this.updateMove(event.clientX, event.clientY);
        if (event.pointerId === this.lookPointer) {
            this.callbacks.look(event.clientX - this.lookX, event.clientY - this.lookY);
            this.lookX = event.clientX;
            this.lookY = event.clientY;
        }
    };

    private endPointer = (event: PointerEvent) => {
        this.shootPointers.delete(event.pointerId);
        const target = this.captures.get(event.pointerId);
        if (!target) return;
        this.captures.delete(event.pointerId);
        if (event.pointerId === this.movePointer) {
            this.movePointer = null;
            this.moveX = this.moveZ = 0;
            this.knob.style.transform = "translate(0,0)";
        }
        if (event.pointerId === this.lookPointer) this.lookPointer = null;
        if (target !== this.runButton && !Array.from(this.captures.values()).some(owner => owner === target)) target.dataset.pressed = "false";
        try { if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId); } catch (_) { }
    };

    reset = () => {
        this.movePointer = this.lookPointer = null;
        this.moveX = this.moveZ = 0;
        this.runToggled = false;
        this.shootPointers.clear();
        const oldCaptures = Array.from(this.captures.entries());
        this.captures.clear();
        for (const [id, target] of oldCaptures) {
            target.dataset.pressed = "false";
            try { if (target.hasPointerCapture(id)) target.releasePointerCapture(id); } catch (_) { }
        }
        if (this.knob) this.knob.style.transform = "translate(0,0)";
        if (this.runButton) this.updateRunButton();
    };

    getStatus() {
        return { enabled: this.enabled, move: [this.moveX, this.moveZ], running: this.running,
            shooting: this.shooting, shootPointers: this.shootPointers.size,
            pointers: this.captures.size, moving: this.movePointer !== null, looking: this.lookPointer !== null };
    }

    destroy() {
        this.reset();
        this.canvas.removeEventListener("pointerdown", this.detectTouch);
        this.hud.removeEventListener("pointerdown", this.detectHudTouch, true);
        document.removeEventListener("pointermove", this.updatePointer);
        document.removeEventListener("pointerup", this.endPointer);
        document.removeEventListener("pointercancel", this.endPointer);
        document.removeEventListener("lostpointercapture", this.endPointer);
        window.removeEventListener("resize", this.reset);
        window.removeEventListener("orientationchange", this.reset);
        this.coarse.removeEventListener("change", this.onPointerTypeChange);
        this.canvas.style.touchAction = this.previousTouchAction;
        if (this.createdViewport) this.viewport.remove();
        else this.viewport.content = this.previousViewport;
        this.root.remove();
    }
}
