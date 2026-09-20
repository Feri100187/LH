"""Shorten the visible neck by moving the complete head and blending the neck, preserving bind data."""
import bpy,os,json,math,sys,struct,hashlib,ast
import numpy as np
from mathutils import Vector,Matrix,Quaternion,Euler
from mathutils.bvhtree import BVHTree
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
SOURCE=ROOT+'/source_art/AnimeWatergunBoy/neck_refine_20260920'
OUT=ROOT+'/source_art/AnimeWatergunBoy/neck_short_20260920'
for d in ['', '/qa','/previews']:os.makedirs(OUT+d,exist_ok=True)
scene=bpy.data.scenes['AWB_Animated'];bpy.context.window.scene=scene
rig=bpy.data.objects['AWB_Rig'];arm=rig.data;PB=rig.pose.bones
asset=bpy.data.collections['AWB | Rigged character'];neck=bpy.data.objects['AWB.Neck']
original_hashes={ext:hashlib.sha256(open(SOURCE+'/AnimeWatergunBoy_NeckRefined.'+ext,'rb').read()).hexdigest() for ext in ['blend','glb']}
# Use the same checked cameras, pose selection, and data comparison helpers, without running that script.
tree=ast.parse(open(ROOT+'/tools/refine-character-neck.py',encoding='utf-8').read())
for node in tree.body:
    if isinstance(node,ast.FunctionDef) and node.name in ['set_action','setup_render','render_view','glb','accessor']:
        exec(compile(ast.Module(body=[node],type_ignores=[]),'shared_neck_qa_helpers','exec'),globals())
