"""Derive a camera-attached arms/watergun asset, preserving the source rig and grips.

Blender 5.2: blender -b AnimeWatergunBoy_Gameplay.blend --python this_file.py
Source assets are read-only. Only source_art/AnimeWatergunBoy/first_person_20260920 is written.
"""
import bpy, bmesh, math, json, os, hashlib, struct, sys
from mathutils import Vector, Matrix, Quaternion, Euler
from math import sin, cos, pi, exp, sqrt
from bpy_extras.object_utils import world_to_camera_view
import numpy as np

ROOT = 'D:/a/xiang_mu/LH'
SOURCE = ROOT + '/source_art/AnimeWatergunBoy/gameplay_20260920'
OUT = ROOT + '/source_art/AnimeWatergunBoy/first_person_20260920'
os.makedirs(OUT + '/previews', exist_ok=True)
os.makedirs(OUT + '/qa', exist_ok=True)
scene = bpy.data.scenes['AWB_Animated']
bpy.context.window.scene = scene
rig = bpy.data.objects['AWB_Rig']
arm = rig.data
PB = rig.pose.bones
asset = bpy.data.collections['AWB | Rigged character']
scene.render.fps = 30
source_hash = hashlib.sha256(open(SOURCE + '/AnimeWatergunBoy_Gameplay.blend','rb').read()).hexdigest()

# Reproduce the existing source export's binding pose before removing its shoe geometry.
rest={b.name:b.matrix_local.copy() for b in arm.bones}
original_code=open(ROOT+'/source_art/AnimeWatergunBoy/rigged_20260919/scripts/20_make_actions.py',encoding='utf-8').read()
original_functions='def smooth(t)'+original_code.split('def smooth(t)',1)[1].split('rig.animation_data_create();meta=[]',1)[0]
exec(compile(original_functions,'source_bind_pose_functions','exec'),globals())
rig.animation_data.action=None
pose('Idle',0)
source_bind_basis={b.name:b.matrix_basis.copy() for b in PB}

# The retained asset contains no head, torso, lower body, or shoulder ornaments.
keep_names = {
    'AWB.Jacket continuous shoulder and sleeves',
    'AWB.Clothes | R ribbed cuff', 'AWB.Clothes | L ribbed cuff',
    'AWB.Right hand rear grip', 'AWB.Left hand foregrip support',
    'AWB.Hand | R nails', 'AWB.Hand | L nails',
    'AWB.Gun orange trigger', 'FX_WaterPulse',
}
keep_names.update(o.name for o in asset.all_objects if o.name.startswith('AWB.Watergun |'))
removed = []
for obj in list(bpy.data.objects):
    if obj == rig or (obj.type == 'MESH' and obj.name in keep_names):
        continue
    removed.append(obj.name)
    bpy.data.objects.remove(obj, do_unlink=True)

# Rebuild only the FPS sleeve surface after evaluating the unchanged ready pose.
# The previous irregular cut plus one-ring extrusion produced skinny folded faces.
# A continuous sweep below replaces that surface while keeping cuffs/hands untouched.
jacket = bpy.data.objects['AWB.Jacket continuous shoulder and sleeves']
before = len(jacket.data.vertices)
original_sleeve_materials=list(jacket.data.materials)
jacket.name = 'FP.Sleeves only - no torso'
jacket.data.name = 'FP.Sleeves weighted cut'

# The arms keep the full existing controller rig; only the two viewmodel actions survive.
for track in list(rig.animation_data.nla_tracks):
    rig.animation_data.nla_tracks.remove(track)
rig.animation_data.action = None
for action in list(bpy.data.actions):
    if action.name not in ('Idle', 'Shoot'):
        bpy.data.actions.remove(action)
for name in ('Idle', 'Shoot'):
    action = bpy.data.actions[name]
    action.use_fake_user = True
    action['loop'] = True
    track = rig.animation_data.nla_tracks.new(); track.name = name; track.mute = True
    strip = track.strips.new(name, 1, action); strip.action_slot = action.slots[0]
    strip.blend_type = 'REPLACE'; strip.extrapolation = 'NOTHING'

meshes = [o for o in asset.all_objects if o.type == 'MESH']
for o in meshes:
    o.hide_render = False; o.hide_set(False)
    o['first_person_asset'] = True
rig['first_person_asset'] = True
rig['camera_local_position_laya'] = [0, -1.60, -.20]
rig['camera_local_rotation_y_degrees_laya'] = 180

def set_action(name, frame):
    action = bpy.data.actions[name]
    rig.animation_data.action = action
    rig.animation_data.action_slot = action.slots[0]
    scene.frame_set(frame); bpy.context.view_layer.update()

