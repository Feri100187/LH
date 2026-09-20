import bpy,os
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919'
scene=bpy.data.scenes['AWB_Animated'];bpy.context.window.scene=scene;rig=bpy.data.objects['AWB_Rig']
idle=bpy.data.actions['Idle'];rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0];scene.frame_start=1;scene.frame_end=91;scene.frame_set(1)
body=rig.data.collections.get('Body FK') or rig.data.collections.new('Body FK')
for n in ['root','pelvis','spine','chest','neck','head']:body.assign(rig.data.bones[n])
rig.data.collections['Deform'].is_visible=False
scene.timeline_markers.clear();scene.timeline_markers.new('待机循环开始',frame=1);scene.timeline_markers.new('待机循环结束',frame=91)
for a in bpy.context.screen.areas:
 if a.type=='DOPESHEET_EDITOR':a.spaces.active.mode='ACTION'
 elif a.type=='VIEW_3D':
  a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.overlay.show_overlays=True;a.spaces.active.shading.type='MATERIAL'
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
readme=bpy.data.texts.get('骨骼与动作说明') or bpy.data.texts.new('骨骼与动作说明');readme.clear();readme.write(open(OUT+'/骨骼与动作说明.md',encoding='utf-8').read())
for action in ['Idle','Walk','Run','Jump','Shoot','RunJump']:bpy.data.actions[action].use_fake_user=True
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/AnimeWatergunBoy_Rigged.blend')
print('EDITABLE_PROJECT_READY',flush=True)
