import bpy,os,json,struct,math
import numpy as np
from mathutils import Vector
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy'
scene=bpy.data.scenes['AWB_Presentation'];bpy.context.window.scene=scene
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU';scene.cycles.samples=96;scene.cycles.use_denoising=True
scene.render.resolution_x=1280;scene.render.resolution_y=1600;scene.render.resolution_percentage=100
views=[('Front','01_Front'),('Side','02_Side'),('Back','03_Back'),('ThreeQuarter','04_ThreeQuarter'),('FaceDetail','05_FaceDetail'),('HandsDetail','06_HandsDetail'),('ShoesDetail','07_ShoesDetail')]
for name,filename in views:
    scene.camera=bpy.data.objects['AWB.Camera.'+name];scene.render.filepath=os.path.join(OUT,'previews',filename+'.png')
    bpy.ops.render.render(write_still=True);print('FINAL_PREVIEW',filename,flush=True)

# Parse the GLB container and check every index accessor before the actual Blender reimport.
raw=open(os.path.join(OUT,'AnimeWatergunBoy.glb'),'rb').read();magic,version,length=struct.unpack_from('<III',raw,0)
assert magic==0x46546c67 and version==2 and length==len(raw)
pos=12;document=None;binary=None
while pos<len(raw):
    size,kind=struct.unpack_from('<II',raw,pos);pos+=8;chunk=raw[pos:pos+size];pos+=size
    if kind==0x4e4f534a:document=json.loads(chunk.decode('utf-8'))
    if kind==0x004e4942:binary=chunk
assert document is not None and binary is not None
types={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'};counts={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def accessor(index):
    a=document['accessors'][index];bv=document['bufferViews'][a['bufferView']];dt=np.dtype(types[a['componentType']]);n=counts[a['type']];offset=bv.get('byteOffset',0)+a.get('byteOffset',0);stride=bv.get('byteStride',dt.itemsize*n)
    return np.ndarray((a['count'],n),dtype=dt,buffer=binary,offset=offset,strides=(stride,dt.itemsize))
triangles=0;primitive_count=0;color_count=0;bad_indices=0;nonfinite=0
for m in document['meshes']:
    for p in m['primitives']:
        primitive_count+=1;coords=accessor(p['attributes']['POSITION']);nonfinite+=int((~np.isfinite(coords)).sum())
        idx=accessor(p['indices']).ravel() if 'indices' in p else np.arange(len(coords))
        bad_indices+=int((idx>=len(coords)).sum());triangles+=len(idx)//3
        if 'COLOR_0' in p['attributes']:color_count+=1
assert nonfinite==0 and bad_indices==0
assert all('bufferView' in im for im in document.get('images',[]))

original=json.load(open(os.path.join(OUT,'qa','blend_geometry_report.json'),encoding='utf-8'))
check=bpy.data.scenes.new('AWB_GLB_CHECK');bpy.context.window.scene=check
bpy.ops.import_scene.gltf(filepath=os.path.join(OUT,'AnimeWatergunBoy.glb'))
imported=[o for o in check.objects if o.type=='MESH']
bpy.context.view_layer.update();points=[o.matrix_world@v.co for o in imported for v in o.data.vertices]
lo=[min(v[i] for v in points) for i in range(3)];hi=[max(v[i] for v in points) for i in range(3)]
difference=max(abs(lo[i]-original['bounds_min_m'][i]) for i in range(3));difference=max(difference,max(abs(hi[i]-original['bounds_max_m'][i]) for i in range(3)))
assert difference<.00002
assert len(imported)==original['mesh_objects']
assert triangles==original['triangles']
glass=[m for m in document['materials'] if 'Glass' in m.get('name','')]
assert glass and glass[0].get('alphaMode')=='BLEND'
cloth=[p for m in document['meshes'] for p in m['primitives'] if 'COLOR_0' in p['attributes']]
assert len(cloth)>=2

# Render the imported GLB with the exact studio and cameras used for the editable project.
check.collection.children.link(bpy.data.collections['AWB | Preview studio']);check.world=scene.world
try:check.render.engine='CYCLES'
except TypeError:pass
check.cycles.device='GPU';check.cycles.samples=64;check.cycles.use_denoising=True
check.render.resolution_x=1280;check.render.resolution_y=1600;check.render.resolution_percentage=100
check.render.image_settings.file_format='PNG';check.view_settings.view_transform=scene.view_settings.view_transform;check.view_settings.look=scene.view_settings.look;check.view_settings.exposure=scene.view_settings.exposure
for name in ['Front','Side','Back','ThreeQuarter','HandsDetail']:
    check.camera=bpy.data.objects['AWB.Camera.'+name];check.render.filepath=os.path.join(OUT,'qa','GLB_checked_'+name+'.png')
    bpy.ops.render.render(write_still=True);print('GLB_REIMPORT_RENDER',name,flush=True)
result={'status':'PASS','format':'glTF 2.0 binary','file_bytes':len(raw),'mesh_objects':len(imported),'triangles':triangles,'primitives':primitive_count,'materials':len(document['materials']),'embedded_images':len(document.get('images',[])),'vertex_color_primitives':color_count,'bounds_error_m':difference,'dimensions_m':[hi[i]-lo[i] for i in range(3)],'invalid_indices':bad_indices,'nonfinite_positions':nonfinite,'transparent_lenses':True,'skins':len(document.get('skins',[])),'animations':len(document.get('animations',[])),'reimport_views':['Front','Side','Back','ThreeQuarter','HandsDetail'],'material_extensions':document.get('extensionsUsed',[])}
with open(os.path.join(OUT,'qa','glb_validation.json'),'w',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2)
print('GLB_CHECK_PASS',json.dumps(result),flush=True)