set_action('Idle', 1)
scene.frame_start=1; scene.frame_end=91

# Continuous quad-ring cloth tubes: each visible sleeve ends 10 mm inside its
# existing cuff and runs down out of frame. No wrist or irregular boundary extrusion.
vertices=[];faces=[];skin_weights=[];cloth_values=[];uv_values=[]
sleeve_end_indices=[];cuff_join_indices={};sweep_info={}
RINGS=42;SIDES=40;dg=bpy.context.evaluated_depsgraph_get()
def blended_skin(weights):
    result=Matrix(((0.,0.,0.,0.),)*4)
    for name,weight in weights.items():
        transform=PB[name].matrix@rest[name].inverted()
        for row in range(4):
            for column in range(4):result[row][column]+=weight*transform[row][column]
    return result
for side in ('L','R'):
    cuff=bpy.data.objects['AWB.Clothes | '+side+' ribbed cuff']
    ev=cuff.evaluated_get(dg);me=ev.to_mesh()
    # Material zero is the original rib-knit body; omit separate decorative ribs.
    body_ids=sorted({i for polygon in cuff.data.polygons if polygon.material_index==0 for i in polygon.vertices})
    posed=np.array([(ev.matrix_world@me.vertices[i].co)[:] for i in body_ids])
    weights=[]
    for i in body_ids:
        weights.append({cuff.vertex_groups[g.group].name:g.weight for g in cuff.data.vertices[i].groups})
    ev.to_mesh_clear()
    center=posed.mean(axis=0);eigenvalues,eigenvectors=np.linalg.eigh(np.cov((posed-center).T))
    axis=Vector(eigenvectors[:,0]);fore=(PB['forearm.'+side].tail-PB['forearm.'+side].head).normalized()
    if axis.dot(fore)<0:axis=-axis
    radial_u=Vector(eigenvectors[:,2]);radial_v=axis.cross(radial_u).normalized()
    along=(posed-center)@np.array(axis)
    proximal=posed[along<along.min()+.007]-center
    radius_u=float(np.max(np.abs(proximal@np.array(radial_u))))
    radius_v=float(np.max(np.abs(proximal@np.array(radial_v))))
    end=Vector(center)+axis*(float(along.min())+.010)
    controls=[end-axis*.28+Vector((0,.22,-.25)),
              end-axis*.20+Vector((0,.075,-.11)),end-axis*.085,end]
    begin=len(vertices);cuff_join_indices[side]=[]
    for ring in range(RINGS):
        t=ring/(RINGS-1);u=1-t
        c=controls[0]*u**3+controls[1]*(3*u*u*t)+controls[2]*(3*u*t*t)+controls[3]*t**3
        tangent=((controls[1]-controls[0])*(3*u*u)+(controls[2]-controls[1])*(6*u*t)+(controls[3]-controls[2])*(3*t*t)).normalized()
        ru=(radial_u-tangent*radial_u.dot(tangent)).normalized();rv=tangent.cross(ru).normalized()
        width=1.12+.08*sin(pi*t)-.17*smooth((t-.83)/.17)
        for segment in range(SIDES):
            angle=2*pi*segment/SIDES
            wrinkle=.0013*sin(21*t+2*angle)*sin(pi*t)**2
            for at,phase,amplitude in [(.67,.3,.0022),(.81,1.6,.0026)]:
                d=t-at-.026*sin(angle*2+phase)
                wrinkle+=amplitude*(exp(-(d/.027)**2)-.4*exp(-((d-.025)/.023)**2))
            p=c+ru*((radius_u*width+wrinkle)*cos(angle))+rv*((radius_v*width+wrinkle)*sin(angle))
            nearest=int(np.argmin(np.sum((posed-np.array(p))**2,axis=1)))
            blend=smooth((t-.72)/.28)
            w={key:value*blend for key,value in weights[nearest].items()}
            w['forearm.'+side]=w.get('forearm.'+side,0)+1-blend
            total=sum(w.values());w={key:value/total for key,value in w.items() if value>1e-7}
            vertices.append(tuple(blended_skin(w).inverted()@p));skin_weights.append(w)
            cloth_values.append(1+.04*sin(angle*3+t*7)+wrinkle*13)
            uv_values.append((segment/SIDES,t))
            if ring==0:sleeve_end_indices.append(len(vertices)-1)
            if ring==RINGS-1:cuff_join_indices[side].append(len(vertices)-1)
            if ring<RINGS-1:
                a=begin+ring*SIDES+segment;b=begin+ring*SIDES+(segment+1)%SIDES
                faces.append((a,b,b+SIDES,a+SIDES))
    faces.append(tuple(begin+i for i in reversed(range(SIDES))))
    faces.append(tuple(begin+(RINGS-1)*SIDES+i for i in range(SIDES)))
    sweep_info[side]={'cuff_overlap_m':.010,'radius_u_m':radius_u,'radius_v_m':radius_v,'rings':RINGS,'sides':SIDES}
