#!/usr/bin/env node
"use strict";
// Execute the adapter with scene/DOM/physics doubles. NOT an engine integration pass.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
let ts;
try { ts = require("typescript"); }
catch (_) { if (!process.env.TYPESCRIPT_PATH) throw new Error("Run npm ci or set TYPESCRIPT_PATH."); ts = require(process.env.TYPESCRIPT_PATH); }
const clock = { now: 100 }, document = { hidden: false, hasFocus: () => true };
class Vector3 { constructor(x=0,y=0,z=0){this.setValue(x,y,z);} setValue(x,y,z){this.x=x;this.y=y;this.z=z;} }
class Node {
    constructor(name=""){this.name=name;this.children=[];this.components=new Map();this.transform={position:new Vector3()};this.active=true;}
    addChild(n){this.children.push(n);n.parent=this;return n;}
    getChildByName(name){return this.children.find(n=>n.name===name);}
    getChildAt(i){return this.children[i];}
    get numChildren(){return this.children.length;}
    getComponent(type){return this.components.get(type)||null;}
    destroy(){this.destroyed=true;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
}
class Avatar{} class Follow{} class MeshRenderer{}
const Laya={Script:class{},Sprite3D:Node,MeshRenderer,Vector3,Vector2:class{constructor(x,y){this.x=x;this.y=y;}},
    Ray:class{constructor(origin,direction){this.origin=origin;this.direction=direction;}},HitResult:class{},
    Color:class{constructor(r,g,b,a){Object.assign(this,{r,g,b,a});}},regClass:()=>x=>x};
const modules={};
function load(name){
    if(modules[name])return modules[name];
    const source=fs.readFileSync(path.join(root,"src",name+".ts"),"utf8");
    const r=ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2018,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}});
    assert.equal((r.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
    const exports=modules[name]={};
    new Function("exports","require","Laya","document","performance",r.outputText)(exports,id=>
        id==="./PlayerAvatar"?{PlayerAvatar:Avatar}:id==="./PlayerCameraFollow"?{PlayerCameraFollow:Follow}:load(id.slice(2)),
        Laya,document,{now:()=>clock.now});
    return exports;
}
const {WatergunTraining}=load("WatergunTraining"),{TrainingTarget,ShotGate}=load("WatergunHit");
const results=[];
function test(name,run){
    document.hidden=false;document.hasFocus=()=>true;clock.now=100;
    try{run();results.push({name,status:"PASS"});}catch(e){results.push({name,status:"FAIL",error:e.message});}
}
function installationFixture(){
    const component=new WatergunTraining(),world=new Node("World"),player=world.addChild(new Node("PlayerCapsule"));
    const avatarNode=player.addChild(new Node("PlayerAvatar"));avatarNode.addChild(new Node("water_jet"));
    const avatar={owner:avatarNode,getStatus:()=>({loaded:true,shots:0}),isShooting:false};avatarNode.components.set(Avatar,avatar);
    const camera=world.addChild(new Node("PlayerCamera"));camera.addChild(new Node("FirstPersonArms")).addChild(new Node("water_jet"));
    const calls=[],original=()=>calls.push("original"),follower={follow:original};camera.components.set(Follow,follower);
    world.physicsSimulation={rayCast:()=>false};component.owner={scene3D:world};
    component.makeRange=()=>{};component.makeHud=()=>{};component.publish=()=>{};component.afterCamera=()=>calls.push("training");
    return{component,world,player,camera,avatar,avatarNode,follower,calls,original};
}
function firingFixture(){
    const component=new WatergunTraining(),target=new TrainingTarget("near"),events=[{id:1,atMs:100}];
    component.installed=true;component.worldMuzzle={transform:{position:new Vector3()}};
    component.viewMuzzle={transform:{position:new Vector3(1,0,0)}};component.viewMount={active:true};
    component.player={transform:{position:new Vector3(0,-.45,0)}};
    component.camera={normalizedViewportPointToRay:(_,ray)=>{ray.origin.setValue(0,0,0);ray.direction.setValue(0,0,1);}};
    component.avatar={isShooting:true,getStatus:()=>({shotEvents:events})};
    component.lines={clear(){},addLine(){}};component.marker={style:{}};component.splash={transform:{}};
    component.targets.set("near",{state:target,material:{},label:"near"});component.publish=()=>{};
    component.cast=(o,d,n,worldOnly)=>worldOnly?null:{point:{x:0,y:0,z:5},normal:{x:0,y:0,z:-1},targetId:"near"};
    return{component,target,events};
}
test("training scene preserves every original child/resource reference",()=>{
    const original=JSON.parse(fs.readFileSync(path.join(root,"assets","Scene.ls"),"utf8"));
    const scene=JSON.parse(fs.readFileSync(path.join(root,"assets","M1Training.ls"),"utf8"));
    const metadata=JSON.parse(fs.readFileSync(path.join(root,"src","WatergunTraining.ts.meta"),"utf8"));
    assert.equal(scene._$comp.at(-1)._$type,metadata.uuid);scene._$comp.pop();scene._$id=original._$id;scene.name=original.name;
    assert.deepEqual(scene,original);
});
test("new resource ids are valid and distinct",()=>{
    const ids=["src/WatergunHit.ts.meta","src/WatergunTraining.ts.meta","assets/M1Training.ls.meta"].map(p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8")).uuid);
    for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);assert.equal(new Set(ids).size,ids.length);
});
test("teardown before initialization is safe and repeatable",()=>{ const c=new WatergunTraining();c.dispose();c.dispose(); });
test("camera follow executes before training, exactly once",()=>{
    const f=installationFixture();f.component.tryInstall();f.component.tryInstall();f.follower.follow();assert.deepEqual(f.calls,["original","training"]);
});
test("teardown restores original callback and removes only training root",()=>{
    const f=installationFixture();f.component.tryInstall();f.component.dispose();f.component.dispose();
    assert.equal(f.follower.follow,f.original);assert.equal(f.world.getChildByName("M1TrainingRuntime"),undefined);
    assert.ok(!f.player.destroyed);assert.ok(!f.camera.destroyed);
});
test("teardown does not overwrite a newer callback owner",()=>{
    const f=installationFixture();f.component.tryInstall();const other=()=>{};f.follower.follow=other;f.component.dispose();assert.equal(f.follower.follow,other);
});
test("installation waits for original game initialization",()=>{
    const f=installationFixture();f.avatar.getStatus=()=>({loaded:false,shots:0});f.component.tryInstall();assert.ok(!f.component.installed);assert.equal(f.follower.follow,f.original);
});
test("ray adapter uses existing world query group and new target mask",()=>{
    const f=installationFixture(),targetNode=new Node("target");f.component.world=f.world;f.component.targetNodes.set(targetNode,"near");
    let recorded;
    f.world.physicsSimulation.rayCast=(ray,hit,distance,group,mask)=>{
        recorded={distance,group,mask};Object.assign(hit,{collider:{owner:targetNode},point:new Vector3(0,0,3),normal:new Vector3(0,0,-1)});return true;
    };
    assert.equal(f.component.cast({x:0,y:0,z:0},{x:0,y:0,z:1},20,false).targetId,"near");assert.deepEqual(recorded,{distance:20,group:2,mask:5});
    assert.equal(f.component.cast({x:0,y:0,z:0},{x:0,y:0,z:1},1,true).targetId,undefined);assert.equal(recorded.mask,1);
});
test("same emission observed twice damages target once",()=>{
    const f=firingFixture();f.component.afterCamera();f.component.afterCamera();assert.equal(f.target.hits,1);assert.equal(f.component.processedShots,1);
});
test("hidden event is consumed but never becomes deferred damage",()=>{
    const f=firingFixture();document.hidden=true;f.component.afterCamera();document.hidden=false;f.component.afterCamera();assert.equal(f.target.hits,0);
});
test("unfocused event does not apply damage",()=>{
    const f=firingFixture();document.hasFocus=()=>false;f.component.afterCamera();assert.equal(f.target.hits,0);
});
test("old event does not apply damage",()=>{const f=firingFixture();clock.now=400;f.component.afterCamera();assert.equal(f.target.hits,0);});
test("non-shooting presentation cannot synthesize an emission",()=>{
    const f=firingFixture();f.component.avatar.isShooting=false;f.component.afterCamera();assert.equal(f.target.hits,0);
});
test("reset clears progress but keeps consumed emission id",()=>{
    const f=firingFixture();f.component.afterCamera();f.component.reset();f.component.afterCamera();assert.equal(f.target.hits,0);assert.equal(f.component.gate.consumedId,1);
    f.events.push({id:2,atMs:300});clock.now=300;f.component.afterCamera();assert.equal(f.target.hits,1);
});
test("world muzzle, not viewmodel muzzle, owns collision resolution",()=>{
    const f=firingFixture();f.component.viewMuzzle.transform.position=new Vector3(100,0,0);
    const starts=[];f.component.cast=(o,d,n,worldOnly)=>{
        if(!worldOnly){starts.push(o.x);return{point:{x:0,y:0,z:5},normal:{x:0,y:0,z:-1},targetId:"near"};}return null;
    };
    f.component.afterCamera();assert.deepEqual(starts,[0,0]);assert.equal(f.target.hits,1);
});
test("effect storage stays bounded while events advance",()=>{
    const f=firingFixture();for(let i=1;i<=100;i++){clock.now=i*200;f.events.push({id:i,atMs:clock.now});f.component.afterCamera();}
    assert.equal(f.target.hits,3);assert.ok(f.component.beam&&!Array.isArray(f.component.beam));assert.equal(f.component.targets.size,1);
});
test("pulse visibility follows ordinary sibling visibility across view switches",()=>{
    const f=firingFixture(),renderer={enabled:true},reference={enabled:false};
    f.component.avatar.isShooting=false;f.component.pulseRenderers=[{renderer,reference,enabled:true}];f.component.afterCamera();assert.equal(renderer.enabled,false);
    reference.enabled=true;f.component.afterCamera();assert.equal(f.component.pulseRenderers[0].enabled,true);
    f.component.lines=null;f.component.splash=null;f.component.panel=null;f.component.marker=null;f.component.dispose();assert.equal(renderer.enabled,true);
});
const source=fs.readFileSync(path.join(root,"src","WatergunTraining.ts"));
const report={kind:"adapter-contract-with-scene-dom-physics-doubles",generatedAt:new Date().toISOString(),compilerVersion:ts.version,
    sourceSha256:crypto.createHash("sha256").update(source).digest("hex"),passed:results.filter(x=>x.status==="PASS").length,total:results.length,results,
    notVerified:["LayaAir full-project typecheck","native scene schema import","native build","Bullet runtime","renderer and real input"]};
if(process.env.M1_ADAPTER_REPORT_PATH)fs.writeFileSync(process.env.M1_ADAPTER_REPORT_PATH,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));process.exitCode=report.passed===report.total?0:1;
