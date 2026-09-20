import bpy,os
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919'
s=bpy.context.scene;s.sequence_editor_clear();s.sequence_editor_create()
s.render.resolution_x=720;s.render.resolution_y=900;s.render.resolution_percentage=100;s.render.fps=30
s.view_settings.view_transform='Standard';s.view_settings.look='None';s.view_settings.exposure=0
s.render.image_settings.media_type='IMAGE';s.render.image_settings.file_format='PNG'
strip=s.sequence_editor.strips.new_movie(name='Decode delivered MP4',filepath=OUT+'/previews/00_AllActions.mp4',channel=1,frame_start=1,fit_method='FIT')
for f in [1,105,200,297,389,460]:
 s.frame_set(f);s.render.filepath=f'{OUT}/qa/video_decoded_{f:03d}.png';bpy.ops.render.render(write_still=True)
print('ENCODED_VIDEO_VISUAL_FRAMES_READY',flush=True)
