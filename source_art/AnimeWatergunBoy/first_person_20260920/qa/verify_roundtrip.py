"""Compare exported animation geometry against the editable first-person asset."""
import bpy,json
from mathutils import Vector
from mathutils.kdtree import KDTree
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/first_person_20260920'
scene=bpy.data.scenes['AWB_Animated'];bpy.context.window.scene=scene
rig=bpy.data.objects['AWB_Rig']
meshes=[o for o in scene.objects if o.type=='MESH' and o.get('first_person_asset')]
samples={}
for name,frame in [('Idle',1),('Idle',23),('Idle',46),('Idle',91),('Shoot',1),('Shoot',4),('Shoot',7)]:
    action=bpy.data.actions[name];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    scene.frame_set(frame);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
    samples[f'{name}:{frame}']={}
    for obj in meshes:
        ev=obj.evaluated_get(dg);me=ev.to_mesh()
        samples[f'{name}:{frame}'][obj.name]=[list(ev.matrix_world@me.vertices[i].co) for i in range(0,len(me.vertices),29)]
        ev.to_mesh_clear()
for obj in meshes+[rig]:bpy.data.objects.remove(obj,do_unlink=True)
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
prior_objects=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=OUT+'/WatergunArms.glb')
rig=next(o for o in scene.objects if o.type=='ARMATURE')
meshes=[o for o in scene.objects if o.type=='MESH' and o not in prior_objects
        and any(m.type=='ARMATURE' for m in o.modifiers)]
actions={}
for track in rig.animation_data.nla_tracks:
    track.mute=True
    if track.strips:actions[track.name]=track.strips[0].action
assert set(actions)=={'Idle','Shoot'},list(actions)
checks=[]
for key,sample in samples.items():
    name,frame=key.split(':');action=actions[name]
    rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    scene.frame_set(round(action.frame_range[0])+int(frame)-1)
    bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();errors=[]
    for name,positions in sample.items():
        obj=next(o for o in meshes if o.name==name or o.name.startswith(name+'.'))
        ev=obj.evaluated_get(dg);me=ev.to_mesh();tree=KDTree(len(me.vertices))
        for i,v in enumerate(me.vertices):tree.insert(ev.matrix_world@v.co,i)
        tree.balance();errors.extend(tree.find(Vector(p))[2] for p in positions);ev.to_mesh_clear()
    checks.append({'sample':key,'maximum_vertex_error_m':max(errors),'sampled_vertices':len(errors)})
maximum=max(c['maximum_vertex_error_m'] for c in checks)
report={'status':'PASS' if maximum<.00025 else 'FAIL','maximum_vertex_error_m':maximum,'mesh_objects':len(meshes),'actions':list(actions),'samples':checks}
json.dump(report,open(OUT+'/qa/glb_roundtrip.json','w'),indent=2)
assert maximum<.00025,report
for name in ('Idle','Shoot'):
    action=actions[name];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    scene.frame_set(round(action.frame_range[0]));bpy.context.view_layer.update()
    scene.render.filepath=OUT+'/previews/glb_roundtrip_'+name.lower()+'.png'
    bpy.ops.render.render(write_still=True)
print('ROUNDTRIP',json.dumps(report),flush=True)
