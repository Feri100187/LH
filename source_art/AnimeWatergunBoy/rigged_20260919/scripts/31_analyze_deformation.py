import bpy,json,os
import numpy as np
from mathutils import Vector
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919'
scene=bpy.data.scenes['AWB_Animated'];bpy.context.window.scene=scene;rig=bpy.data.objects['AWB_Rig']
results=[]
for action,frame in [('Shoot',30),('Run',7),('Jump',9)]:
 act=bpy.data.actions[action];rig.animation_data.action=act;rig.animation_data.action_slot=act.slots[0];scene.frame_set(frame);bpy.context.view_layer.update()
 deps=bpy.context.evaluated_depsgraph_get()
 for name in ['AWB.Jacket continuous shoulder and sleeves','AWB.Pants continuous seat and legs']:
  o=bpy.data.objects[name];me=o.evaluated_get(deps).to_mesh();before=np.array([v.co[:] for v in o.data.vertices]);after=np.array([v.co[:] for v in me.vertices]);eds=np.array([e.vertices[:] for e in o.data.edges])
  a=np.linalg.norm(before[eds[:,0]]-before[eds[:,1]],axis=1);b=np.linalg.norm(after[eds[:,0]]-after[eds[:,1]],axis=1);ratio=b/np.maximum(a,1e-8)
  bad=[]
  for idx in np.argsort(ratio)[-12:][::-1]:
   vs=[]
   for vi in eds[idx]:
    v=o.data.vertices[int(vi)];vs.append({'id':int(vi),'rest':list(v.co),'posed':list(me.vertices[int(vi)].co),'weights':{o.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>.001}})
   bad.append({'ratio':float(ratio[idx]),'length_m':float(a[idx]),'vertices':vs})
  results.append({'action':action,'frame':frame,'object':name,'percentiles':np.percentile(ratio,[50,95,99,100]).tolist(),'worst':bad})
  o.evaluated_get(deps).to_mesh_clear()
 if action=='Shoot':print('ARM_POSE',[(p.name,list(p.head),list(p.tail)) for p in rig.pose.bones if p.name.startswith(('upper_arm','forearm','hand.'))])
json.dump(results,open(OUT+'/qa/deformation_diagnostics.json','w'),indent=2)
print('STRETCH_SUMMARY',[(r['action'],r['object'],r['percentiles']) for r in results])
