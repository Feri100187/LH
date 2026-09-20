/** A camera child containing only the skinned sleeves, hands and watergun. */
export class FirstPersonArms {
    private animator: Laya.Animator;
    private layer: Laya.AnimatorControllerLayer;
    private meshes: Laya.MeshRenderer[] = [];
    private visible = false;
    private shooting = false;
    private phase = 0;
    private bobWeight = 0;
    private runWeight = 0;
    private position = new Laya.Vector3();
    private rotation = new Laya.Vector3();

    constructor(private mount: Laya.Sprite3D) {
        const visit = (node: Laya.Node) => {
            const renderer = node.getComponent(Laya.MeshRenderer);
            if (renderer) {
                renderer.castShadow = false;
                renderer.receiveShadow = false;
                this.meshes.push(renderer);
                if (renderer instanceof Laya.SkinnedMeshRenderer)
                    renderer.localBounds = new Laya.Bounds(new Laya.Vector3(-2, -2, -2), new Laya.Vector3(2, 3, 2));
            }
            const animator = node.getComponent(Laya.Animator);
            if (animator && !this.animator) this.animator = animator;
            for (let i = 0; i < node.numChildren; i++) visit(node.getChildAt(i));
        };
        visit(mount);
        if (!this.animator) throw new Error("第一人称双臂模型未加载 Animator。");
        this.animator.cullingMode = Laya.Animator.CULLINGMODE_ALWAYSANIMATE;
        this.animator.sleep = false;
        this.layer = this.animator.getControllerLayer(0);
        for (const name of ["Idle", "Shoot"]) {
            const state = this.layer.getAnimatorState(name);
            if (!state?.clip) throw new Error(`第一人称动作缺失：${name}`);
            state.clip.islooping = true;
            state.transitions = []; state.soloTransitions = [];
        }
        this.animator.play("Idle", 0, 0);
        mount.active = false;
    }

    setVisible(visible: boolean, shooting: boolean, shotPhase: number) {
        if (this.visible === visible) return;
        this.visible = visible;
        this.mount.active = visible;
        if (visible) {
            this.shooting = shooting;
            this.animator.play(shooting ? "Shoot" : "Idle", 0, shooting ? shotPhase % 1 : 0);
        }
    }

    update(dt: number, speed: number, running: boolean, shooting: boolean, shotPhase: number) {
        if (!this.visible) return;
        if (shooting !== this.shooting) {
            this.shooting = shooting;
            if (shooting) this.animator.play("Shoot", 0, shotPhase % 1);
            else this.animator.crossFade("Idle", .08 / .2, 0, 0);
        }
        const blend = Math.min(1, dt * 14);
        this.bobWeight += (Math.min(1, speed / 1.2) - this.bobWeight) * blend;
        this.runWeight += ((running && speed > .1 && !shooting ? 1 : 0) - this.runWeight) * blend;
        this.phase += dt * Math.PI * 2 * Math.min(2.2, speed / 1.2);
        // Small weapon sway only. The camera and mount never trail behind the player.
        this.position.setValue(.004 * Math.sin(this.phase) * this.bobWeight,
            -.035 * this.runWeight + .003 * Math.cos(this.phase * 2) * this.bobWeight, 0);
        this.rotation.setValue(-5 * this.runWeight, 0, -2 * this.runWeight);
        this.mount.transform.localPosition = this.position;
        this.mount.transform.localRotationEuler = this.rotation;
    }

    getStatus() {
        const local = this.mount.transform.localPosition;
        return { visible: this.visible, cameraParent: this.mount.parent?.name,
            meshes: this.meshes.length, base: this.layer.getCurrentPlayState().animatorState?.name,
            localMountPosition: [local.x, local.y, local.z], shooting: this.shooting };
    }
}
