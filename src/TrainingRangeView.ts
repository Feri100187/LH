export type TrainingPoint = [number, number, number];
export interface TrainingTargetSpec { id: string; label: string; position: TrainingPoint; yawDegrees?: number; }
export interface TrainingCoverSpec { center: TrainingPoint; size: TrainingPoint; }

/** Runtime-owned geometry; no scene assets, UUIDs or gameplay state are changed here. */
export class TrainingRangeView {
    readonly root = new Laya.Sprite3D("M1_TrainingRange");
    private readonly colliderIds = new Map<Laya.PhysicsCollider, string>();
    private readonly meshes: Laya.Mesh[] = [];
    private readonly materials: Laya.Material[] = [];
    private readonly targets: { spec: TrainingTargetSpec; blue: Laya.MeshSprite3D;
        center: Laya.MeshSprite3D; number: Laya.Sprite3D; check: Laya.Sprite3D }[] = [];
    private readonly white: Laya.BlinnPhongMaterial;
    private readonly blue: Laya.BlinnPhongMaterial;
    private readonly orange: Laya.BlinnPhongMaterial;
    private readonly green: Laya.BlinnPhongMaterial;
    private readonly metal: Laya.BlinnPhongMaterial;
    private destroyed = false;

    constructor(world: Laya.Scene3D, targets: TrainingTargetSpec[], cover?: TrainingCoverSpec) {
        world.addChild(this.root);
        this.white = this.material(.90, .94, .96);
        this.blue = this.material(.035, .34, .69);
        this.orange = this.material(1, .34, .055);
        this.green = this.material(.045, .66, .25);
        this.metal = this.material(.10, .15, .19);
        targets.forEach((spec, index) => this.addTarget(spec, index + 1));
        if (cover) this.addCover(cover);
    }

    targetIdForCollider(collider: Laya.PhysicsCollider): string | null {
        return this.colliderIds.get(collider) || null;
    }

    applyCompleted(completedIds: string[]): void {
        const ids = new Set(completedIds);
        for (const target of this.targets) {
            const completed = ids.has(target.spec.id);
            target.blue.meshRenderer.sharedMaterial = completed ? this.green : this.blue;
            target.center.meshRenderer.sharedMaterial = completed ? this.green : this.orange;
            target.number.active = !completed;
            target.check.active = completed;
        }
    }

    getTargets() {
        return this.targets.map(({ spec }) => {
            const yawDegrees = spec.yawDegrees || 0, yaw = yawDegrees * Math.PI / 180;
            const sine = Math.sin(yaw), cosine = Math.cos(yaw);
            // Rotate the asymmetric local Z slab [-.08, .11] around the target center.
            const cx = spec.position[0] + sine * .015, cz = spec.position[2] + cosine * .015;
            const ex = Math.abs(cosine) * .65 + Math.abs(sine) * .095;
            const ez = Math.abs(sine) * .65 + Math.abs(cosine) * .095;
            return { id: spec.id, label: spec.label, center: spec.position.slice() as TrainingPoint,
                yawDegrees, rotation: [0, yawDegrees, 0] as TrainingPoint,
                bounds: {
                    min: [cx - ex, spec.position[1] - .65, cz - ez] as TrainingPoint,
                    max: [cx + ex, spec.position[1] + .65, cz + ez] as TrainingPoint
                }, radius: .65, thickness: .19, collisionGroup: 4, canCollideWith: 2 };
        });
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.colliderIds.clear();
        this.root.destroy(true);
        this.meshes.forEach(mesh => mesh.destroy());
        this.materials.forEach(material => material.destroy());
        this.targets.length = this.meshes.length = this.materials.length = 0;
    }

    private material(r: number, g: number, b: number) {
        const material = new Laya.BlinnPhongMaterial();
        material.albedoColor = new Laya.Color(r, g, b, 1);
        material.shininess = .28;
        this.materials.push(material);
        return material;
    }

    private mesh(parent: Laya.Sprite3D, name: string, mesh: Laya.Mesh, material: Laya.Material,
        position: TrainingPoint): Laya.MeshSprite3D {
        this.meshes.push(mesh);
        const node = new Laya.MeshSprite3D(mesh, name);
        parent.addChild(node);
        node.transform.localPosition = new Laya.Vector3(...position);
        node.meshRenderer.sharedMaterial = material;
        node.meshRenderer.receiveShadow = true;
        node.meshRenderer.castShadow = true;
        return node;
    }

    private box(parent: Laya.Sprite3D, name: string, size: TrainingPoint, position: TrainingPoint,
        material: Laya.Material, solid = false) {
        const node = this.mesh(parent, name, Laya.PrimitiveMesh.createBox(...size), material, position);
        if (solid) this.collider(node, new Laya.BoxColliderShape(...size), 1);
        return node;
    }

