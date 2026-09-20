"""Author editable game locomotion on the existing AWB rig; never overwrite source art.

Run with Blender 5.2 -b source.blend --python this_file.py.  Optional flags after --:
--render-only (open this script's output .blend), --quick (skip final export/render).
"""
import bpy, math, json, os, sys, hashlib, struct
from mathutils import Vector, Matrix, Quaternion, Euler
from math import sin, cos, pi
import numpy as np

# BEGIN PROJECT ROOT GUARD
from pathlib import Path
try:
    _script_file = Path(__file__).resolve(strict=True)
except (NameError, TypeError, OSError) as exc:
    raise RuntimeError("Cannot locate this authoring script. Run Blender with --python and the actual script file path.") from exc
_project_directory = _script_file.parent.parent
if not _script_file.is_file() or _script_file.parent.name != "tools" or not (_project_directory / "LH.laya").is_file():
    raise RuntimeError("Authoring script must be inside the tools directory of an LH project containing LH.laya.")
ROOT = _project_directory.as_posix()
# END PROJECT ROOT GUARD
SOURCE = ROOT + '/source_art/AnimeWatergunBoy/rigged_20260919'
OUT = ROOT + '/source_art/AnimeWatergunBoy/gameplay_20260920'
for sub in ['', '/qa', '/previews']:
    os.makedirs(OUT + sub, exist_ok=True)
scene = bpy.data.scenes['AWB_Animated']; bpy.context.window.scene = scene
rig = bpy.data.objects['AWB_Rig']; arm = rig.data; PB = rig.pose.bones
asset = bpy.data.collections['AWB | Rigged character']
rest = {b.name: b.matrix_local.copy() for b in arm.bones}
scene.render.fps = 30

# Reuse the already verified two-bone IK, ground-aware sole placement, and jump timing.
source_code = open(SOURCE + '/scripts/20_make_actions.py', encoding='utf-8').read()
function_code = 'def smooth(t)' + source_code.split('def smooth(t)', 1)[1].split('rig.animation_data_create();meta=[]', 1)[0]
exec(compile(function_code, 'existing_awb_pose_functions', 'exec'), globals())
original_pose = pose
rig.animation_data.action=bpy.data.actions['Idle']
rig.animation_data.action_slot=rig.animation_data.action.slots[0]
scene.frame_set(1);original_pose('Idle',0)
source_bind_basis={b.name:b.matrix_basis.copy() for b in PB}

SPECS = [('Idle', 90, True), ('Walk', 22, True), ('Run', 18, True),
         ('Jump', 42, False), ('Shoot', 6, True), ('RunJump', 48, False)]
LOCOMOTION = {
    'Walk': {'stride': .72, 'duty': .60, 'lift': .12, 'frames': 22},
    'Run': {'stride': .90, 'duty': .38, 'lift': .255, 'frames': 18},
}

