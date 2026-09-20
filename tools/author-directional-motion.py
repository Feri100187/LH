"""Author true directional foot-IK cycles without turning the body or replacing source art."""
import bpy, os, json, math, sys, struct, hashlib
import numpy as np
from mathutils import Vector, Matrix, Quaternion, Euler

ROOT='D:/a/xiang_mu/LH'
GAMEPLAY=ROOT+'/source_art/AnimeWatergunBoy/gameplay_20260920'
AUTHOR=open(ROOT+'/tools/author-gameplay-motion.py',encoding='utf-8').read()
# Import definitions and the original export binding pose only; no action generation or writes.
exec(compile(AUTHOR.split("if '--render-only' in sys.argv:",1)[0],
             'reuse_verified_gameplay_functions','exec'),globals())
OUT=ROOT+'/source_art/AnimeWatergunBoy/directional_20260920'
for folder in ['', '/qa','/previews']:os.makedirs(OUT+folder,exist_ok=True)

# x=anatomical left, y=back. Body forward remains -Y throughout every clip.
DIRECTIONS={
    'Back':(0,1), 'Left':(1,0), 'Right':(-1,0),
    'ForwardLeft':(1,-1),'ForwardRight':(-1,-1),
    'BackLeft':(1,1),'BackRight':(-1,1),
}
# stride is each foot's travel during support, not the full loop displacement.
PARAMS={
    ('Walk','back'):dict(stride=.58,duty=.60,frames=24,lift=.105,spacing=.28,hip=-.083),
    ('Walk','side'):dict(stride=.40,duty=.62,frames=24,lift=.090,spacing=.46,hip=-.098),
    ('Walk','frontdiag'):dict(stride=.62,duty=.62,frames=24,lift=.115,spacing=.46,hip=-.112),
    ('Walk','backdiag'):dict(stride=.52,duty=.64,frames=26,lift=.100,spacing=.40,hip=-.098),
    ('Run','back'):dict(stride=.72,duty=.45,frames=22,lift=.200,spacing=.28,hip=-.155),
    ('Run','side'):dict(stride=.50,duty=.42,frames=20,lift=.165,spacing=.66,hip=-.202),
    ('Run','frontdiag'):dict(stride=.64,duty=.43,frames=20,lift=.235,spacing=.62,hip=-.214),
    ('Run','backdiag'):dict(stride=.58,duty=.46,frames=22,lift=.185,spacing=.55,hip=-.183),
}

def directional_foot(side,x,y,lift,pitch=0,roll=0,yaw=0):
    name='CTRL_foot.'+side
    rotation=Euler((pitch,roll,yaw),'XYZ').to_matrix()
    zmin=min((rotation@v).z for v in sole[side])
    mat=Matrix.Translation((x,y,lift-zmin))@rotation.to_4x4()@rest[name].to_3x3().to_4x4()
    PB[name].matrix=bone_delta('root')@mat

def config(base,direction):
    category='back' if direction=='Back' else 'side' if direction in ['Left','Right'] else 'frontdiag' if direction.startswith('Forward') else 'backdiag'
    return dict(PARAMS[(base,category)],category=category)