SIZES={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
DT={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
VIEWS={'front':(0,-3,1.645),'side':(3,0,1.645),'back':(0,3,1.645),'threequarter':(2.4,-3.7,1.645)}
cam=setup_render()
DROP=.024

head_objects=[]
for ob in asset.all_objects:
    if ob.type!='MESH' or len(ob.data.vertices)==0:continue
    h=ob.vertex_groups.get('head')
    if h and all(sum(g.weight for g in v.groups if g.group==h.index)>.99999 for v in ob.data.vertices):
        head_objects.append(ob)
assert len(head_objects)==13,[ob.name for ob in head_objects]
assert bpy.data.objects['AWB.Head sculpted face and skull'] in head_objects
changed_objects=head_objects+[neck]
original_positions={ob.name:np.array([tuple(v.co) for v in ob.data.vertices],dtype=np.float64) for ob in changed_objects}
old_weights={ob.name:[[(g.group,g.weight) for g in v.groups] for v in ob.data.vertices] for ob in changed_objects}
inspection={ob.name:{'vertex_count':len(ob.data.vertices),'bounds_min':original_positions[ob.name].min(axis=0).tolist(),
                       'bounds_max':original_positions[ob.name].max(axis=0).tolist()} for ob in changed_objects}
json.dump(inspection,open(OUT+'/qa/source_geometry_inspection.json','w'),indent=2)
print('HEAD_ASSEMBLY_INSPECT',json.dumps(inspection),flush=True)
for view in VIEWS:render_view('before',view)
if '--inspect' in sys.argv:raise SystemExit(0)

for ob in head_objects:
    for v in ob.data.vertices:v.co.z-=DROP
    ob.data.update()
z0=1.4754;z1=1.5800
for v in neck.data.vertices:
    t=max(0,min(1,(v.co.z-z0)/(z1-z0)));weight=t*t*(3-2*t)
    v.co.z-=DROP*weight
neck.data.update()
for ob in changed_objects:
    assert old_weights[ob.name]==[[(g.group,g.weight) for g in v.groups] for v in ob.data.vertices]

shape={'head_assembly_down_m':DROP,'neck_base_fixed_below_z_m':z0,'neck_full_drop_above_z_m':z1,
       'head_mesh_names':[ob.name for ob in head_objects],
       'head_mesh_count':len(head_objects),'neck_xy_unchanged':True,'weights_unchanged':True,
       'rig_rest_and_actions_unchanged':True,'note':'Full head, face, hair and glasses shift together in rest geometry. Neck Z blends smoothly from a fixed hidden root to the same 24mm translation. The shared head-weighted top stays attached during head rotation.'}
shape['mesh_changes']=[]
for ob in changed_objects:
    now=np.array([tuple(v.co) for v in ob.data.vertices]);delta=now-original_positions[ob.name]
    shape['mesh_changes'].append({'name':ob.name,'vertices':len(now),'max_abs_axis_displacement_m':np.abs(delta).max(axis=0).tolist(),
                                  'bounds_before_min':original_positions[ob.name].min(axis=0).tolist(),'bounds_after_min':now.min(axis=0).tolist(),
                                  'bounds_before_max':original_positions[ob.name].max(axis=0).tolist(),'bounds_after_max':now.max(axis=0).tolist()})
json.dump(shape,open(OUT+'/qa/neck_shortening_geometry.json','w'),indent=2)
# Check the hidden top connection in every frame of all 20 actions. The head is rigidly
# weighted to one bone, so its inverse pose maps the deformed neck into this fixed head BVH.
rest={b.name:b.matrix_local.copy() for b in arm.bones}
head=bpy.data.objects['AWB.Head sculpted face and skull']
head_tree=BVHTree.FromPolygons([v.co.copy() for v in head.data.vertices],[tuple(p.vertices) for p in head.data.polygons],all_triangles=False)
top_z=original_positions[neck.name][:,2].max()
top_indices=np.flatnonzero(np.abs(original_positions[neck.name][:,2]-top_z)<1e-6).tolist()
base_indices=np.flatnonzero(original_positions[neck.name][:,2]<=z0).tolist()
assert all(np.array_equal(np.array(neck.data.vertices[i].co),original_positions[neck.name][i]) for i in base_indices)
attachment=[]
for act in sorted(bpy.data.actions,key=lambda a:a.name):
    if act.name not in ['Idle','Walk','Run','Jump','Shoot','RunJump'] and not act.name.startswith(('Walk','Run')):continue
    end=int(round(act.frame_range[1]));maximum_outside=-1e9;minimum_drop=1e9;maximum_drop=-1e9
    for frame in range(1,end+1):
        set_action(act.name,frame)
        head_delta=rig.matrix_world@PB['head'].matrix@rest['head'].inverted();inv_head=head_delta.inverted()
        ev=neck.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
        for index in top_indices:
            point=inv_head@(ev.matrix_world@me.vertices[index].co)
            hit,normal,_,distance=head_tree.find_nearest(point)
            signed=(point-hit).dot(normal);maximum_outside=max(maximum_outside,signed)
        ev.to_mesh_clear()
        dz=-(head_delta.to_3x3()@Vector((0,0,-DROP))).z
        minimum_drop=min(minimum_drop,dz);maximum_drop=max(maximum_drop,dz)
    attachment.append({'action':act.name,'frames_checked':end,'neck_top_vertices_checked_per_frame':len(top_indices),
                       'maximum_top_signed_distance_to_head_m':maximum_outside,
                       'minimum_world_vertical_head_drop_m':minimum_drop,'maximum_world_vertical_head_drop_m':maximum_drop})
assert len(attachment)==20
assert all(row['maximum_top_signed_distance_to_head_m']<0 for row in attachment),attachment
attachment_report={'status':'PASS','actions':attachment,'fixed_neck_root_vertices':len(base_indices),
                   'notes':'Negative signed distance means every tested top-ring neck vertex remains inside the head. Hidden neck root is byte-identical to source geometry. No skeleton shift is needed.'}
json.dump(attachment_report,open(OUT+'/qa/all_actions_head_neck_attachment.json','w'),indent=2)
print('ALL_ACTION_ATTACHMENT',json.dumps({'actions':len(attachment),'frames':sum(a['frames_checked'] for a in attachment),
      'least_overlap_m':-max(a['maximum_top_signed_distance_to_head_m'] for a in attachment)}),flush=True)
for view in VIEWS:render_view('after',view)
pose_specs=[('Idle',31),('Idle',61),('Walk',1),('Walk',7),('Walk',18),('Run',1),('Run',6),('Run',15),
            ('Jump',9),('Jump',22),('Jump',34),('Shoot',1),('Shoot',4),('RunJump',23),('WalkLeft',7),('RunBackRight',8)]
pose_stats=[]
for name,frame in pose_specs:
    set_action(name,frame)
    ev=neck.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
    positions=np.array([tuple(ev.matrix_world@v.co) for v in me.vertices]);ev.to_mesh_clear()
    assert np.isfinite(positions).all()
    pose_stats.append({'action':name,'frame':frame,'neck_bounds_min':positions.min(axis=0).tolist(),'neck_bounds_max':positions.max(axis=0).tolist()})
    render_view('after','threequarter',name,frame)
    if (name,frame) in [('Walk',7),('Run',6),('Jump',9),('Jump',22),('Shoot',1)]:render_view('after','back',name,frame)
json.dump(pose_stats,open(OUT+'/qa/posed_neck_samples.json','w'),indent=2)

rest={b.name:b.matrix_local.copy() for b in arm.bones}
original_code=open(ROOT+'/source_art/AnimeWatergunBoy/rigged_20260919/scripts/20_make_actions.py',encoding='utf-8').read()
helpers='def smooth(t)'+original_code.split('def smooth(t)',1)[1].split('rig.animation_data_create();meta=[]',1)[0]
exec(compile(helpers,'original_bind_pose','exec'),globals())
set_action('Idle',1);pose('Idle',0)
basis={b.name:b.matrix_basis.copy() for b in PB};rig.animation_data.action=None
for b in PB:b.matrix_basis=basis[b.name]
bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for ob in asset.all_objects:
    if ob.type=='MESH':ob.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=OUT+'/AnimeWatergunBoy_NeckShort.glb',export_format='GLB',use_selection=True,
    export_apply=False,export_animations=True,export_animation_mode='ACTIONS',export_anim_single_armature=False,
    export_merge_animation='ACTION',export_force_sampling=True,export_frame_step=1,export_frame_range=False,
    export_anim_slide_to_zero=True,export_skins=True,export_def_bones=True,export_reset_pose_bones=True,
    export_optimize_animation_size=False,export_rest_position_armature=False,export_current_frame=True,
    export_yup=True,export_materials='EXPORT',export_image_format='AUTO',export_texcoords=True,
    export_normals=True,export_vertex_color='MATERIAL',export_all_vertex_colors=True,
    export_cameras=False,export_lights=False,export_extras=True)

old,oldbin=glb(SOURCE+'/AnimeWatergunBoy_NeckRefined.glb');new,newbin=glb(OUT+'/AnimeWatergunBoy_NeckShort.glb')
assert [m['name'] for m in old['meshes']]==[m['name'] for m in new['meshes']]
changed=[];comparison=[]
for i,(om,nm) in enumerate(zip(old['meshes'],new['meshes'])):
    diffs=[];assert len(om['primitives'])==len(nm['primitives'])
    for primitive,(op,np_) in enumerate(zip(om['primitives'],nm['primitives'])):
        assert op.get('material')==np_.get('material') and op.get('mode')==np_.get('mode')
        assert op['attributes'].keys()==np_['attributes'].keys()
        refs=[('indices',op['indices'],np_['indices'])]+[(key,value,np_['attributes'][key]) for key,value in op['attributes'].items()]
        for semantic,oi,ni in refs:
            a=accessor(old,oldbin,oi);b=accessor(new,newbin,ni)
            if a.shape!=b.shape or a.dtype!=b.dtype or a.tobytes()!=b.tobytes():
                diffs.append({'primitive':primitive,'semantic':semantic,'old_shape':list(a.shape),'new_shape':list(b.shape),
                              'maximum_difference':float(np.max(np.abs(a.astype(np.float64)-b.astype(np.float64)))) if a.shape==b.shape else None})
    if diffs:changed.append(i)
    comparison.append({'index':i,'name':om['name'],'byte_identical':not diffs,'differences':diffs})
expected=sorted(n['mesh'] for n in old['nodes'] if n.get('name') in [ob.name for ob in changed_objects])
assert changed==expected,(changed,expected)
assert all(d['semantic'] in ['POSITION','NORMAL','TANGENT'] for m in comparison for d in m['differences'])
assert old['materials']==new['materials'];assert old['nodes']==new['nodes']
for oskin,nskin in zip(old['skins'],new['skins']):
    assert oskin['joints']==nskin['joints']
    assert accessor(old,oldbin,oskin['inverseBindMatrices']).tobytes()==accessor(new,newbin,nskin['inverseBindMatrices']).tobytes()
assert [a['name'] for a in old['animations']]==[a['name'] for a in new['animations']]
animations=[]
for oa,na in zip(old['animations'],new['animations']):
    assert oa['channels']==na['channels']
    for osamp,nsamp in zip(oa['samplers'],na['samplers']):
        assert osamp.get('interpolation')==nsamp.get('interpolation')
        for key in ['input','output']:
            assert accessor(old,oldbin,osamp[key]).tobytes()==accessor(new,newbin,nsamp[key]).tobytes(),(oa['name'],key)
    animations.append({'name':oa['name'],'all_samples_byte_identical':True})
compatibility={'status':'PASS','changed_mesh_indices':changed,'changed_mesh_count':len(changed),'mesh_comparison':comparison,
               'other_meshes_byte_identical':44-len(changed),'materials_identical':True,'nodes_and_default_trs_identical':True,
               'skin_joint_order_and_inverse_bind_bytes_identical':True,'animations':animations,
               'import_instruction':'Replace the 14 listed mesh resources. No skeleton, prefab transform, material, or animation replacement is needed. Neck-only replacement is incorrect because the complete head assembly moved down.'}
json.dump(compatibility,open(OUT+'/qa/glb_shortened_head_preservation.json','w'),indent=2)
for ext in ['blend','glb']:
    assert hashlib.sha256(open(SOURCE+'/AnimeWatergunBoy_NeckRefined.'+ext,'rb').read()).hexdigest()==original_hashes[ext]
json.dump(original_hashes,open(OUT+'/qa/source_preservation_sha256.json','w'),indent=2)
set_action('Idle',1);scene.frame_start=1;scene.frame_end=91;scene.camera=bpy.data.objects['AWB.Camera.ThreeQuarter']
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/AnimeWatergunBoy_NeckShort.blend')
print('NECK_SHORTEN_COMPLETE',json.dumps({'output':OUT,'drop_m':DROP,'changed_mesh_indices':changed,'status':compatibility['status']}),flush=True)
