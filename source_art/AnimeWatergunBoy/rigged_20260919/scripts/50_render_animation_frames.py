import bpy,json,os,math,sys
from mathutils import Vector
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919'
scene=bpy.data.scenes['AWB_Animated'];bpy.context.window.scene=scene;rig=bpy.data.objects['AWB_Rig']
try:scene.render.engine='BLENDER_EEVEE'
except TypeError:pass
scene.eevee.taa_render_samples=48
scene.render.resolution_x=720;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
scene.render.fps=30
cd=bpy.data.cameras.new('Animation review camera');cd.type='ORTHO';cd.ortho_scale=2.66
cam=bpy.data.objects.new('Animation review camera',cd);scene.collection.objects.link(cam);scene.camera=cam
actions=json.load(open(OUT+'/qa/actions.json'))
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if args:actions=[a for a in actions if a['name'] in args]
for spec in actions:
 name=spec['name'];act=bpy.data.actions[name];rig.animation_data.action=act;rig.animation_data.action_slot=act.slots[0]
 directory=OUT+'/frames/'+name;os.makedirs(directory,exist_ok=True)
 for frame in range(1,spec['frames'][1]+1):
  scene.frame_set(frame);bpy.context.view_layer.update()
  if name=='RunJump':
   # A fixed side camera makes the root-motion distance visible.
   center=Vector((0,-.92,1.07));cam.location=center+Vector((6,.40,.8));cd.ortho_scale=3.28
  else:
   center=Vector((.03,0,1.05));cam.location=center+Vector((3.5,-6,1.30));cd.ortho_scale=2.66
  cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
  scene.render.filepath=directory+f'/{frame:04d}.png';bpy.ops.render.render(write_still=True)
  if frame%15==0 or frame==spec['frames'][1]:print('ANIMATION_FRAMES',name,frame,'/',spec['frames'][1],flush=True)
print('FRAME_RENDER_COMPLETE',flush=True)
