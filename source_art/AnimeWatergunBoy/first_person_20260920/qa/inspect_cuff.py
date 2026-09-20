import bpy,numpy as np,json
rig=bpy.data.objects['AWB_Rig'];dg=bpy.context.evaluated_depsgraph_get();out={}
for side in ('L','R'):
    obj=bpy.data.objects['AWB.Clothes | '+side+' ribbed cuff']
    ev=obj.evaluated_get(dg);mesh=ev.to_mesh()
    points=np.array([(ev.matrix_world@v.co)[:] for v in mesh.vertices])
    out[side]={'head':list(rig.pose.bones['forearm.'+side].head),
               'tail':list(rig.pose.bones['forearm.'+side].tail),
               'cuff_min':points.min(axis=0).tolist(),'cuff_max':points.max(axis=0).tolist(),
               'center':points.mean(axis=0).tolist(),
               'materials':[m.name for m in obj.data.materials]}
    ev.to_mesh_clear()
json.dump(out,open('D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/first_person_20260920/qa/cuff_inspection.json','w'),indent=2)
print('CUFF',json.dumps(out))