def pose_game(kind, t):
    reset_pose()
    hip = hipx = hiproll = hipyaw = lean = chest_sway = 0.
    gun_bob = Vector((0, 0, 0)); weapon_yaw_sway = 0.; shot = 0.
    jumpstate = None
    fr = {s: (arm.bones['foot.'+s].head_local.x,
              arm.bones['foot.'+s].head_local.y, 0, 0) for s in ['R','L']}
    if kind in ['Jump','RunJump']:
        jumpstate = original_pose(kind, t)
        # Original lower-body trajectory remains intact, including its exact clip boundaries.
        lean = lerpkeys(t, [(0,.03),(.19,.17),(.33,.045),(.67,.03),(.79,.15),(1,.03)])
        hip = PB['pelvis'].location.length
    elif kind in ['Idle','Shoot']:
        breath = sin(2*pi*t)
        hip = .0032*breath if kind == 'Idle' else 0.
        hipx = .0055*breath if kind == 'Idle' else 0.
        hiproll = .010*breath if kind == 'Idle' else 0.
        hipyaw = math.radians(.85)*breath if kind == 'Idle' else 0.
        lean = math.radians(1.0) + .009*breath if kind == 'Idle' else math.radians(1.0)
        chest_sway = math.radians(.55)*sin(2*pi*t+.25) if kind == 'Idle' else 0.
        gun_bob = Vector((.002*breath, 0, .0035*breath)) if kind == 'Idle' else Vector((0,0,0))
        if kind == 'Shoot':
            # Already at the shoulder: the first sample contains water and trigger pressure.
            shot = .72 + .28*cos(2*pi*t)
            gun_bob = Vector((0, .004*sin(pi*t)**2, .0015*sin(2*pi*t)))
    else:
        spec = LOCOMOTION[kind]; run = kind == 'Run'
        if run:
            hip = -.175 - .021*cos(4*pi*(t-.11))
            hipx = .012*sin(2*pi*t)
            hiproll = math.radians(2.0)*sin(2*pi*t)
            hipyaw = math.radians(9.0)*sin(2*pi*t)
            lean = math.radians(9.5) + math.radians(1.4)*sin(4*pi*t)
            chest_sway = -1.35*hipyaw
            gun_bob = Vector((.012*sin(2*pi*t+.35), .006*sin(2*pi*t), .012*cos(4*pi*t)))
            weapon_yaw_sway = math.radians(5.0)*sin(2*pi*t+.3)
        else:
            hip = -.083 - .025*cos(4*pi*(t-.05))
            hipx = .018*sin(2*pi*(t+.05))
            hiproll = math.radians(2.0)*sin(2*pi*t)
            hipyaw = math.radians(6.0)*sin(2*pi*t)
            lean = math.radians(2.7) + math.radians(.8)*sin(4*pi*t)
            chest_sway = -1.4*hipyaw
            gun_bob = Vector((.008*sin(2*pi*t+.2), .005*sin(2*pi*t), .008*cos(4*pi*t)))
            weapon_yaw_sway = math.radians(2.1)*sin(2*pi*t+.2)
        for side, phase in [('R',t),('L',t+.5)]:
            y,h,p = gait(phase, spec['duty'], spec['stride'], spec['lift'])
            fr[side] = (-.112 if side == 'R' else .112, y, h, p*(.7 if not run else .8))

    if not jumpstate:
        local_translate('pelvis', (hipx,0,hip))
        local_rot('pelvis', (lean*.25, hiproll, hipyaw))
    else:
        # Keep original pelvis and feet. Add expressive counter-rotation above them.
        hipyaw = 0.
        chest_sway = math.radians(2.0)*sin(2*pi*t)

    carry_side = kind == 'Run'
    chest_yaw = math.radians(-5 if carry_side else -32) + chest_sway
    local_rot('spine', (lean*.42,-hiproll*.4,chest_yaw*.45))
    local_rot('chest', (lean*.33,-hiproll*.45,chest_yaw*.55))
    # The face continues looking in the direction of travel, independent of the support stance.
    head_yaw = -(hipyaw + chest_yaw)
    local_rot('neck',(-lean*.28,hiproll*.2,head_yaw*.28))
    local_rot('head',(-lean*.50,hiproll*.45,head_yaw*.72))
    bpy.context.view_layer.update()

    shoulders = (PB['upper_arm.R'].head + PB['upper_arm.L'].head)*.5
    if carry_side:
        wp = shoulders + Vector((-.040,-.300,-.190)) + gun_bob
        yaw = math.radians(-18) + weapon_yaw_sway
        pitch = math.radians(4)
    else:
        wp = shoulders + Vector((-.183,-.120,-.050)) + gun_bob
        yaw = -pi/2 + weapon_yaw_sway
        pitch = 0 if kind == 'Shoot' else math.radians(2)
    rot = Matrix.Rotation(yaw,4,'Z') @ Matrix.Rotation(pitch,4,'Y')
    PB['CTRL_weapon'].matrix = Matrix.Translation(wp) @ rot @ rest['CTRL_weapon'].to_3x3().to_4x4()
    if not jumpstate:
        for s, (x,y,h,p) in fr.items(): foot(s,x,y,h,p)

    PB['water_jet'].scale = (.82+.18*shot,.66+.30*shot,.82+.18*shot) if shot else (.0001,.0001,.0001)
    PB['trigger'].rotation_quaternion = Quaternion((1,0,0),-.14*shot)
    # Keep the reference's already curled fingers; only the trigger finger articulates.
    for i, ang in [(1,.007),(2,.028),(3,.040)]:
        PB[f'index.{i:02d}.R'].rotation_quaternion = Quaternion((0,0,1),ang*shot)
    bpy.context.view_layer.update()
    return {'shot':shot, 'feet':fr if not jumpstate else jumpstate['feet']}