def directional_pose(base,direction,t,spec):
    pose_game(base,t)
    dx,dy=DIRECTIONS[direction];length=math.hypot(dx,dy);dx/=length;dy/=length
    run=base=='Run';back=dy>0;side=spec['category']=='side'
    # Small weight shift and hip/chest opposition are preserved; only lean follows travel.
    hip=spec['hip']-(.020 if run else .017)*cos(4*pi*(t-.06))
    sway=(.010 if run else .013)*sin(2*pi*t)
    hiproll=math.radians(1.7)*sin(2*pi*t)
    hipyaw=math.radians(6.5 if run else 4.5)*sin(2*pi*t)
    forward_lean=math.radians(8 if run else 2.5)*(-dy)
    side_lean=math.radians(4 if run else 1.8)*dx
    local_translate('pelvis',(sway,0,hip))
    local_rot('pelvis',(forward_lean*.25,hiproll+side_lean*.30,hipyaw))
    chest_yaw=math.radians(-5 if run else -32)-1.40*hipyaw
    local_rot('spine',(forward_lean*.42,-hiproll*.40+side_lean*.38,chest_yaw*.45))
    local_rot('chest',(forward_lean*.33,-hiproll*.45+side_lean*.32,chest_yaw*.55))
    head_yaw=-(hipyaw+chest_yaw)
    local_rot('neck',(-forward_lean*.28,hiproll*.20-side_lean*.25,head_yaw*.28))
    local_rot('head',(-forward_lean*.50,hiproll*.45-side_lean*.50,head_yaw*.72))
    bpy.context.view_layer.update()
    shoulders=(PB['upper_arm.R'].head+PB['upper_arm.L'].head)*.5
    bob=Vector((.008*sin(2*pi*t+.2),.004*sin(2*pi*t),.007*cos(4*pi*t)))
    if run:
        wp=shoulders+Vector((-.040,-.300,-.190))+bob
        yaw=math.radians(-18)+math.radians(4)*sin(2*pi*t+.3);pitch=math.radians(4)
    else:
        wp=shoulders+Vector((-.183,-.120,-.050))+bob
        yaw=-pi/2+math.radians(1.8)*sin(2*pi*t+.2);pitch=math.radians(2)
    rotation=Matrix.Rotation(yaw,4,'Z')@Matrix.Rotation(pitch,4,'Y')
    PB['CTRL_weapon'].matrix=Matrix.Translation(wp)@rotation@rest['CTRL_weapon'].to_3x3().to_4x4()
    feet={}
    for s,phase in [('R',t),('L',t+.5)]:
        travel,h,p=gait(phase,spec['duty'],spec['stride'],spec['lift'])
        # Stance feet move exactly opposite travel. Mirrored side clips exchange anatomical roles.
        center=(-.5 if s=='R' else .5)*spec['spacing']
        x=center-dx*travel;y=-dy*travel
        if side:y+=-.018 if s=='R' else .018
        pitch=p*(-dy)*(.50 if run else .60)
        roll=p*dx*.16
        toe_yaw=math.radians(-4 if s=='R' else 4)*(1 if abs(dx)>.1 else .5)
        directional_foot(s,x,y,h,pitch,roll,toe_yaw)
        feet[s]=(x,y,h)
    bpy.context.view_layer.update()
    return feet

rig.animation_data.action=None
for track in list(rig.animation_data.nla_tracks):
    if track.name not in ['Idle','Walk','Run','Jump','Shoot','RunJump']:
        rig.animation_data.nla_tracks.remove(track)

