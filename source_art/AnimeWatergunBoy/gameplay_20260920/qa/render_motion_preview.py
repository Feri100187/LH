"""Render a short review movie from the authored Blender actions; does not save the .blend."""
import bpy, os, json
from mathutils import Vector
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/gameplay_20260920'
scene=bpy.data.scenes['AWB_Animated'];bpy.context.window.scene=scene
rig=bpy.data.objects['AWB_Rig']
scene.sequence_editor_clear()
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type=='OPTIX'
    scene.cycles.device='GPU'
except Exception:scene.cycles.device='CPU'
scene.render.resolution_x=480;scene.render.resolution_y=560;scene.render.resolution_percentage=100
scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG'
scene.render.fps=30
cd=bpy.data.cameras.new('Gameplay review movie camera');cd.type='ORTHO';cd.ortho_scale=2.22
cam=bpy.data.objects.new('Gameplay review movie camera',cd);scene.collection.objects.link(cam);scene.camera=cam
center=Vector((0,0,.90));cam.location=(3.8,-6,1.50);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
segments=[]
for name,frames,step,repeats,label in [
        ('Idle',90,2,1,'待机 · 前向持枪'),
        ('Walk',22,1,4,'行走 · 移重与上身摆动'),
        ('Run',18,1,5,'奔跑 · 大步幅侧持')]:
    a=bpy.data.actions[name];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
    folder=f'{OUT}/qa/movie_frames/{name}';os.makedirs(folder,exist_ok=True)
    images=[]
    for frame in range(1,frames+1,step):
        scene.frame_set(frame);bpy.context.view_layer.update()
        path=folder+f'/{frame:04d}.png';scene.render.filepath=path
        bpy.ops.render.render(write_still=True)
        images.extend([path]*step)
    segments.append({'name':name,'label':label,'images':images*repeats,'unique_frames':len(set(images))})
    print('RENDERED_SEGMENT',name,len(images)*repeats,flush=True)

scene.sequence_editor_create()
scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
scene.view_settings.exposure=0;scene.view_settings.gamma=1
font=bpy.data.fonts.load('C:/Windows/Fonts/msyh.ttc')
start=1
for segment in segments:
    files=segment['images']
    strip=scene.sequence_editor.strips.new_image(name=segment['name'],filepath=files[0],channel=1,frame_start=start,fit_method='FIT')
    for path in files[1:]:strip.elements.append(os.path.basename(path))
    strip.frame_final_duration=len(files)
    text=scene.sequence_editor.strips.new_effect(name=segment['label'],type='TEXT',channel=2,frame_start=start,length=len(files))
    text.text=segment['label'];text.font=font;text.font_size=19;text.color=(.055,.072,.1,1)
    text.location=(.5,.972);text.anchor_x='CENTER';text.anchor_y='TOP'
    text.use_box=True;text.box_color=(.96,.97,.99,.86);text.box_margin=.01
    start+=len(files)
scene.frame_start=1;scene.frame_end=start-1
scene.render.image_settings.media_type='VIDEO';scene.render.image_settings.file_format='FFMPEG'
scene.render.ffmpeg.format='MPEG4';scene.render.ffmpeg.codec='H264';scene.render.ffmpeg.constant_rate_factor='HIGH'
scene.render.ffmpeg.ffmpeg_preset='GOOD';scene.render.ffmpeg.audio_codec='NONE'
target=OUT+'/previews/gameplay_motion_preview.mp4';scene.render.filepath=target
bpy.ops.render.render(animation=True)
clip=bpy.data.movieclips.load(target)
report={'status':'PASS','file':target,'width':clip.size[0],'height':clip.size[1],
        'frames':clip.frame_duration,'fps':30,'seconds':(start-1)/30,'file_bytes':os.path.getsize(target),
        'segments':[{'name':s['name'],'frames':len(s['images']),'unique_rendered_frames':s['unique_frames']} for s in segments],
        'notes':'Real Cycles renders from the authored Blender skeleton; idle rendered at 15fps and held twice, locomotion rendered at 30fps. In-place cycles repeat without their duplicate endpoint.'}
assert report['width']==480 and report['height']==560
assert abs(report['frames']-(start-1))<=1
assert report['file_bytes']>10000
json.dump(report,open(OUT+'/qa/gameplay_motion_video_validation.json','w'),indent=2)
# Decode the final delivered movie to verify encoded rather than source images.
scene.sequence_editor_clear();scene.sequence_editor_create()
scene.sequence_editor.strips.new_movie(name='Encoded video review',filepath=target,channel=1,frame_start=1,fit_method='FIT')
scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG'
for frame in [35,105,153,202,250]:
    scene.frame_set(frame);scene.render.filepath=f'{OUT}/qa/movie_decoded_{frame:03d}.png'
    bpy.ops.render.render(write_still=True)
print('MOVIE_READY',json.dumps(report),flush=True)
