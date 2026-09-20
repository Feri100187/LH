/** A 3D script: this callback runs after this frame's Bullet and Animator updates. */
export class PlayerCameraFollow extends Laya.Script {
    follow: () => void;
    onAfterSceneUpdate() { this.follow?.(); }
}