all_metrics=[]
for base in ['Walk','Run']:
    for direction in DIRECTIONS:
        name=base+direction;spec=config(base,direction);frames=spec['frames']
        if name in bpy.data.actions:bpy.data.actions.remove(bpy.data.actions[name],do_unlink=True)
        action=bpy.data.actions.new(name);action.use_fake_user=True
        slot=action.slots.new(id_type='OBJECT',name=rig.name)
        rig.animation_data.action=action;rig.animation_data.action_slot=slot
        first=None;lastq={};per=[]
        for k in range(frames+1):
            scene.frame_set(k+1);feet=directional_pose(base,direction,k/frames,spec)
            for name_bone in KEYED:
                p=PB[name_bone];q=p.rotation_quaternion
                if name_bone in lastq and q.dot(lastq[name_bone])<0:q.negate()
                lastq[name_bone]=q.copy()
                for path in ['location','rotation_quaternion','scale']:
                    p.keyframe_insert(data_path=path,frame=k+1,group=name_bone)
            errors={};solemins={};griperr=0
            for s in ['R','L']:
                errors['ankle.'+s]=(PB['shin.'+s].tail-PB['CTRL_foot.'+s].head).length
                errors['wrist.'+s]=(PB['forearm.'+s].tail-PB['CTRL_hand.'+s].head).length
                hd=PB['hand.'+s].matrix@rest['hand.'+s].inverted()
                wd=PB['weapon'].matrix@rest['weapon'].inverted()
                griperr=max(griperr,matrix_difference(hd,wd))
                ob=bpy.data.objects['AWB.Shoe | '+s+' layered sole']
                ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
                solemins[s]=min((ev.matrix_world@v.co).z for v in me.vertices);ev.to_mesh_clear()
            muzzle=(PB['weapon'].tail-PB['weapon'].head).normalized()
            mats=np.array([list(row) for b in PB for row in b.matrix])
            if first is None:first=mats
            per.append({'frame':k+1,'ik_error_m':errors,'sole_min_z_m':solemins,
                        'ankles':{s:list(PB['foot.'+s].head) for s in ['R','L']},
                        'ankle_x_separation_m':PB['foot.L'].head.x-PB['foot.R'].head.x,
                        'hand_weapon_matrix_difference':griperr,
                        'muzzle_direction_blender':list(muzzle),
                        'root_rotation_quaternion':list(PB['root'].rotation_quaternion)})
        for layer in action.layers:
            for strip in layer.strips:
                cb=strip.channelbag(slot)
                if cb:
                    for fc in cb.fcurves:
                        for key in fc.keyframe_points:key.interpolation='LINEAR'
        action['loop']=True;action['fps']=30;action['duration_seconds']=frames/30
        action['movement']='in place; body faces forward; feet move in '+direction
        action['reference_speed_mps']=spec['stride']/(spec['duty']*frames/30)
        track=rig.animation_data.nla_tracks.new();track.name=name;track.mute=True
        st=track.strips.new(name,1,action);st.action_slot=slot;st.blend_type='REPLACE';st.extrapolation='NOTHING'
        dx,dy=DIRECTIONS[direction];length=math.hypot(dx,dy);dx/=length;dy/=length
        speeds=[];residuals=[]
        for s,offset in [('R',0),('L',.5)]:
            points=[(((m['frame']-1)/frames+offset)%1,-dx*m['ankles'][s][0]-dy*m['ankles'][s][1])
                    for m in per[:-1] if (((m['frame']-1)/frames+offset)%1)<spec['duty']]
            xy=np.array(points);coef=np.polyfit(xy[:,0],xy[:,1],1)
            speeds.append(float(coef[0]/(frames/30)))
            residuals.append(float(np.max(np.abs(xy[:,1]-np.polyval(coef,xy[:,0])))))
        summary={'name':name,'direction_blender':[dx,dy,0],
                 'direction_glb':[dx,0,-dy],
                 'frames':[1,frames+1],'seconds':frames/30,'loop':True,
                 'stance_stride_m':spec['stride'],'stance_duty':spec['duty'],
                 'reference_speed_mps':action['reference_speed_mps'],
                 'measured_stance_speeds_mps':speeds,'stance_linear_residual_m':max(residuals),
                 'max_wrist_ik_error_m':max(max(m['ik_error_m']['wrist.'+s] for s in ['R','L']) for m in per),
                 'max_ankle_ik_error_m':max(max(m['ik_error_m']['ankle.'+s] for s in ['R','L']) for m in per),
                 'minimum_sole_z_m':min(min(m['sole_min_z_m'].values()) for m in per),
                 'minimum_ankle_x_separation_m':min(m['ankle_x_separation_m'] for m in per),
                 'max_hand_weapon_matrix_difference':max(m['hand_weapon_matrix_difference'] for m in per),
                 'loop_matrix_difference':float(np.max(np.abs(mats-first))),
                 'max_root_rotation_difference':max(max(abs(a-b) for a,b in zip(m['root_rotation_quaternion'],[1,0,0,0])) for m in per)}
        all_metrics.append(summary)
        json.dump(per,open(f'{OUT}/qa/{name}_all_frames.json','w'),indent=2)
        print('DIRECTION_ACTION',json.dumps(summary),flush=True)

report={'status':'PASS' if all(m['max_wrist_ik_error_m']<.002 and m['max_ankle_ik_error_m']<.002 and m['minimum_sole_z_m']>-.003 and m['loop_matrix_difference']<.0001 and m['max_root_rotation_difference']<.000001 and m['minimum_ankle_x_separation_m']>.080 for m in all_metrics) else 'FAIL',
        'actions':all_metrics,
        'coordinates':'Anatomical Left = Blender +X = glTF +X; Right = -X. Forward = Blender -Y = glTF +Z; Back = Blender +Y = glTF -Z.',
        'source_blend_sha256':hashlib.sha256(open(GAMEPLAY+'/AnimeWatergunBoy_Gameplay.blend','rb').read()).hexdigest(),
        'notes':'14 new true foot-IK cycles. Original 6 gameplay actions remain unchanged. No root or rig yaw used to fake direction. Wider lateral stance keeps knees/ankles ordered and avoids crossing the legs.'}
