"""Full-cycle source and imported-GLB sleeve/cuff and crossfade verification."""
import bpy,bmesh,json,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
from bpy_extras.object_utils import world_to_camera_view
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/first_person_20260920'
scene=bpy.data.scenes['AWB_Animated'];bpy.context.window.scene=scene
rig=bpy.data.objects['AWB_Rig'];jacket=bpy.data.objects['FP.Sleeves only - no torso']
report=json.load(open(OUT+'/qa/first_person_asset.json'))
join_ids=report['cuff_join_vertex_indices'];end_ids=report['sleeve_end_vertex_indices']
def action_pose(name,frame):
    act=actions[name];rig.animation_data.action=act;rig.animation_data.action_slot=act.slots[0]
    scene.frame_set(round(act.frame_range[0])+frame-1);bpy.context.view_layer.update()
def evaluated_points(obj):
    ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
    points=[ev.matrix_world@v.co for v in mesh.vertices]
    faces=[tuple(p.vertices) for p in mesh.polygons]
    ev.to_mesh_clear();return points,faces
def check(label):
    points,_=evaluated_points(jacket);max_distance={}
    for side in ('L','R'):
        cuff=bpy.data.objects['AWB.Clothes | '+side+' ribbed cuff']
        coords,polygons=evaluated_points(cuff);tree=BVHTree.FromPolygons(coords,polygons)
        max_distance[side]=max(tree.find_nearest(points[i])[3] for i in join_ids[side])
    visible=[]
    for width,height in [(598,470),(1280,720)]:
        scene.render.resolution_x=width;scene.render.resolution_y=height
        visible.append(sum(1 for i in end_ids if
            (lambda p:p.z>.02 and 0<=p.x<=1 and 0<=p.y<=1)(world_to_camera_view(scene,scene.camera,points[i]))))
    return {'sample':label,'max_join_distance_to_cuff_m':max_distance,'end_vertices_in_frame_4x3_16x9':visible}
def render(label,width,height):
    scene.render.resolution_x=width;scene.render.resolution_y=height
    scene.render.filepath=f'{OUT}/previews/continuity_{label}_{width}x{height}.png'
    bpy.ops.render.render(write_still=True)
actions={name:bpy.data.actions[name] for name in ('Idle','Shoot')}
bm=bmesh.new();bm.from_mesh(jacket.data)
topology={'vertices':len(bm.verts),'faces':len(bm.faces),'boundary_edges':sum(e.is_boundary for e in bm.edges),
          'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges)}
pending=set(bm.verts);parts=[]
while pending:
    v=pending.pop();queue=[v];count=1
    while queue:
        current=queue.pop()
        for edge in current.link_edges:
            other=edge.other_vert(current)
            if other in pending:pending.remove(other);queue.append(other);count+=1
    parts.append(count)
topology['connected_component_vertices']=parts;bm.free()
source_checks=[]
for name,end in [('Idle',91),('Shoot',7)]:
    for frame in range(1,end+1):
        action_pose(name,frame);source_checks.append(check(f'{name}:{frame}'))
    for frame in ([1,23,69] if name=='Idle' else [1,4]):
        action_pose(name,frame)
        for width,height in [(598,470),(1280,720)]:render(f'source_{name}_{frame}',width,height)
action_pose('Idle',1)
source_points,_=evaluated_points(jacket)
source_join={side:[source_points[i] for i in ids] for side,ids in join_ids.items()}
source_ends=[source_points[i] for i in end_ids]
for obj in list(bpy.data.objects):
    if obj==rig or obj.get('first_person_asset'):bpy.data.objects.remove(obj,do_unlink=True)
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
bpy.ops.import_scene.gltf(filepath=OUT+'/WatergunArms.glb')
rig=next(o for o in scene.objects if o.type=='ARMATURE')
jacket=bpy.data.objects['FP.Sleeves only - no torso']
actions={}
for track in rig.animation_data.nla_tracks:
    track.mute=True
    if track.strips:actions[track.name]=track.strips[0].action
action_pose('Idle',1);points,_=evaluated_points(jacket);tree=KDTree(len(points))
for i,p in enumerate(points):tree.insert(p,i)
tree.balance()
join_ids={side:[tree.find(p)[1] for p in values] for side,values in source_join.items()}
end_ids=[tree.find(p)[1] for p in source_ends]
imported_checks=[]
for name,end in [('Idle',91),('Shoot',7)]:
    for frame in range(1,end+1):
        action_pose(name,frame);imported_checks.append(check(f'{name}:{frame}'))
poses={}
for name,frames in [('Idle',[1,23,46,69,91]),('Shoot',[1,4,7])]:
    for frame in frames:
        action_pose(name,frame)
        poses[(name,frame)]={b.name:b.matrix_basis.decompose() for b in rig.pose.bones}
blend_checks=[]
for idle_frame in [1,23,46,69,91]:
    for shoot_frame in [1,4,7]:
        for weight in [0,.25,.5,.75,1]:
            rig.animation_data.action=None
            for bone in rig.pose.bones:
                al,ar,as_=poses[('Idle',idle_frame)][bone.name]
                bl,br,bs=poses[('Shoot',shoot_frame)][bone.name]
                bone.rotation_mode='QUATERNION';bone.location=al.lerp(bl,weight)
                bone.rotation_quaternion=ar.slerp(br,weight);bone.scale=as_.lerp(bs,weight)
            bpy.context.view_layer.update()
            label=f'Idle{idle_frame}_Shoot{shoot_frame}_blend{weight}'
            blend_checks.append(check(label))
            if idle_frame==23 and shoot_frame==4 and weight in (.25,.5,.75):
                for width,height in [(598,470),(1280,720)]:render('glb_'+label,width,height)
def maximum(checks):return max(max(c['max_join_distance_to_cuff_m'].values()) for c in checks)
result={'topology':topology,'source_samples':len(source_checks),'imported_samples':len(imported_checks),
        'crossfade_samples':len(blend_checks),'maximum_source_cuff_surface_distance_m':maximum(source_checks),
        'maximum_imported_cuff_surface_distance_m':maximum(imported_checks),
        'maximum_crossfade_cuff_surface_distance_m':maximum(blend_checks),
        'visible_sleeve_end_vertices':max(max(c['end_vertices_in_frame_4x3_16x9']) for c in source_checks+imported_checks+blend_checks),
        'source_checks':source_checks,'imported_checks':imported_checks,'crossfade_checks':blend_checks}
result['status']='PASS' if topology['nonmanifold_edges']==0 and len(parts)==2 and result['visible_sleeve_end_vertices']==0 and maximum(source_checks+imported_checks+blend_checks)<.012 else 'FAIL'
json.dump(result,open(OUT+'/qa/sleeve_continuity.json','w'),indent=2)
print('CONTINUITY_SUMMARY',json.dumps({k:v for k,v in result.items() if not k.endswith('_checks')}),flush=True)
