import bpy,os,json,math,bmesh
import numpy as np
from mathutils import Vector,Matrix
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919'
scene=bpy.data.scenes['AWB_Animated'];bpy.context.window.scene=scene;rig=bpy.data.objects['AWB_Rig'];asset=bpy.data.collections['AWB | Rigged character']
# Clean the rest-pose water mesh before export, retaining its one-bone skinning.
water=bpy.data.objects['FX_WaterPulse'];bm=bmesh.new();bm.from_mesh(water.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7);bmesh.ops.dissolve_degenerate(bm,dist=1e-7,edges=list(bm.edges));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(water.data);bm.free();water.data.update()
for g in list(water.vertex_groups):water.vertex_groups.remove(g)
g=water.vertex_groups.new(name='water_jet');g.add(list(range(len(water.data.vertices))),1,'REPLACE')
weights=[];tri=0
for o in asset.all_objects:
 if o.type!='MESH':continue
 o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles)
 sums=[sum(vg.weight for vg in v.groups) for v in o.data.vertices]
 weights.append({'object':o.name,'verts':len(sums),'unweighted':sum(s<.999 for s in sums),'max_weight_sum_error':max(abs(s-1) for s in sums),'max_influences':max(len(v.groups) for v in o.data.vertices)})
assert all(w['unweighted']==0 and w['max_influences']<=4 and w['max_weight_sum_error']<1e-5 for w in weights)
action_meta=json.load(open(OUT+'/qa/actions.json'));all_metrics=[];samples={}
mesh_names=['AWB.Head sculpted face and skull','AWB.Jacket continuous shoulder and sleeves','AWB.Pants continuous seat and legs','AWB.Right hand rear grip','AWB.Left hand foregrip support','AWB.Watergun | white receiver and rails','AWB.Shoe | R layered sole','AWB.Shoe | L layered sole']
rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
def vertex_world(ob,indices):
 ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();out=[list(ev.matrix_world@me.vertices[i].co) for i in indices];ev.to_mesh_clear();return out
for spec in action_meta:
 name=spec['name'];action=bpy.data.actions[name];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
 mn=1e9;maxik=0;maxgrip=0;airframes=0;per=[];loop_start=None;loop_error=0
 sampleframes=sorted(set([1,(spec['frames'][1]+1)//2,spec['frames'][1],30 if name=='Shoot' else spec['frames'][1]//3+1]))
 for frame in range(1,spec['frames'][1]+1):
  scene.frame_set(frame);bpy.context.view_layer.update()
  mins={}
  for s in ['R','L']:
   ob=bpy.data.objects['AWB.Shoe | '+s+' layered sole'];ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();mins[s]=min((ev.matrix_world@v.co).z for v in me.vertices);ev.to_mesh_clear()
   err=(rig.pose.bones['shin.'+s].tail-rig.pose.bones['CTRL_foot.'+s].head).length;maxik=max(maxik,err)
   err=(rig.pose.bones['forearm.'+s].tail-rig.pose.bones['CTRL_hand.'+s].head).length;maxik=max(maxik,err)
   hd=rig.pose.bones['hand.'+s].matrix@rest['hand.'+s].inverted();wd=rig.pose.bones['weapon'].matrix@rest['weapon'].inverted()
   maxgrip=max(maxgrip,max(abs(hd[r][c]-wd[r][c]) for r in range(4) for c in range(4)))
  mn=min(mn,*mins.values());airframes+=int(min(mins.values())>.005)
  posem=np.array([list(row) for b in rig.pose.bones for row in b.matrix])
  if frame==1:loop_start=posem
  if frame==spec['frames'][1]:loop_error=float(np.max(np.abs(posem-loop_start)))
  per.append({'frame':frame,'sole_min_z_m':mins,'root':list(rig.pose.bones['root'].head)})
  if frame in sampleframes:
   pose_sample={}
   for meshname in mesh_names:
    ob=bpy.data.objects[meshname];indices=np.linspace(0,len(ob.data.vertices)-1,min(80,len(ob.data.vertices)),dtype=int).tolist()
    pose_sample[meshname]={'indices':indices,'positions':vertex_world(ob,indices)}
   samples[f'{name}:{frame}']=pose_sample
 all_metrics.append({'action':name,'frames':spec['frames'],'minimum_sole_z_m':mn,'both_feet_airborne_frames':airframes,'maximum_ik_error_m':maxik,'maximum_hand_weapon_matrix_difference':maxgrip,'loop_matrix_difference':loop_error if spec['loop'] else None})
 json.dump(per,open(OUT+'/qa/'+name+'_ground_contacts.json','w'),indent=2)
assert min(m['minimum_sole_z_m'] for m in all_metrics)>-.003
assert max(m['maximum_ik_error_m'] for m in all_metrics)<.002
assert max(m['maximum_hand_weapon_matrix_difference'] for m in all_metrics)<.0001
assert all(m['loop_matrix_difference'] is None or m['loop_matrix_difference']<1e-4 for m in all_metrics)
json.dump(samples,open(OUT+'/qa/source_animation_samples.json','w'),indent=1)
report={'status':'PASS','total_bones':len(rig.data.bones),'deform_bones':sum(b.use_deform for b in rig.data.bones),'mesh_objects':len(weights),'triangles':tri,'weights':weights,'actions':all_metrics,'notes':'Floor checks include complete sole meshes at every authored frame. Hand-weapon matrices exclude intentional trigger-finger articulation. In-place locomotion intentionally moves stance feet relative to a stationary root.'}
json.dump(report,open(OUT+'/qa/rig_animation_quality.json','w'),indent=2)

idle=bpy.data.actions['Idle'];rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0];scene.frame_set(1);bpy.context.view_layer.update()
basis={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
rig.animation_data.action=None
for b in rig.pose.bones:b.matrix_basis=basis[b.name]
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in asset.all_objects:
 if o.type=='MESH':o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=OUT+'/AnimeWatergunBoy_Rigged.glb',export_format='GLB',use_selection=True,export_apply=False,export_animations=True,export_animation_mode='ACTIONS',export_anim_single_armature=False,export_merge_animation='ACTION',export_force_sampling=True,export_frame_step=1,export_frame_range=False,export_anim_slide_to_zero=True,export_skins=True,export_def_bones=True,export_reset_pose_bones=True,export_optimize_animation_size=False,export_rest_position_armature=False,export_current_frame=True,export_yup=True,export_materials='EXPORT',export_image_format='AUTO',export_texcoords=True,export_normals=True,export_vertex_color='MATERIAL',export_all_vertex_colors=True,export_cameras=False,export_lights=False,export_extras=True)
rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0];scene.frame_start=1;scene.frame_end=91;scene.frame_set(1)
scene.camera=bpy.data.objects['AWB.Camera.ThreeQuarter']
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
for a in bpy.context.screen.areas:
 if a.type=='VIEW_3D':a.spaces.active.overlay.show_overlays=True;a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/AnimeWatergunBoy_Rigged.blend')
print('EXPORT_AND_FULL_FRAME_QA',json.dumps({k:report[k] for k in ['status','total_bones','deform_bones','mesh_objects','triangles','actions']}),flush=True)
