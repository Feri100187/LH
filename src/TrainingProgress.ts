/** Progress is driven by unique emission IDs, never by rendered frames. */
export interface TrainingProgressStatus {
    targetIds: string[];
    completedIds: string[];
    completed: number;
    total: number;
    complete: boolean;
    lastConsumedShotId: number;
    consumedShots: number;
    targetHits: number;
    completionEvents: number;
    resetCount: number;
}
export interface TrainingConsumption {
    accepted: boolean;
    newlyCompleted: boolean;
    targetId?: string;
    complete: boolean;
    completed: number;
    total: number;
    lastConsumedShotId: number;
}
export class TrainingProgress {
    private readonly ids: string[];
    private completedIds = new Set<string>();
    private lastConsumedShotId = 0;
    private consumedShots = 0;
    private targetHits = 0;
    private completionEvents = 0;
    private resetCount = 0;
    constructor(targetIds: readonly string[]) {
        if (targetIds.length !== 3 || targetIds.some(id => typeof id !== "string" || !id.trim())
            || new Set(targetIds).size !== targetIds.length) throw new Error("Training requires exactly three distinct target IDs");
        this.ids = [...targetIds];
    }
    consume(shotId: number, targetId?: string): TrainingConsumption {
        const accepted = Number.isSafeInteger(shotId) && shotId > this.lastConsumedShotId;
        let newlyCompleted = false;
        if (accepted) {
            this.lastConsumedShotId = shotId; this.consumedShots++;
            if (targetId !== undefined && this.ids.indexOf(targetId) >= 0) {
                this.targetHits++;
                newlyCompleted = !this.completedIds.has(targetId);
                if (newlyCompleted) { this.completedIds.add(targetId); this.completionEvents++; }
            }
        }
        return { accepted, newlyCompleted, targetId: accepted && this.ids.indexOf(targetId!) >= 0 ? targetId : undefined,
            complete: this.completedIds.size === this.ids.length, completed: this.completedIds.size,
            total: this.ids.length, lastConsumedShotId: this.lastConsumedShotId };
    }
    /** Advancing the watermark cancels already emitted but not yet consumed
     * work. A reset never makes an earlier emission eligible again. */
    reset(lastEmittedShotId = this.lastConsumedShotId): TrainingProgressStatus {
        if (!Number.isSafeInteger(lastEmittedShotId) || lastEmittedShotId < 0) throw new Error("Invalid reset emission watermark");
        this.lastConsumedShotId = Math.max(this.lastConsumedShotId, lastEmittedShotId);
        this.completedIds.clear(); this.resetCount++;
        return this.getStatus();
    }
    getStatus(): TrainingProgressStatus {
        return { targetIds: [...this.ids], completedIds: this.ids.filter(id => this.completedIds.has(id)),
            completed: this.completedIds.size, total: this.ids.length, complete: this.completedIds.size === this.ids.length,
            lastConsumedShotId: this.lastConsumedShotId, consumedShots: this.consumedShots,
            targetHits: this.targetHits, completionEvents: this.completionEvents, resetCount: this.resetCount };
    }
}
