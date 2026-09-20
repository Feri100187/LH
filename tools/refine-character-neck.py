"""A small, neck-only shape refinement. Source rig, head, clothes and actions are untouched."""
import bpy,os,json,sys,math,hashlib,struct
import numpy as np
from mathutils import Vector,Matrix,Quaternion,Euler
from math import sin,cos,pi,exp,sqrt

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
SOURCE=ROOT+'/source_art/AnimeWatergunBoy/directional_20260920'
OUT=ROOT+'/source_art/AnimeWatergunBoy/neck_refine_20260920'
for d in ['', '/qa','/previews']:os.makedirs(OUT+d,exist_ok=True)
scene=bpy.data.scenes['AWB_Animated'];bpy.context.window.scene=scene
rig=bpy.data.objects['AWB_Rig'];arm=rig.data;PB=rig.pose.bones
asset=bpy.data.collections['AWB | Rigged character']
neck=bpy.data.objects['AWB.Neck'];mesh=neck.data
original=np.array([tuple(v.co) for v in mesh.vertices],dtype=np.float64)
source_hashes={ext:hashlib.sha256(open(SOURCE+'/AnimeWatergunBoy_Directional.'+ext,'rb').read()).hexdigest() for ext in ['blend','glb']}
weights_before=[[(g.group,g.weight) for g in v.groups] for v in mesh.vertices]
topology_before={'loops':[v.vertex_index for v in mesh.loops],
                 'polygons':[(p.loop_start,p.loop_total,p.material_index,p.use_smooth) for p in mesh.polygons]}
rings={}
for i,p in enumerate(original):rings.setdefault(round(float(p[2]),6),[]).append(i)
ring_info=[]
for z,indices in sorted(rings.items()):
    pts=original[indices]
    ring_info.append({'z':z,'vertices':len(indices),'center':pts.mean(axis=0).tolist(),
                      'width_m':float(np.ptp(pts[:,0])),'depth_m':float(np.ptp(pts[:,1]))})
inspect={'object':neck.name,'mesh_data':mesh.name,'vertex_count':len(mesh.vertices),'polygon_count':len(mesh.polygons),
         'bounds_min':original.min(axis=0).tolist(),'bounds_max':original.max(axis=0).tolist(),
         'object_matrix':list(neck.matrix_world),'has_custom_normals':mesh.has_custom_normals,'rings':ring_info}
# Matrix rows need conversion for JSON.
inspect['object_matrix']=[list(r) for r in neck.matrix_world]
json.dump(inspect,open(OUT+'/qa/neck_before_geometry.json','w'),indent=2)
print('NECK_INSPECT',json.dumps({k:v for k,v in inspect.items() if k!='rings'}),flush=True)

def set_action(name,frame):
    a=bpy.data.actions[name];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
    scene.frame_set(frame);bpy.context.view_layer.update()

def setup_render():
    scene.sequence_editor_clear();scene.render.engine='CYCLES'
    scene.cycles.samples=20;scene.cycles.use_denoising=True
    try:
        prefs=bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type='OPTIX';prefs.get_devices()
        for d in prefs.devices:d.use=d.type=='OPTIX'
        scene.cycles.device='GPU'
    except Exception:scene.cycles.device='CPU'
    scene.render.resolution_x=640;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG'
    cd=bpy.data.cameras.new('Neck QA close-up camera');cd.type='ORTHO';cd.ortho_scale=.68
    cam=bpy.data.objects.new('Neck QA close-up camera',cd);scene.collection.objects.link(cam);scene.camera=cam
    return cam

cam=setup_render()
VIEWS={'front':(0,-3,1.645),'side':(3,0,1.645),'back':(0,3,1.645),'threequarter':(2.4,-3.7,1.645)}
def render_view(stage,view,action='Idle',frame=1):
    set_action(action,frame)
    # Track the shoulder for moving/crouched poses; keep before/after frames identical.
    head=PB['head'].head;target=Vector((head.x,head.y,head.z-.005))
    offset=Vector(VIEWS[view])-Vector((0,0,1.545))
    cam.location=target+offset;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=f'{OUT}/previews/{stage}_{action}_{frame:03d}_{view}.png'
    bpy.ops.render.render(write_still=True)
    print('NECK_RENDER',stage,action,frame,view,flush=True)

for view in VIEWS:render_view('before',view)
if '--inspect' in sys.argv:raise SystemExit(0)

def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def keyed(z,points):
    if z<=points[0][0]:return points[0][1]
    for (a,x),(b,y) in zip(points,points[1:]):
        if z<=b:return x+(y-x)*smooth((z-a)/(b-a))
    return points[-1][1]

