import bpy,os,json,math
from mathutils import Vector
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919'
scene=bpy.data.scenes['AWB_Animated'];bpy.context.window.scene=scene;rig=bpy.data.objects['AWB_Rig']
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=640;scene.render.resolution_y=800;scene.render.resolution_percentage=100
data=bpy.data.cameras.new('Animation QA camera');data.type='ORTHO';data.ortho_scale=2.62
cam=bpy.data.objects.new('Animation QA camera',data);scene.collection.objects.link(cam);scene.camera=cam
spec=[('Idle',1),('Walk',1),('Walk',9),('Walk',17),('Run',1),('Run',7),('Run',13),('Jump',9),('Jump',22),('Jump',34),('Shoot',30),('RunJump',23)]
for action,frame in spec:
 act=bpy.data.actions[action];rig.animation_data.action=act;rig.animation_data.action_slot=act.slots[0];scene.frame_set(frame);bpy.context.view_layer.update()
 root=rig.pose.bones['root'].head
 center=Vector((.025,root.y,1.05));cam.location=center+Vector((3.5,-6,1.30));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=f'{OUT}/qa/{action}_{frame:03d}.png';bpy.ops.render.render(write_still=True);print('POSE_QA',action,frame,flush=True)
