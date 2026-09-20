import bpy,json,os
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919'
source=bpy.data.scenes['AWB_Animated'];scene=bpy.data.scenes.new('GLB Animation Reimport Check');bpy.context.window.scene=scene;scene.render.fps=30
bpy.ops.import_scene.gltf(filepath=OUT+'/AnimeWatergunBoy_Rigged.glb')
rig=next(o for o in scene.objects if o.type=='ARMATURE');meshes=[o for o in scene.objects if o.type=='MESH']
actions={}
for tr in rig.animation_data.nla_tracks:
 tr.mute=True
 if tr.strips:actions[tr.name]=tr.strips[0].action
print('IMPORTED_ACTION_MAP',[(k,a.name,list(a.frame_range)) for k,a in actions.items()],flush=True)
def findmesh(name):return next(o for o in meshes if o.name==name or o.name.startswith(name+'.'))
deps=bpy.context.evaluated_depsgraph_get();water=findmesh('FX_WaterPulse');ev=water.evaluated_get(deps);me=ev.to_mesh();coords=[ev.matrix_world@v.co for v in me.vertices];default_water=max(max(p[i] for p in coords)-min(p[i] for p in coords) for i in range(3));ev.to_mesh_clear()
assert default_water<.002
samples=json.load(open(OUT+'/qa/source_animation_samples.json'));checks=[]
for key,data in samples.items():
 action,frame=key.split(':');act=actions[action];rig.animation_data.action=act;rig.animation_data.action_slot=act.slots[0]
 sample_frame=round(act.frame_range[0])+int(frame)-1;scene.frame_set(sample_frame);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
 errs=[]
 for name,sample in data.items():
  ob=findmesh(name);ev=ob.evaluated_get(deps);me=ev.to_mesh();kd=KDTree(len(me.vertices))
  for i,v in enumerate(me.vertices):kd.insert(ev.matrix_world@v.co,i)
  kd.balance()
  dd=[kd.find(Vector(p))[2] for p in sample['positions']];errs+=dd;ev.to_mesh_clear()
 checks.append({'sample':key,'import_frame':sample_frame,'max_vertex_distance_m':max(errs),'mean_vertex_distance_m':float(np.mean(errs))})
assert max(c['max_vertex_distance_m'] for c in checks)<.00025

scene.collection.children.link(bpy.data.collections['AWB | Preview studio']);scene.world=source.world
try:scene.render.engine='CYCLES'
except TypeError:pass
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=800;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform=source.view_settings.view_transform;scene.view_settings.look=source.view_settings.look;scene.view_settings.exposure=source.view_settings.exposure
cd=bpy.data.cameras.new('GLB Check camera');cd.type='ORTHO';cd.ortho_scale=2.65;cam=bpy.data.objects.new('GLB Check camera',cd);scene.collection.objects.link(cam);scene.camera=cam
for action,frame in [('Idle',1),('Walk',9),('Run',7),('Jump',22),('Shoot',30),('RunJump',23)]:
 act=actions[action];rig.animation_data.action=act;rig.animation_data.action_slot=act.slots[0];scene.frame_set(round(act.frame_range[0])+frame-1);bpy.context.view_layer.update()
 root=rig.matrix_world@rig.pose.bones['root'].head;center=Vector((.02,root.y,1.05));cam.location=center+Vector((3.5,-6,1.30));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=f'{OUT}/previews/GLB_{action}.png';bpy.ops.render.render(write_still=True);print('GLB_POSE_RENDER',action,flush=True)
report={'status':'PASS','actions':list(actions),'default_water_extent_m':default_water,'maximum_sample_vertex_error_m':max(c['max_vertex_distance_m'] for c in checks),'samples':checks,'rendered_clips':['Idle','Walk','Run','Jump','Shoot','RunJump']}
json.dump(report,open(OUT+'/qa/glb_roundtrip_comparison.json','w'),indent=2);print('GLB_ROUNDTRIP_PASS',report['maximum_sample_vertex_error_m'],flush=True)