# Visible waist of the neck broadens by 16%; root 18%; transition inside the head tapers out.
# The hidden lowermost connection stays at 12%, preserving room inside the original collar.
width_keys=[(1.4404,1.12),(1.477,1.18),(1.535,1.16),(1.576,1.10),(1.601,1.025),(1.6154,1.00)]
depth_keys=[(1.4404,1.08),(1.477,1.11),(1.535,1.10),(1.576,1.065),(1.601,1.016),(1.6154,1.00)]
after=original.copy();sections=[]
for row in ring_info:
    indices=rings[row['z']];pts=original[indices]
    cx=float(pts[:,0].mean());cy=float(pts[:,1].mean())
    fx=keyed(row['z'],width_keys);fy=keyed(row['z'],depth_keys)
    after[indices,0]=cx+(pts[:,0]-cx)*fx
    after[indices,1]=cy+(pts[:,1]-cy)*fy
    sections.append({'z':row['z'],'width_scale':fx,'depth_scale':fy,
                     'before_width_m':row['width_m'],'after_width_m':float(np.ptp(after[indices,0])),
                     'before_depth_m':row['depth_m'],'after_depth_m':float(np.ptp(after[indices,1]))})
for vertex,co in zip(mesh.vertices,after):vertex.co=co
mesh.update()
if mesh.has_custom_normals:mesh.normals_split_custom_set([(0,0,0)]*len(mesh.loops))
assert weights_before==[[(g.group,g.weight) for g in v.groups] for v in mesh.vertices]
assert topology_before=={'loops':[v.vertex_index for v in mesh.loops],
                         'polygons':[(p.loop_start,p.loop_total,p.material_index,p.use_smooth) for p in mesh.polygons]}
delta=after-original
shape={'mesh':'AWB.Neck','mesh_data':mesh.name,'max_vertex_displacement_m':float(np.linalg.norm(delta,axis=1).max()),
       'max_abs_axis_displacement_m':np.abs(delta).max(axis=0).tolist(),
       'changed_vertices':int(np.sum(np.linalg.norm(delta,axis=1)>1e-9)),
       'vertex_count':len(mesh.vertices),'z_coordinates_unchanged':bool(np.all(delta[:,2]==0)),
       'weights_unchanged':True,'topology_unchanged':True,'sections':sections,
       'notes':'Only neck XY ring radii changed. Height, centerline, head, collar, clothes and skin weights untouched. Visible neck width +16–18%, depth +10–11%, tapering to zero change inside skull.'}
json.dump(shape,open(OUT+'/qa/neck_shape_change.json','w'),indent=2)
for view in VIEWS:render_view('after',view)
sample_specs=[('Idle',31),('Idle',61),('Walk',1),('Walk',7),('Walk',18),
              ('Run',1),('Run',6),('Run',15),('Shoot',1),('Shoot',4),
              ('Jump',9),('Jump',22),('Jump',34),('RunJump',23),
              ('WalkLeft',7),('RunBackRight',8)]
pose_stats=[]
for name,frame in sample_specs:
    set_action(name,frame)
    ev=neck.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
    positions=np.array([tuple(ev.matrix_world@v.co) for v in me.vertices]);ev.to_mesh_clear()
    assert np.isfinite(positions).all()
    pose_stats.append({'action':name,'frame':frame,'neck_bounds_min':positions.min(axis=0).tolist(),
                       'neck_bounds_max':positions.max(axis=0).tolist()})
    # Cross-view samples include jaw attachment, forward collar edge and rear collar overlap.
    render_view('after','threequarter',name,frame)
    if (name,frame) in [('Walk',7),('Run',6),('Shoot',1),('Jump',9),('Jump',22)]:
        render_view('after','back',name,frame)
json.dump(pose_stats,open(OUT+'/qa/posed_neck_samples.json','w'),indent=2)

# Restore the exact original GLB static binding pose from the original rig's authoring helpers.
rest={b.name:b.matrix_local.copy() for b in arm.bones}
original_code=open(ROOT+'/source_art/AnimeWatergunBoy/rigged_20260919/scripts/20_make_actions.py',encoding='utf-8').read()
helpers='def smooth(t)'+original_code.split('def smooth(t)',1)[1].split('rig.animation_data_create();meta=[]',1)[0]
exec(compile(helpers,'original_bind_pose','exec'),globals())
set_action('Idle',1);pose('Idle',0)
basis={b.name:b.matrix_basis.copy() for b in PB};rig.animation_data.action=None
for b in PB:b.matrix_basis=basis[b.name]
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for ob in asset.all_objects:
    if ob.type=='MESH':ob.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=OUT+'/AnimeWatergunBoy_NeckRefined.glb',export_format='GLB',use_selection=True,
    export_apply=False,export_animations=True,export_animation_mode='ACTIONS',export_anim_single_armature=False,
    export_merge_animation='ACTION',export_force_sampling=True,export_frame_step=1,export_frame_range=False,
    export_anim_slide_to_zero=True,export_skins=True,export_def_bones=True,export_reset_pose_bones=True,
    export_optimize_animation_size=False,export_rest_position_armature=False,export_current_frame=True,
    export_yup=True,export_materials='EXPORT',export_image_format='AUTO',export_texcoords=True,
    export_normals=True,export_vertex_color='MATERIAL',export_all_vertex_colors=True,
    export_cameras=False,export_lights=False,export_extras=True)

