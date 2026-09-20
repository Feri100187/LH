import bpy,os,json
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919'
scene=bpy.context.scene
scene.sequence_editor_clear();scene.sequence_editor_create()
scene.render.resolution_x=720;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.fps=30
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
scene.render.image_settings.media_type='VIDEO';scene.render.image_settings.file_format='FFMPEG';scene.render.ffmpeg.format='MPEG4';scene.render.ffmpeg.codec='H264';scene.render.ffmpeg.constant_rate_factor='HIGH';scene.render.ffmpeg.ffmpeg_preset='GOOD';scene.render.ffmpeg.audio_codec='NONE'
font=bpy.data.fonts.load('C:/Windows/Fonts/msyh.ttc')
specs=[('Idle','待机 · Idle',90,1),('Walk','行走 · Walk｜原地循环',32,3),('Run','跑步 · Run｜原地循环',22,4),('Jump','跳跃 · Jump',42,2),('Shoot','射击 · Shoot',75,1),('RunJump','跑跳 · RunJump｜带位移',49,1)]
def sequence(name,number,repeats):
 seq=[f'{i:04d}.png' for i in range(1,number+1)]*repeats
 if name=='RunJump':seq=['0001.png']*8+seq+[f'{number:04d}.png']*14
 return seq
def add_segment(name,label,number,repeats,start):
 files=sequence(name,number,repeats);folder=f'{OUT}/frames/{name}'
 assert all(os.path.exists(folder+'/'+f) for f in set(files))
 strip=scene.sequence_editor.strips.new_image(name=name,filepath=folder+'/'+files[0],channel=1,frame_start=start,fit_method='FIT')
 for f in files[1:]:strip.elements.append(f)
 strip.frame_final_duration=len(files)
 title=scene.sequence_editor.strips.new_effect(name=label,type='TEXT',channel=2,frame_start=start,length=len(files))
 title.text=label;title.font=font;title.font_size=31;title.color=(.055,.072,.10,1);title.location=(.5,.955);title.anchor_x='CENTER';title.anchor_y='TOP';title.use_box=True;title.box_color=(.96,.97,.99,.84);title.box_margin=.017
 return len(files)
def clear():
 for strip in list(scene.sequence_editor.strips):scene.sequence_editor.strips.remove(strip)
records=[]
for i,(name,label,n,rep) in enumerate(specs,1):
 clear();length=add_segment(name,label,n,rep,1);scene.frame_start=1;scene.frame_end=length;scene.render.filepath=f'{OUT}/previews/{i:02d}_{name}.mp4'
 bpy.ops.render.render(animation=True);records.append({'file':scene.render.filepath,'frames':length,'seconds':length/30});print('ENCODED_CLIP',name,length,flush=True)
clear();start=1
for name,label,n,rep in specs:start+=add_segment(name,label,n,rep,start)
scene.frame_start=1;scene.frame_end=start-1;scene.render.filepath=OUT+'/previews/00_AllActions.mp4';bpy.ops.render.render(animation=True)
records.append({'file':scene.render.filepath,'frames':start-1,'seconds':(start-1)/30})
# Decode each newly written MP4 through Blender's movie loader.
for record in records:
 clip=bpy.data.movieclips.load(record['file']);record['decoded_size']=list(clip.size);record['decoded_frames']=clip.frame_duration
 assert clip.size[0]==720 and clip.size[1]==900
 assert abs(clip.frame_duration-record['frames'])<=1
 assert os.path.getsize(record['file'])>10000
json.dump({'status':'PASS','videos':records},open(OUT+'/qa/video_validation.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print('VIDEO_DECODE_PASS',json.dumps(records),flush=True)