def matrix_difference(a,b): return max(abs(a[r][c]-b[r][c]) for r in range(4) for c in range(4))

def render_previews():
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type='OPTIX'; prefs.get_devices()
        for d in prefs.devices:d.use=d.type=='OPTIX'
        scene.cycles.device='GPU'
    except Exception: scene.cycles.device='CPU'
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=720;scene.render.resolution_y=840;scene.render.resolution_percentage=100
    cd=bpy.data.cameras.new('Gameplay QA Camera');cd.type='ORTHO';cd.ortho_scale=2.22
    cam=bpy.data.objects.new('Gameplay QA Camera',cd);scene.collection.objects.link(cam);scene.camera=cam
    specs=[('Idle',1,'front',(0,-6,1.12)),('Idle',1,'side',(6,-.25,1.12)),
           ('Idle',1,'threequarter',(3.8,-6,1.65)),
           ('Walk',1,'contact',(3.8,-6,1.5)),('Walk',7,'passing',(3.8,-6,1.5)),
           ('Run',1,'contact',(3.8,-6,1.5)),('Run',6,'flight',(3.8,-6,1.5)),
           ('Shoot',1,'first_frame',(3.8,-6,1.5))]
    for name,frame,tag,pos in specs:
        a=bpy.data.actions[name];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
        scene.frame_set(frame);bpy.context.view_layer.update()
        target=Vector((0,0,.90));cam.location=pos;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=f'{OUT}/previews/{name}_{tag}.png'
        bpy.ops.render.render(write_still=True)
        print('PREVIEW',name,tag,flush=True)

if '--render-only' in sys.argv:
    render_previews()
    raise SystemExit(0)

rig.animation_data_create();rig.animation_data.action=None
for tr in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(tr)
for name,_,_ in SPECS:
    if name in bpy.data.actions:bpy.data.actions.remove(bpy.data.actions[name],do_unlink=True)