def glb(path):
    raw=open(path,'rb').read();offset=12;doc=None;binary=None
    while offset<len(raw):
        length,kind=struct.unpack_from('<II',raw,offset);chunk=raw[offset+8:offset+8+length];offset+=8+length
        if kind==0x4e4f534a:doc=json.loads(chunk)
        elif kind==0x004e4942:binary=chunk
    return doc,binary
SIZES={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
DT={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
def accessor(doc,binary,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    components=SIZES[a['type']];dtype=np.dtype(DT[a['componentType']]);start=v.get('byteOffset',0)+a.get('byteOffset',0)
    stride=v.get('byteStride',components*dtype.itemsize)
    return np.ndarray((a['count'],components),dtype=dtype,buffer=binary,offset=start,strides=(stride,dtype.itemsize)).copy()
old,oldbin=glb(SOURCE+'/AnimeWatergunBoy_Directional.glb')
new,newbin=glb(OUT+'/AnimeWatergunBoy_NeckRefined.glb')
assert len(old['meshes'])==len(new['meshes'])==44
assert [m['name'] for m in old['meshes']]==[m['name'] for m in new['meshes']]
changed=[];comparisons=[]
for index,(om,nm) in enumerate(zip(old['meshes'],new['meshes'])):
    diffs=[];assert len(om['primitives'])==len(nm['primitives'])
    for primitive,(op,np_) in enumerate(zip(om['primitives'],nm['primitives'])):
        assert op.get('material')==np_.get('material') and op.get('mode')==np_.get('mode')
        assert op['attributes'].keys()==np_['attributes'].keys()
        refs=[('indices',op['indices'],np_['indices'])]
        refs.extend((key,value,np_['attributes'][key]) for key,value in op['attributes'].items())
        for semantic,oa,na in refs:
            a=accessor(old,oldbin,oa);b=accessor(new,newbin,na)
            equal=a.shape==b.shape and a.dtype==b.dtype and a.tobytes()==b.tobytes()
            if not equal:
                diffs.append({'primitive':primitive,'semantic':semantic,
                              'old_shape':list(a.shape),'new_shape':list(b.shape),
                              'maximum_difference':float(np.max(np.abs(a.astype(np.float64)-b.astype(np.float64)))) if a.shape==b.shape else None})
    if diffs:changed.append(index)
    comparisons.append({'index':index,'name':om['name'],'all_attributes_byte_identical':not diffs,'differences':diffs})
assert changed==[26],changed
assert all(d['semantic'] in ['POSITION','NORMAL','TANGENT'] for d in comparisons[26]['differences'])
assert old['materials']==new['materials']
assert old['nodes']==new['nodes']
assert len(old['skins'])==len(new['skins'])
for oskin,nskin in zip(old['skins'],new['skins']):
    assert oskin['joints']==nskin['joints']
    assert accessor(old,oldbin,oskin['inverseBindMatrices']).tobytes()==accessor(new,newbin,nskin['inverseBindMatrices']).tobytes()
animations=[]
assert [a['name'] for a in old['animations']]==[a['name'] for a in new['animations']]
for oa,na in zip(old['animations'],new['animations']):
    assert oa['channels']==na['channels']
    assert len(oa['samplers'])==len(na['samplers'])
    for osamp,nsamp in zip(oa['samplers'],na['samplers']):
        assert osamp.get('interpolation')==nsamp.get('interpolation')
        for key in ['input','output']:
            assert accessor(old,oldbin,osamp[key]).tobytes()==accessor(new,newbin,nsamp[key]).tobytes(),(oa['name'],key)
    animations.append({'name':oa['name'],'channels':len(oa['channels']),'all_samples_byte_identical':True})
compatibility={'status':'PASS','neck_mesh_index':26,'neck_node_name':'AWB.Neck','neck_mesh_name':new['meshes'][26]['name'],
               'changed_mesh_indices':changed,'other_meshes_byte_identical':43,'mesh_comparison':comparisons,
               'materials_byte_equivalent':True,'nodes_and_default_trs_identical':True,
               'skin_joint_order_and_inverse_bind_bytes_identical':True,'animations':animations}
json.dump(compatibility,open(OUT+'/qa/glb_neck_only_preservation.json','w'),indent=2)
for ext in ['blend','glb']:
    assert hashlib.sha256(open(SOURCE+'/AnimeWatergunBoy_Directional.'+ext,'rb').read()).hexdigest()==source_hashes[ext]
json.dump(source_hashes,open(OUT+'/qa/source_preservation_sha256.json','w'),indent=2)
set_action('Idle',1);scene.frame_start=1;scene.frame_end=91;scene.camera=bpy.data.objects['AWB.Camera.ThreeQuarter']
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/AnimeWatergunBoy_NeckRefined.blend')
print('NECK_REFINEMENT_COMPLETE',json.dumps({'output':OUT,'neck_mesh_index':26,'max_displacement_m':shape['max_vertex_displacement_m'],'preservation':compatibility['status']}),flush=True)
