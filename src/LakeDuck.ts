const { regClass, property } = Laya;

/** Small local water routes keep the flock on its verified patch of open lake. */
@regClass()
export class LakeDuck extends Laya.Script {
    @property({ type: Number, caption: "游动横向半径（米）" }) radiusX = .65;
    @property({ type: Number, caption: "游动纵向半径（米）" }) radiusZ = .40;
    @property({ type: Number, caption: "游动一圈（秒）" }) periodSeconds = 45;
    @property({ type: Number, caption: "起始位置角度" }) phaseDegrees = 0;
    @property({ type: Number, caption: "游动方向（1或-1）" }) direction = 1;
    @property({ type: Number, caption: "浮动幅度（米）" }) bobHeight = .006;

    private static activeDucks = new Set<LakeDuck>();
    private static nextStatusTime = 0;
    private center: Laya.Vector3;
    private model: Laya.Sprite3D;
    private age = 0;
    private position = new Laya.Vector3();
    private rotation = new Laya.Vector3();
    private modelPosition = new Laya.Vector3();
    private modelRotation = new Laya.Vector3();
    private wake: Laya.Sprite3D;
    private wakeMesh: Laya.Mesh;
    private wakeMaterial: Laya.UnlitMaterial;

    onStart() {
        const root = this.owner as Laya.Sprite3D;
        this.center = root.transform.localPosition.clone();
        this.model = root.getChildByName("DuckModel") as Laya.Sprite3D;
        if (!this.model) throw new Error(`鸭子模型未绑定：${root.name}`);
        const visit = (node: Laya.Node) => {
            const renderer = node.getComponent(Laya.MeshRenderer);
            if (renderer) { renderer.castShadow = true; renderer.receiveShadow = true; }
            for (let i = 0; i < node.numChildren; i++) visit(node.getChildAt(i));
        };
        visit(this.model);
        this.createWake();
        if (LakeDuck.activeDucks.size === 0) LakeDuck.nextStatusTime = 0;
        LakeDuck.activeDucks.add(this);
        this.applyPose();
        this.addCredit();
        this.publishStatus();
    }

    private createWake() {
        // Two faint curved ribbons trail the tail; they stay on the water instead of bobbing.
        const vertices: number[] = [], indices: number[] = [];
        for (const side of [-1, 1]) {
            const start = vertices.length / 3;
            for (let i = 0; i <= 14; i++) {
                const t = i / 14;
                const x = side * (.11 + .20 * t), z = -.16 - .56 * t;
                const width = .007 * Math.sin(Math.PI * t);
                vertices.push(x - width, 0, z, x + width, 0, z);
                if (i < 14) {
                    const a = start + i * 2;
                    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
                }
            }
        }
        this.wakeMesh = Laya.PrimitiveMesh._createMesh(Laya.VertexMesh.getVertexDeclaration("POSITION"),
            new Float32Array(vertices), new Uint16Array(indices));
        this.wakeMaterial = new Laya.UnlitMaterial();
        this.wakeMaterial.renderMode = Laya.UnlitMaterial.RENDERMODE_TRANSPARENT;
        this.wakeMaterial.albedoColor = new Laya.Color(.70, .85, .84, .18);
        this.wakeMaterial.cull = Laya.RenderState.CULL_NONE;
        this.wakeMaterial.renderQueue = 3010;
        this.wake = new Laya.Sprite3D("Subtle water wake");
        this.owner.addChild(this.wake);
        this.wake.addComponent(Laya.MeshFilter).sharedMesh = this.wakeMesh;
        const renderer = this.wake.addComponent(Laya.MeshRenderer);
        renderer.sharedMaterial = this.wakeMaterial;
        renderer.castShadow = false; renderer.receiveShadow = false;
        this.wake.transform.localPosition = new Laya.Vector3(0, .009, 0);
    }

    private applyPose() {
        const phase = this.phaseDegrees * Math.PI / 180;
        const direction = this.direction < 0 ? -1 : 1;
        const angle = phase + direction * this.age * Math.PI * 2 / Math.max(12, this.periodSeconds);
        const rx = Math.max(0, this.radiusX), rz = Math.max(0, this.radiusZ);
        this.position.setValue(this.center.x + rx * Math.cos(angle), this.center.y,
            this.center.z + rz * Math.sin(angle));
        const heading = Math.atan2(-direction * rx * Math.sin(angle), direction * rz * Math.cos(angle));
        this.rotation.setValue(0, heading * 180 / Math.PI, 0);
        const root = this.owner as Laya.Sprite3D;
        root.transform.localPosition = this.position;
        root.transform.localRotationEuler = this.rotation;
        const bob = Math.max(0, Math.min(.012, this.bobHeight));
        this.modelPosition.setValue(0, bob * Math.sin(this.age * 1.55 + phase), 0);
        this.modelRotation.setValue(.7 * Math.sin(this.age * .8 + phase), 0,
            1.1 * Math.sin(this.age * 1.1 + phase));
        this.model.transform.localPosition = this.modelPosition;
        this.model.transform.localRotationEuler = this.modelRotation;
    }

    onUpdate() {
        if (!this.center) return;
        this.age += Math.min(.05, Math.max(0, Laya.timer.delta / 1000));
        this.applyPose();
        this.publishStatus();
    }

    private addCredit() {
        if (typeof document === "undefined" || document.getElementById("duck-asset-credit")) return;
        const prompt = document.querySelector("#lingshui-hud .capture > div");
        if (!prompt) return;
        const credit = document.createElement("div");
        credit.id = "duck-asset-credit";
        credit.style.cssText = "font-size:10px;color:#b8c5d1;margin-top:12px;line-height:1.5";
        credit.innerHTML = '<a href="https://poly.pizza/m/frSLi6b6Vid" target="_blank" rel="noopener" style="color:inherit">Mallard duck · Poly by Google</a> · <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener" style="color:inherit">CC BY 3.0</a>';
        credit.title = "项目调整了模型尺寸、水线原点与贴图分辨率；完整署名见随附 ASSET_CREDITS.md。";
        credit.addEventListener("pointerdown", event => event.stopPropagation());
        prompt.appendChild(credit);
    }

    private publishStatus() {
        if (Laya.timer.currTimer < LakeDuck.nextStatusTime) return;
        const hud = typeof document !== "undefined" ? document.getElementById("lingshui-hud") : null;
        if (!hud) return;
        LakeDuck.nextStatusTime = Laya.timer.currTimer + 400;
        hud.dataset.duckStatus = JSON.stringify(Array.from(LakeDuck.activeDucks).map(duck => {
            const p = (duck.owner as Laya.Sprite3D).transform.position;
            return { name: duck.owner.name, position: [p.x, p.y, p.z], waterLevel: duck.center.y,
                radius: [duck.radiusX, duck.radiusZ], period: duck.periodSeconds, age: duck.age };
        }));
    }

    onDestroy() {
        LakeDuck.activeDucks.delete(this);
        this.wakeMesh?.destroy(); this.wakeMaterial?.destroy();
        if (!LakeDuck.activeDucks.size && typeof document !== "undefined")
            document.getElementById("duck-asset-credit")?.remove();
    }
}