all_metrics=[]
for kind,frames,loop in SPECS:
    action=bpy.data.actions.new(kind);action.use_fake_user=True
    slot=action.slots.new(id_type='OBJECT',name=rig.name)
    rig.animation_data.action=action;rig.animation_data.action_slot=slot
    lastq={};metrics=[];first_pose=None
    for k in range(frames+1):
        scene.frame_set(k+1);state=pose_game(kind,k/frames)
        for name in KEYED:
            p=PB[name];q=p.rotation_quaternion
            if name in lastq and q.dot(lastq[name])<0:q.negate()
            lastq[name]=q.copy()
            for path in ['location','rotation_quaternion','scale']:
                p.keyframe_insert(data_path=path,frame=k+1,group=name)
        errors={};soles={};griperr=0
        for s in ['R','L']:
            errors['ankle.'+s]=(PB['shin.'+s].tail-PB['CTRL_foot.'+s].head).length
            errors['wrist.'+s]=(PB['forearm.'+s].tail-PB['CTRL_hand.'+s].head).length
            hd=PB['hand.'+s].matrix@rest['hand.'+s].inverted()
            wd=PB['weapon'].matrix@rest['weapon'].inverted()
            griperr=max(griperr,matrix_difference(hd,wd))
            ob=bpy.data.objects['AWB.Shoe | '+s+' layered sole']
            ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
            soles[s]=min((ev.matrix_world@v.co).z for v in me.vertices);ev.to_mesh_clear()
        direction=(PB['weapon'].tail-PB['weapon'].head).normalized()
        mats=np.array([list(row) for b in PB for row in b.matrix])
        if first_pose is None:first_pose=mats
        metrics.append({'frame':k+1,'ik_error_m':errors,'sole_min_z_m':soles,
                        'hand_weapon_matrix_difference':griperr,'muzzle_direction_blender':list(direction),
                        'water_strength':state['shot'],
                        'feet_ankle_y_m':{s:float(PB['foot.'+s].head.y) for s in ['R','L']}})
    for layer in action.layers:
        for strip in layer.strips:
            cb=strip.channelbag(slot)
            if cb:
                for fc in cb.fcurves:
                    for key in fc.keyframe_points:key.interpolation='LINEAR'
    action['loop']=loop;action['fps']=30;action['duration_seconds']=frames/30
    action['movement']='forward root motion 1.85m' if kind=='RunJump' else 'in place / grounded origin'
    track=rig.animation_data.nla_tracks.new();track.name=kind;track.mute=True
    st=track.strips.new(kind,1,action);st.action_slot=slot;st.blend_type='REPLACE';st.extrapolation='NOTHING'
    summary={'name':kind,'frames':[1,frames+1],'seconds':frames/30,'loop':loop,
             'max_wrist_ik_error_m':max(max(m['ik_error_m']['wrist.'+s] for s in ['R','L']) for m in metrics),
             'max_ankle_ik_error_m':max(max(m['ik_error_m']['ankle.'+s] for s in ['R','L']) for m in metrics),
             'minimum_sole_z_m':min(min(m['sole_min_z_m'].values()) for m in metrics),
             'max_hand_weapon_matrix_difference':max(m['hand_weapon_matrix_difference'] for m in metrics),
             'loop_matrix_difference':float(np.max(np.abs(mats-first_pose))) if loop else None,
             'muzzle_forward_angle_max_deg':max(math.degrees(math.acos(max(-1,min(1,-m['muzzle_direction_blender'][1])))) for m in metrics)}
    if kind in LOCOMOTION:
        spec=LOCOMOTION[kind]
        measured=[];residuals=[]
        for side,offset in [('R',0),('L',.5)]:
            points=[(((m['frame']-1)/frames+offset)%1,m['feet_ankle_y_m'][side])
                    for m in metrics[:-1]
                    if (((m['frame']-1)/frames+offset)%1)<spec['duty']]
            xy=np.array(points);coef=np.polyfit(xy[:,0],xy[:,1],1)
            measured.append(float(coef[0]/(frames/30)))
            residuals.append(float(np.max(np.abs(xy[:,1]-np.polyval(coef,xy[:,0])))))
        summary.update({'stance_stride_m':spec['stride'],'stance_duty':spec['duty'],
                        'matched_linear_speed_mps':spec['stride']/(spec['duty']*frames/30),
                        'measured_stance_ankle_speeds_mps':measured,
                        'maximum_stance_ankle_linear_residual_m':max(residuals),
                        'cadence_steps_per_second':2/(frames/30)})
    all_metrics.append(summary)
    json.dump(metrics,open(f'{OUT}/qa/{kind}_all_frames.json','w'),indent=2)
    print('ACTION',json.dumps(summary),flush=True)

report={'status':'PASS' if all(m['max_wrist_ik_error_m']<.002 and m['max_ankle_ik_error_m']<.002 and m['minimum_sole_z_m']>-.003 and (m['loop_matrix_difference'] is None or m['loop_matrix_difference']<.0001) for m in all_metrics) else 'FAIL',
        'actions':all_metrics,'source_sha256':hashlib.sha256(open(SOURCE+'/AnimeWatergunBoy_Rigged.blend','rb').read()).hexdigest(),
        'notes':'World axis Blender forward -Y, glTF forward +Z. Linear-speed match is measured from the linear stance ankle trajectory. Root motion is retained only for original jump source clips and must be stripped by the existing game importer. Two hands remain attached to the independent weapon control. Shoot is a 0.2-second continuous loop with immediate visible water.'}