oldmesh=jacket.data
newmesh=bpy.data.meshes.new('FP.Sleeves weighted cut')
newmesh.from_pydata(vertices,[],faces);newmesh.update()
for material_slot in original_sleeve_materials:newmesh.materials.append(material_slot)
jacket.data=newmesh
if oldmesh.users==0:bpy.data.meshes.remove(oldmesh)
newmesh.name='FP.Sleeves weighted cut'
for group in list(jacket.vertex_groups):jacket.vertex_groups.remove(group)
groups={name:jacket.vertex_groups.new(name=name) for name in sorted({key for weights in skin_weights for key in weights})}
for index,weights in enumerate(skin_weights):
    for name,weight in weights.items():groups[name].add([index],weight,'REPLACE')
bm=bmesh.new();bm.from_mesh(jacket.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
bm.to_mesh(jacket.data);bm.free()
for polygon in jacket.data.polygons:polygon.use_smooth=len(polygon.vertices)==4
color=jacket.data.color_attributes.new(name='GarmentColor',type='FLOAT_COLOR',domain='CORNER')
uv=jacket.data.uv_layers.new(name='UVMap')
for index,loop in enumerate(jacket.data.loops):
    shade=cloth_values[loop.vertex_index]
    color.data[index].color=(.030*shade,.032*shade,.041*shade,1)
    uv.data[index].uv=uv_values[loop.vertex_index]
jacket.data.color_attributes.active_color=color;jacket.data.update()
sleeve_end_indices=list(sleeve_end_indices)
newverts=sleeve_end_indices

# A real perspective camera with the same eye height/FOV as the game's first-person view.
cd = bpy.data.cameras.new('FP preview camera')
cd.type='PERSP'; cd.sensor_fit='VERTICAL'; cd.sensor_height=24
cd.lens = cd.sensor_height / (2 * math.tan(math.radians(72)/2))
cd.clip_start=.02; cd.clip_end=100
camera = bpy.data.objects.new('FP preview camera', cd); scene.collection.objects.link(camera)
camera.location=(0,.20,1.60)
camera.rotation_euler=Vector((0,-1,0)).to_track_quat('-Z','Y').to_euler()
scene.camera=camera
scene.render.resolution_x=598; scene.render.resolution_y=470; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type=='OPTIX'
    scene.cycles.device='GPU'
except Exception:
    scene.cycles.device='CPU'
scene.world=bpy.data.worlds.new('FP neutral world')
scene.world.use_nodes=True
background=next((n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND'),None)
if background is None:
    background=scene.world.node_tree.nodes.new('ShaderNodeBackground')
    output=scene.world.node_tree.nodes.new('ShaderNodeOutputWorld')
    scene.world.node_tree.links.new(background.outputs[0],output.inputs[0])
background.inputs['Color'].default_value=(.64,.72,.8,1)
background.inputs['Strength'].default_value=.5

def material(name, color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bsdf=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value=(*color,1);bsdf.inputs['Roughness'].default_value=.88
    return m

floor_mat=material('FP QA ground only',(.29,.40,.32))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.02))
ground=bpy.context.object;ground.name='QA ground - not exported';ground.data.materials.append(floor_mat)
for i,(loc,energy,size) in enumerate([((-3,-3,6),480,5),((4,-1,4),320,4),((0,3,5),500,5)]):
    ld=bpy.data.lights.new('FP QA softlight '+str(i),'AREA');ld.energy=energy;ld.shape='DISK';ld.size=size
    lo=bpy.data.objects.new(ld.name,ld);scene.collection.objects.link(lo);lo.location=loc
    lo.rotation_euler=(Vector((0,-.2,1.35))-lo.location).to_track_quat('-Z','Y').to_euler()

# Validate all samples of both loops, including both hand/weapon attachment matrices.
metrics=[]; dg=bpy.context.evaluated_depsgraph_get()
for name,end in [('Idle',91),('Shoot',7)]:
    first=None; last=None; grips={}; maxgrip=0; directions=[]
    visible_end_vertices=0
    screen_min=[1.,1.];screen_max=[0.,0.]
    for frame in range(1,end+1):
        set_action(name,frame)
        pose=np.array([list(row) for b in PB for row in b.matrix])
        if first is None:first=pose
        last=pose
        for side in ('L','R'):
            relative=PB['weapon'].matrix.inverted() @ PB['hand.'+side].matrix
            if side not in grips:grips[side]=relative.copy()
            maxgrip=max(maxgrip,max(abs(relative[r][c]-grips[side][r][c]) for r in range(4) for c in range(4)))
        direction=(PB['weapon'].tail-PB['weapon'].head).normalized()
        directions.append(list(direction))
        ev=jacket.evaluated_get(dg);me=ev.to_mesh()
        for index in sleeve_end_indices:
            p=world_to_camera_view(scene,camera,ev.matrix_world@me.vertices[index].co)
            visible_end_vertices+=int(p.z>.02 and 0<=p.x<=1 and 0<=p.y<=1)
        ev.to_mesh_clear()
        if frame in (1,end//2,end):
            for obj in meshes:
                if obj.name=='FX_WaterPulse':continue
                ev=obj.evaluated_get(dg); me=ev.to_mesh()
                for v in me.vertices:
                    p=world_to_camera_view(scene,camera,ev.matrix_world@v.co)
                    if p.z>.02 and 0<=p.x<=1 and 0<=p.y<=1:
                        screen_min=[min(screen_min[0],p.x),min(screen_min[1],p.y)]
                        screen_max=[max(screen_max[0],p.x),max(screen_max[1],p.y)]
                ev.to_mesh_clear()
    metrics.append({'action':name,'seconds':(end-1)/30,'loop_pose_max_difference':float(np.max(np.abs(last-first))),
                    'max_hand_weapon_relative_matrix_difference':maxgrip,
                    'sleeve_end_vertices_inside_frustum_all_frames':visible_end_vertices,
                    'visible_screen_bounds_xy':[screen_min,screen_max],
                    'muzzle_forward_error_max_deg':max(math.degrees(math.acos(max(-1,min(1,-d[1])))) for d in directions)})

set_action('Idle',1)
if '--quick' not in sys.argv:
    scene.render.filepath=OUT+'/previews/first_person_idle.png';bpy.ops.render.render(write_still=True)
    set_action('Shoot',1)
    scene.render.filepath=OUT+'/previews/first_person_shoot.png';bpy.ops.render.render(write_still=True)
    # Pitch the camera and the complete viewmodel together around the eye position.
    set_action('Idle',1)
    eye=Vector(camera.location);pitch=Matrix.Rotation(math.radians(58),4,'X')
    delta=Matrix.Translation(eye)@pitch@Matrix.Translation(-eye)
    original_world={o.name:o.matrix_world.copy() for o in [rig]+meshes}
    rig.matrix_world=delta@original_world[rig.name]
    # Mesh objects are children of the rig and follow it automatically.
    camera.matrix_world=delta@camera.matrix_world
    bpy.context.view_layer.update()
    scene.render.filepath=OUT+'/previews/first_person_look_down.png';bpy.ops.render.render(write_still=True)
    rig.matrix_world=original_world[rig.name]
    camera.location=(0,.20,1.60)
    camera.rotation_euler=Vector((0,-1,0)).to_track_quat('-Z','Y').to_euler()
    bpy.context.view_layer.update()

# Restore the original gameplay GLB's static node transforms for export. Controls remain
# intact while sampled deform animation and inverse bind matrices stay compatible.
def read_glb(path):
    raw=open(path,'rb').read();pos=12;doc=None;binary=None
    while pos<len(raw):
        size,kind=struct.unpack_from('<II',raw,pos);chunk=raw[pos+8:pos+8+size];pos+=8+size
        if kind==0x4e4f534a:doc=json.loads(chunk)
        elif kind==0x004e4942:binary=chunk
    return doc,binary

# Match the gameplay source's static nodes and skin inverse bind matrices exactly.
rig.animation_data.action=None
for bone in PB:bone.matrix_basis=source_bind_basis[bone.name]
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for obj in meshes:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=OUT+'/WatergunArms.glb',export_format='GLB',use_selection=True,
    export_apply=False,export_animations=True,export_animation_mode='ACTIONS',export_anim_single_armature=False,
    export_merge_animation='ACTION',export_force_sampling=True,export_frame_step=1,export_frame_range=False,
    export_anim_slide_to_zero=True,export_skins=True,export_def_bones=True,export_reset_pose_bones=True,
    export_optimize_animation_size=False,export_rest_position_armature=False,export_current_frame=True,
    export_yup=True,export_materials='EXPORT',export_image_format='AUTO',export_texcoords=True,
    export_normals=True,export_vertex_color='MATERIAL',export_all_vertex_colors=True,
    export_cameras=False,export_lights=False,export_extras=True)

glb,binary=read_glb(OUT+'/WatergunArms.glb')
source_glb,source_binary=read_glb(SOURCE+'/AnimeWatergunBoy_Gameplay.glb')
def read_accessor(doc,raw,index):
    acc=doc['accessors'][index];view=doc['bufferViews'][acc['bufferView']]
    size={'MAT4':16,'VEC4':4,'VEC3':3,'SCALAR':1}[acc['type']]
    return np.frombuffer(raw,dtype='<f4',count=acc['count']*size,
                         offset=view.get('byteOffset',0)+acc.get('byteOffset',0)).reshape(acc['count'],size)
oldjoint={source_glb['nodes'][n]['name']:i for i,n in enumerate(source_glb['skins'][0]['joints'])}
newjoint={glb['nodes'][n]['name']:i for i,n in enumerate(glb['skins'][0]['joints'])}
oldbind=read_accessor(source_glb,source_binary,source_glb['skins'][0]['inverseBindMatrices'])
newbind=read_accessor(glb,binary,glb['skins'][0]['inverseBindMatrices'])
binddiff=max(float(np.max(np.abs(oldbind[oldjoint[name]]-newbind[i]))) for name,i in newjoint.items())
oldnodes={n['name']:n for n in source_glb['nodes']};newnodes={n['name']:n for n in glb['nodes']}
trsdiff=max(float(np.max(np.abs(np.array(oldnodes[name].get(key,default))-np.array(newnodes[name].get(key,default)))))
            for name in oldnodes.keys()&newnodes.keys()
            for key,default in [('translation',[0,0,0]),('rotation',[0,0,0,1]),('scale',[1,1,1])])
json.dump({'max_inverse_bind_difference':binddiff,'max_static_node_trs_difference':trsdiff},
          open(OUT+'/qa/bind_compatibility.json','w'),indent=2)
# Omit any exporter-created empty scene; Laya's glTF importer assumes nodes exists.
glb['scenes']=[glb['scenes'][glb.get('scene',0)]];glb['scene']=0
jb=json.dumps(glb,separators=(',',':')).encode('utf-8');jb+=b' '*((-len(jb))%4)
binary+=b'\0'*((-len(binary))%4)
with open(OUT+'/WatergunArms.glb','wb') as stream:
    stream.write(struct.pack('<III',0x46546c67,2,12+8+len(jb)+8+len(binary)))
    stream.write(struct.pack('<II',len(jb),0x4e4f534a));stream.write(jb)
    stream.write(struct.pack('<II',len(binary),0x004e4942));stream.write(binary)
report={'source_sha256':source_hash,'mesh_objects':len(meshes),'retained_meshes':[o.name for o in meshes],
        'deleted_objects':removed,'sleeves_source_vertices':before,'sleeves_final_vertices':len(jacket.data.vertices),
        'sleeve_surface':'Two continuous quad-ring sweeps with shallow cloth folds, matching the unchanged cuffs',
        'sleeve_sweep':sweep_info,'bones':len(arm.bones),
        'sleeve_end_vertex_indices':sleeve_end_indices,'cuff_join_vertex_indices':cuff_join_indices,
        'sleeve_end_treatment':'Closed off-screen ends, proximal sleeve ends overlapping 10 mm inside original cuffs',
        'exported_joints':len(glb['skins'][0]['joints']),'exported_animation_names':[a['name'] for a in glb['animations']],
        'camera':{'blender_eye':[0,.20,1.60],'blender_direction':[0,-1,0],'vertical_fov_degrees':72,'resolution':[598,470],
                  'laya_camera_local_position':[0,-1.60,-.20],'laya_camera_local_rotation_y_degrees':180},
        'animations':metrics,'bind_inverse_matrix_difference':binddiff,'static_node_trs_difference':trsdiff,
        'status':'PASS' if binddiff<1e-5 and trsdiff<1e-5 and all(m['loop_pose_max_difference']<1e-4 and m['max_hand_weapon_relative_matrix_difference']<.002 and m['sleeve_end_vertices_inside_frustum_all_frames']==0 for m in metrics) else 'FAIL'}
json.dump(report,open(OUT+'/qa/first_person_asset.json','w'),indent=2)
set_action('Idle',1);bpy.ops.wm.save_as_mainfile(filepath=OUT+'/WatergunArms.blend')
assert hashlib.sha256(open(SOURCE+'/AnimeWatergunBoy_Gameplay.blend','rb').read()).hexdigest()==source_hash
print('FIRST_PERSON_ASSET',json.dumps(report),flush=True)