json.dump(report,open(OUT+'/qa/directional_motion_quality.json','w'),indent=2)
idle=bpy.data.actions['Idle'];rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0]
scene.frame_start=1;scene.frame_end=91;scene.frame_set(1);bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/AnimeWatergunBoy_Directional.blend')
if '--quick' in sys.argv:raise SystemExit(0)
assert report['status']=='PASS',json.dumps(report)

rig.animation_data.action=None
for b in PB:b.matrix_basis=source_bind_basis[b.name]
bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in asset.all_objects:
    if o.type=='MESH':o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=OUT+'/AnimeWatergunBoy_Directional.glb',export_format='GLB',use_selection=True,
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
def floats(doc,raw,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    size={'MAT4':16,'VEC4':4,'VEC3':3,'SCALAR':1}[a['type']]
    return np.frombuffer(raw,dtype='<f4',count=a['count']*size,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],size)
old,oldbin=read_glb(GAMEPLAY+'/AnimeWatergunBoy_Gameplay.glb');new,newbin=read_glb(OUT+'/AnimeWatergunBoy_Directional.glb')
oldnodes={n['name']:n for n in old['nodes']};newnodes={n['name']:n for n in new['nodes']}
binddiff=[];trsdiff=[]
for oldskin,newskin in zip(old['skins'],new['skins']):
    oj={old['nodes'][n]['name']:i for i,n in enumerate(oldskin['joints'])};nj={new['nodes'][n]['name']:i for i,n in enumerate(newskin['joints'])}
    om=floats(old,oldbin,oldskin['inverseBindMatrices']);nm=floats(new,newbin,newskin['inverseBindMatrices'])
    binddiff.extend(float(np.max(np.abs(om[i]-nm[nj[name]]))) for name,i in oj.items())
for name in oldnodes.keys() & newnodes.keys():
    for key,default in [('translation',[0,0,0]),('rotation',[0,0,0,1]),('scale',[1,1,1])]:
        trsdiff.append(float(np.max(np.abs(np.array(oldnodes[name].get(key,default))-np.array(newnodes[name].get(key,default))))))
binding={'max_inverse_bind_difference':max(binddiff),'max_node_trs_difference':max(trsdiff),'animation_names':[a['name'] for a in new['animations']]}
json.dump(binding,open(OUT+'/qa/bind_compatibility.json','w'),indent=2)
print('BIND_COMPATIBILITY',json.dumps(binding),flush=True)
assert binding['max_inverse_bind_difference']<.00001 and binding['max_node_trs_difference']<.00001

# Render every direction and additional lateral/back contacts; source .blend stays untouched.
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type=='OPTIX'
    scene.cycles.device='GPU'
except Exception:scene.cycles.device='CPU'
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.resolution_x=480;scene.render.resolution_y=560;scene.render.resolution_percentage=100
cd=bpy.data.cameras.new('Directional QA Camera');cd.type='ORTHO';cd.ortho_scale=2.22
cam=bpy.data.objects.new('Directional QA Camera',cd);scene.collection.objects.link(cam);scene.camera=cam
center=Vector((0,0,.90));cam.location=(3.8,-6,1.5);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
rendered=[]
for summary in all_metrics:
    name=summary['name'];a=bpy.data.actions[name];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
    for phase,tag in [(.0,'contact'),(.25,'spread')]:
        scene.frame_set(round((summary['frames'][1]-1)*phase)+1);bpy.context.view_layer.update()
        path=f'{OUT}/previews/{name}_{tag}.png';scene.render.filepath=path;bpy.ops.render.render(write_still=True)
        rendered.append({'action':name,'phase':phase,'path':path})
    print('DIRECTION_RENDER',name,flush=True)
json.dump(rendered,open(OUT+'/qa/rendered_frames.json','w'),indent=2)
rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0];scene.frame_start=1;scene.frame_end=91;scene.frame_set(1)
scene.camera=bpy.data.objects['AWB.Camera.ThreeQuarter']
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/AnimeWatergunBoy_Directional.blend')
print('DIRECTIONAL_COMPLETE',OUT,flush=True)
