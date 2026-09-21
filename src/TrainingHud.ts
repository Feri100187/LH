/** DOM presentation only. Completion and shot identity belong to TrainingProgress. */
export class TrainingHud {
    private panel: HTMLDivElement;
    private count: HTMLElement;
    private message: HTMLElement;
    private marker: HTMLDivElement;
    private rows = new Map<string, HTMLElement>();
    private messageUntil = 0;
    private markerUntil = 0;
    private complete = false;
    private resetButton: HTMLButtonElement;

    constructor(targets: { id: string; label: string }[], private onReset: () => void) {
        this.panel = document.createElement("div");
        this.panel.id = "training-hud";
        this.panel.style.cssText = "position:fixed;left:24px;top:58px;z-index:11;width:244px;max-width:calc(100vw - 48px);box-sizing:border-box;padding:12px 14px;color:#f5fbff;background:#102536df;border:1px solid #bce5ff55;border-radius:9px;font:12px/1.5 Arial,'Microsoft YaHei',sans-serif;pointer-events:none;user-select:none;box-shadow:0 3px 14px #0002";
        this.panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:15px">水枪训练</strong><b data-training-count>0 / 3</b></div><div data-training-targets style="display:flex;gap:10px;margin:8px 0"></div><div data-training-message role="status" aria-live="polite">训练靶在出生点后方草坪，水枪射程18米。</div><button type="button" data-training-reset style="pointer-events:auto;margin-top:9px;padding:4px 10px;border:1px solid #acd9f577;border-radius:5px;color:#e6f6ff;background:#24516a;cursor:pointer;font:inherit">重新开始 · R</button>';
        this.count = this.panel.querySelector("[data-training-count]");
        this.message = this.panel.querySelector("[data-training-message]");
        const list = this.panel.querySelector("[data-training-targets]");
        for (const target of targets) {
            const row = document.createElement("span");
            row.textContent = "○ " + target.label; row.dataset.targetId = target.id;
            list.appendChild(row); this.rows.set(target.id, row);
        }
        this.resetButton = this.panel.querySelector("[data-training-reset]");
        this.resetButton.addEventListener("pointerdown", this.stopPointer);
        this.resetButton.addEventListener("click", this.reset);
        document.addEventListener("keydown", this.keyDown, true);
        document.body.appendChild(this.panel);
        this.marker = document.createElement("div");
        this.marker.id = "training-hit-marker";
        this.marker.style.cssText = "display:none;position:fixed;z-index:12;left:50%;top:50%;transform:translate(-50%,-50%);color:#8fffd7;font:bold 30px/1 Arial;text-shadow:0 1px 4px #002b2d;pointer-events:none";
        this.marker.textContent = "×"; document.body.appendChild(this.marker);
    }

    private stopPointer = (event: Event) => event.stopPropagation();
    private reset = (event?: Event) => { event?.preventDefault(); event?.stopPropagation(); this.onReset(); };
    private keyDown = (event: KeyboardEvent) => {
        const element = event.target as HTMLElement;
        if (event.code !== "KeyR" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.hidden
            || /^(INPUT|TEXTAREA|SELECT)$/.test(element?.tagName || "") || element?.isContentEditable) return;
        event.preventDefault(); event.stopImmediatePropagation(); this.onReset();
    };

    setProgress(targets: { id: string; label: string }[], completedIds: string[]) {
        this.complete = completedIds.length === targets.length;
        this.count.textContent = `${completedIds.length} / ${targets.length}`;
        this.panel.dataset.completed = String(completedIds.length);
        this.panel.dataset.success = String(this.complete);
        for (const target of targets) {
            const row = this.rows.get(target.id), done = completedIds.indexOf(target.id) >= 0;
            row.textContent = (done ? "✓ " : "○ ") + target.label;
            row.style.color = done ? "#8fffd7" : "#e1eaf2";
        }
        if (this.complete) this.message.textContent = "训练完成！三个靶子全部命中。";
    }

    showShot(outcome: string, targetLabel: string | null, newlyCompleted: boolean, nowMs: number) {
        if (targetLabel) {
            this.marker.style.display = "block"; this.markerUntil = nowMs + 140;
            if (!this.complete) this.message.textContent = newlyCompleted ? `命中 ${targetLabel}` : `${targetLabel} 已完成`;
        } else if (!this.complete) this.message.textContent = outcome === "world" || outcome === "muzzle-blocked"
            ? "水流被障碍挡住" : outcome === "out-of-range" ? "超出水枪射程" : "未命中，调整准星再试";
        this.messageUntil = nowMs + 1200;
    }

    update(nowMs: number) {
        if (this.markerUntil && nowMs >= this.markerUntil) { this.marker.style.display = "none"; this.markerUntil = 0; }
        if (this.messageUntil && nowMs >= this.messageUntil) {
            this.messageUntil = 0;
            this.message.textContent = this.complete ? "训练完成！三个靶子全部命中。" : "击中三个圆靶。掩体后的靶需要绕行。";
        }
    }

    clear() {
        this.messageUntil = this.markerUntil = 0; this.marker.style.display = "none";
        this.message.textContent = "已重置。击中三个圆靶，再试一次。";
    }

    destroy() {
        document.removeEventListener("keydown", this.keyDown, true);
        this.resetButton.removeEventListener("pointerdown", this.stopPointer);
        this.resetButton.removeEventListener("click", this.reset);
        this.panel.remove(); this.marker.remove();
    }
}
