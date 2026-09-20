import bpy,json,os
from mathutils import Vector
import numpy as np
OUT='D:/a/xiang_mu/LH/source_art/LakeDucks'
scene=bpy.context.scene
original=bpy.data.objects['Duck_Mallard'];original.hide_render=True
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=OUT+'/Duck.glb')
imported=[o for o in bpy.data.objects if o not in before and o.type=='MESH']
assert len(imported)==1
duck=imported[0];duck.data.calc_loop_triangles()
points=np.array([tuple(duck.matrix_world@v.co) for v in duck.data.vertices])
textures=[]
for m in duck.data.materials:
    for n in m.node_tree.nodes:
        if n.type=='TEX_IMAGE' and n.image:textures.append({'name':n.image.name,'size':list(n.image.size)})
assert len(duck.data.loop_triangles)==656
assert abs(float(np.ptp(points[:,1]))-.5)<1e-6
assert abs(float(points[:,2].min())+.128)<1e-6
print('ROUNDTRIP_TEXTURES',textures,flush=True)
assert len(textures)==1 and textures[0]['size']==[1024,1024]
cam=scene.camera;center=Vector((0,0,.105));cam.location=center+Vector((1.8,-2.4,1.2))
cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=OUT+'/previews/Duck_roundtrip_threequarter.png'
bpy.ops.render.render(write_still=True)
report={'status':'PASS','mesh_count':1,'triangles':656,'length_m':float(np.ptp(points[:,1])),
        'waterline_origin':True,'min_z_blender':float(points[:,2].min()),'textures':textures,
        'render':scene.render.filepath}
json.dump(report,open(OUT+'/qa/duck_glb_roundtrip.json','w'),indent=2)
print('DUCK_ROUNDTRIP_PASS',json.dumps(report),flush=True)
