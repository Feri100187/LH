/** Read authored muzzle bones after Animator and camera updates; never approximate the muzzle with the reticle. */
export class WeaponMuzzle {
    private worldMuzzle: Laya.Sprite3D;
    private viewMuzzle: Laya.Sprite3D;
    private demo: { node: Laya.Sprite3D; renderer: Laya.MeshRenderer }[] = [];

    constructor(worldModel: Laya.Node, viewModel: Laya.Node) {
        const scan = (root: Laya.Node) => {
            let muzzle: Laya.Sprite3D = null;
            const visit = (node: Laya.Node) => {
                if (node.name === "water_jet") {
                    if (muzzle) throw new Error("水枪模型包含多个枪口骨骼。");
                    muzzle = node as Laya.Sprite3D;
                }
                if (node.name === "FX_WaterPulse") this.demo.push({ node: node as Laya.Sprite3D, renderer: node.getComponent(Laya.MeshRenderer) });
                for (let i = 0; i < node.numChildren; i++) visit(node.getChildAt(i));
            };
            visit(root);
            if (!muzzle) throw new Error("水枪缺少已核实的 water_jet 枪口骨骼。");
            return muzzle;
        };
        this.worldMuzzle = scan(worldModel); this.viewMuzzle = scan(viewModel);
        this.suppressDemonstrationStreams();
    }

    suppressDemonstrationStreams() {
        // Keep the authored animation/mesh resource intact. Its unbounded demo
        // jet is replaced by the collision-resolved world effect for both views.
        for (const item of this.demo) {
            item.node.active = false;
            if (item.renderer) item.renderer.enabled = false;
        }
    }

    sample(firstPerson: boolean): [number, number, number] {
        const p = (firstPerson ? this.viewMuzzle : this.worldMuzzle).transform.position;
        return [p.x, p.y, p.z];
    }

    getStatus() {
        return { world: this.sample(false), firstPerson: this.sample(true),
            source: "authored water_jet bone world position", suppressedDemoStreams: this.demo.length,
            demoStreamsActive: this.demo.filter(item => item.node.active && item.renderer?.enabled).length };
    }
}