    private disc(parent: Laya.Sprite3D, name: string, radius: number, thickness: number,
        z: number, material: Laya.Material) {
        const node = this.mesh(parent, name, Laya.PrimitiveMesh.createCylinder(radius, thickness, 40),
            material, [0, 0, z]);
        node.transform.localRotationEuler = new Laya.Vector3(90, 0, 0);
        return node;
    }

    private collider(node: Laya.Sprite3D, shape: Laya.Physics3DColliderShape, group: number) {
        const collider = node.addComponent(Laya.PhysicsCollider);
        collider.collisionGroup = group;
        collider.canCollideWith = 2;
        collider.colliderShape = shape;
        return collider;
    }

    private addTarget(input: TrainingTargetSpec, number: number) {
        const spec = { ...input, position: input.position.slice() as TrainingPoint };
        const mount = new Laya.Sprite3D(`M1_Target_${spec.id}`);
        this.root.addChild(mount);
        mount.transform.localPosition = new Laya.Vector3(...spec.position);
        mount.transform.localRotationEuler = new Laya.Vector3(0, spec.yawDegrees || 0, 0);
        // Target centers sit 1.5m above the supplied ground level. Only the circular face scores.
        this.box(mount, "WeightedBase", [.86, .12, .64], [0, -1.44, 0], this.metal, true);
        this.box(mount, "BaseCap", [.72, .035, .50], [0, -1.3625, 0], this.blue);
        this.box(mount, "Support", [.10, 1.12, .10], [0, -.82, -.02], this.metal, true);
        this.box(mount, "SupportInset", [.046, .63, .012], [0, -.99, .037], this.white);
        this.disc(mount, "TargetRim", .65, .16, 0, this.metal);
        this.disc(mount, "OuterWhite", .612, .01, .076, this.white);
        const blue = this.disc(mount, "ScoringBlue", .515, .008, .084, this.blue);
        this.disc(mount, "InnerWhite", .37, .008, .092, this.white);
        const center = this.disc(mount, "Bullseye", .245, .008, .10, this.orange);
        // All face layers are inside this 0.19m physical slab, including raised symbols.
        // Keep the hit slab separate from rotated rendering nodes: its local axis is Z.
        const face = new Laya.Sprite3D("ScoringFaceCollider");
        mount.addChild(face);
        face.transform.localPosition = new Laya.Vector3(0, 0, .015);
        const collider = this.collider(face, new Laya.CylinderColliderShape(.65, .19,
            Laya.Physics3DColliderShape.SHAPEORIENTATION_UPZ), 4);
        this.colliderIds.set(collider, spec.id);
        const numberNode = this.makeNumber(mount, number);
        const check = new Laya.Sprite3D("CompletedCheck");
        mount.addChild(check);
        const short = this.box(check, "CheckShort", [.08, .20, .006], [-.09, -.025, .107], this.white);
        short.transform.localRotationEuler = new Laya.Vector3(0, 0, 42);
        const long = this.box(check, "CheckLong", [.08, .32, .006], [.055, .02, .107], this.white);
        long.transform.localRotationEuler = new Laya.Vector3(0, 0, -38);
        check.active = false;
        this.targets.push({ spec, blue, center, number: numberNode, check });
    }

    private makeNumber(parent: Laya.Sprite3D, number: number) {
        const root = new Laya.Sprite3D(`Number_${number}`);
        parent.addChild(root);
        const segments: { [key: number]: number[] } = { 1: [1, 2], 2: [0, 1, 6, 4, 3], 3: [0, 1, 6, 2, 3] };
        const points = [[0, .14], [.09, .07], [.09, -.07], [0, -.14], [-.09, -.07], [-.09, .07], [0, 0]];
        for (const segment of segments[number] || segments[1]) {
            const horizontal = segment === 0 || segment === 3 || segment === 6;
            this.box(root, `DigitSegment${segment}`, horizontal ? [.14, .035, .006] : [.035, .105, .006],
                [points[segment][0], points[segment][1], .107], this.white);
        }
        return root;
    }

    private addCover(cover: TrainingCoverSpec) {
        const mount = new Laya.Sprite3D("M1_TrainingCover");
        this.root.addChild(mount);
        mount.transform.localPosition = new Laya.Vector3(...cover.center);
        const [x, y, z] = cover.size;
        // Recess the render body so the inset colored facing remains visible, while the
        // collider contains the full panel assembly, including the facing and stripes.
        const body = this.box(mount, "SolidCover", [x, y, Math.max(.01, z - .03)], [0, 0, 0], this.metal);
        this.collider(body, new Laya.BoxColliderShape(...cover.size), 1);
        // Thin, flush decorative panels stay inside the physical cover's dimensions.
        this.box(mount, "CoverBluePanel", [x * .92, y * .86, .012], [0, 0, z / 2 - .01], this.blue);
        for (let i = -1; i <= 1; i++) {
            const stripe = this.box(mount, "CoverSafetyStripe", [x * .055, y * .68, .014],
                [i * x * .23, 0, z / 2 - .012], this.orange);
            stripe.transform.localRotationEuler = new Laya.Vector3(0, 0, -18);
        }
    }
}