json.dump(report,open(OUT+'/qa/gameplay_motion_quality.json','w'),indent=2)
idle=bpy.data.actions['Idle'];rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0]
scene.frame_start=1;scene.frame_end=91;scene.frame_set(1);bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/AnimeWatergunBoy_Gameplay.blend')
if '--quick' in sys.argv:raise SystemExit(0)
assert report['status']=='PASS',json.dumps(report)

# Use exactly the source export's Idle-first-frame binding pose, not the new ready pose.
rig.animation_data.action=None
for b in PB:b.matrix_basis=source_bind_basis[b.name]
bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in asset.all_objects:
    if o.type=='MESH':o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=OUT+'/AnimeWatergunBoy_Gameplay.glb',export_format='GLB',use_selection=True,
    export_apply=False,export_animations=True,export_animation_mode='ACTIONS',export_anim_single_armature=False,
    export_merge_animation='ACTION',export_force_sampling=True,export_frame_step=1,export_frame_range=False,
    export_anim_slide_to_zero=True,export_skins=True,export_def_bones=True,export_reset_pose_bones=True,
    export_optimize_animation_size=False,export_rest_position_armature=False,export_current_frame=True,
    export_yup=True,export_materials='EXPORT',export_image_format='AUTO',export_texcoords=True,
    export_normals=True,export_vertex_color='MATERIAL',export_all_vertex_colors=True,
    export_cameras=False,export_lights=False,export_extras=True)
def read_glb(path):
    raw=open(path,'rb').read();pos=12;doc=None;binary=None
    while pos<len(raw):
        size,kind=struct.unpack_from('<II',raw,pos);chunk=raw[pos+8:pos+8+size];pos+=8+size
        if kind==0x4e4f534a:doc=json.loads(chunk)
        elif kind==0x004e4942:binary=chunk
    return doc,binary
def accessor(doc,raw,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    assert a['componentType']==5126
    size={'MAT4':16,'VEC4':4,'VEC3':3,'SCALAR':1}[a['type']]
    offset=v.get('byteOffset',0)+a.get('byteOffset',0)
    return np.frombuffer(raw,dtype='<f4',count=a['count']*size,offset=offset).reshape(a['count'],size)
old,oldbin=read_glb(SOURCE+'/AnimeWatergunBoy_Rigged.glb')
new,newbin=read_glb(OUT+'/AnimeWatergunBoy_Gameplay.glb')
oldnodes={n['name']:n for n in old['nodes']};newnodes={n['name']:n for n in new['nodes']}
bind_differences=[];trs_differences=[]
for oldskin,newskin in zip(old['skins'],new['skins']):
    oldjoint={old['nodes'][n]['name']:i for i,n in enumerate(oldskin['joints'])}
    newjoint={new['nodes'][n]['name']:i for i,n in enumerate(newskin['joints'])}
    om=accessor(old,oldbin,oldskin['inverseBindMatrices']);nm=accessor(new,newbin,newskin['inverseBindMatrices'])
    bind_differences.extend(float(np.max(np.abs(om[i]-nm[newjoint[name]]))) for name,i in oldjoint.items())
for name in oldnodes.keys() & newnodes.keys():
    for key,default in [('translation',[0,0,0]),('rotation',[0,0,0,1]),('scale',[1,1,1])]:
        trs_differences.append(float(np.max(np.abs(np.array(oldnodes[name].get(key,default))-np.array(newnodes[name].get(key,default))))))
bind_report={'max_inverse_bind_difference':max(bind_differences),'max_node_trs_difference':max(trs_differences),
             'old_skin_count':len(old['skins']),'new_skin_count':len(new['skins']),
             'animation_names':[a['name'] for a in new['animations']]}
json.dump(bind_report,open(OUT+'/qa/bind_compatibility.json','w'),indent=2)
print('BIND_COMPATIBILITY',json.dumps(bind_report),flush=True)
rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0];scene.frame_set(1)
render_previews()
rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0];scene.frame_set(1)
scene.camera=bpy.data.objects['AWB.Camera.ThreeQuarter']
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/AnimeWatergunBoy_Gameplay.blend')
print('GAMEPLAY_MOTION_COMPLETE',OUT,flush=True)
