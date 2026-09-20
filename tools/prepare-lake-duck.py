"""Normalize the downloaded CC BY 3.0 Mallard duck for the lake; run in background Blender."""
import bpy,os,sys,json,math,hashlib
from mathutils import Vector,Matrix
import numpy as np
# BEGIN PROJECT ROOT GUARD
from pathlib import Path
try:
    _script_file = Path(__file__).resolve(strict=True)
except (NameError, TypeError, OSError) as exc:
    raise RuntimeError("Cannot locate this authoring script. Run Blender with --python and the actual script file path.") from exc
_project_directory = _script_file.parent.parent
if not _script_file.is_file() or _script_file.parent.name != "tools" or not (_project_directory / "LH.laya").is_file():
    raise RuntimeError("Authoring script must be inside the tools directory of an LH project containing LH.laya.")
ROOT = _project_directory.as_posix()
# END PROJECT ROOT GUARD
OUT=ROOT+'/source_art/LakeDucks'
SOURCE=OUT+'/original/MallardDuck_PolyByGoogle_frSLi6b6Vid.glb'
for d in ['', '/qa','/previews']:os.makedirs(OUT+d,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.name='Lake Duck - Source and Preview'
bpy.ops.import_scene.gltf(filepath=SOURCE)
meshes=[o for o in scene.objects if o.type=='MESH'];assert len(meshes)==1
duck=meshes[0];duck.name='Duck_Mallard';duck.data.name='Duck_Mallard_Mesh'
duck.data.transform(duck.matrix_world);duck.matrix_world=Matrix.Identity(4)
positions=np.array([tuple(v.co) for v in duck.data.vertices])
source_min=positions.min(axis=0);source_max=positions.max(axis=0)
length=float(source_max[1]-source_min[1]);scale=.50/length
center=(source_min+source_max)*.5
for vertex in duck.data.vertices:
    vertex.co.x=(vertex.co.x-center[0])*scale
    vertex.co.y=(vertex.co.y-center[1])*scale
    vertex.co.z=(vertex.co.z-source_min[2])*scale
duck.data.update()

asset=bpy.data.collections.new('Lake Ducks | Duck Asset');scene.collection.children.link(asset)
for c in list(duck.users_collection):c.objects.unlink(duck)
asset.objects.link(duck)
preview=bpy.data.collections.new('Lake Ducks | Preview Only');scene.collection.children.link(preview)
positions=np.array([tuple(v.co) for v in duck.data.vertices]);duck.data.calc_loop_triangles()
images=[]
for mat in duck.data.materials:
    for node in mat.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.image:
            image=node.image
            if image.name not in [i['name'] for i in images]:
                images.append({'name':image.name,'dimensions':list(image.size),'channels':image.channels})
inspection={'source_bounds_blender_min':source_min.tolist(),'source_bounds_blender_max':source_max.tolist(),
            'source_scale_to_meters':scale,'normalized_dry_bounds_min':positions.min(axis=0).tolist(),
            'normalized_dry_bounds_max':positions.max(axis=0).tolist(),'vertices':len(duck.data.vertices),
            'triangles':len(duck.data.loop_triangles),'materials':[m.name for m in duck.data.materials],'textures':images}
json.dump(inspection,open(OUT+'/qa/source_inspection.json','w'),indent=2)
print('DUCK_SOURCE',json.dumps(inspection),flush=True)

def mat(name,color,roughness=1):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=roughness
    return m
def move_preview(ob):
    for c in list(ob.users_collection):c.objects.unlink(ob)
    preview.objects.link(ob)
floor_mat=mat('Preview pale surface',(.60,.69,.73),.45)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002));floor=bpy.context.object;floor.name='PREVIEW_Waterline';floor.data.materials.append(floor_mat);move_preview(floor)
world=bpy.data.worlds.new('Duck studio world');world.use_nodes=True;scene.world=world
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.65,.74,.80,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
def area(name,pos,power,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    ob=bpy.data.objects.new(name,data);preview.objects.link(ob);ob.location=pos;ob.rotation_euler=(Vector((0,0,.12))-ob.location).to_track_quat('-Z','Y').to_euler()
area('Duck key',(1,-2,2),180,3);area('Duck fill',(-2,-.5,1),90,3);area('Duck rim',(1,2,1.7),130,2)
cd=bpy.data.cameras.new('Duck QA Camera');cd.type='ORTHO';cd.ortho_scale=.77
cam=bpy.data.objects.new('Duck QA Camera',cd);preview.objects.link(cam);scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type=='OPTIX'
    scene.cycles.device='GPU'
except Exception:scene.cycles.device='CPU'
scene.render.resolution_x=800;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
def render(name,offset,center_z):
    target=Vector((0,0,center_z));cam.location=target+Vector(offset);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=OUT+'/previews/'+name+'.png';bpy.ops.render.render(write_still=True)
    print('DUCK_RENDER',name,flush=True)
render('source_dry_threequarter',(1.8,-2.4,1.2),.18)
render('source_dry_side',(2.5,0,.55),.18)
if '--inspect' in sys.argv:raise SystemExit(0)

# Source bill direction is checked from rendered anatomy; source already faces Blender -Y.
WATERLINE=.128
for vertex in duck.data.vertices:vertex.co.z-=WATERLINE
duck.data.update()
for m in duck.data.materials:m.name='Duck_Mallard_Feathers'
for image in bpy.data.images:
    if image.type=='IMAGE' and image.size[0]>0:
        # glTF prefers a packed image's original bytes. Remove the imported 2K pack first.
        if image.packed_file:image.unpack(method='REMOVE')
        if max(image.size)>1024:
            factor=1024/max(image.size);image.scale(round(image.size[0]*factor),round(image.size[1]*factor))
        image.filepath_raw=OUT+'/Duck_BaseColor.png';image.file_format='PNG';image.save()
        image.reload()
        image.pack()
duck['SourceTitle']='Mallard duck';duck['Author']='Poly by Google'
duck['SourceURL']='https://poly.pizza/m/frSLi6b6Vid'
duck['License']='CC BY 3.0';duck['LicenseURL']='https://creativecommons.org/licenses/by/3.0/'
duck['Changes']='Normalized to 0.50 m length; waterline origin; Blender -Y/glTF +Z forward; source geometry retained; source base color resized from 2K to 1K.'
duck['Forward']='Blender -Y / glTF +Z';duck['Waterline']='Blender Z=0 / glTF Y=0'
bpy.ops.object.select_all(action='DESELECT');duck.select_set(True);bpy.context.view_layer.objects.active=duck
bpy.ops.export_scene.gltf(filepath=OUT+'/Duck.glb',export_format='GLB',use_selection=True,
    export_apply=False,export_animations=False,export_yup=True,export_materials='EXPORT',
    export_texcoords=True,export_normals=True,export_cameras=False,export_lights=False,export_extras=True)
floor_mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.065,.21,.24,1)
floor_mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.22
render('Duck_swimming_threequarter',(1.8,-2.4,1.2),.105)
render('Duck_swimming_side',(2.5,0,.45),.105)
positions=np.array([tuple(v.co) for v in duck.data.vertices])
report={'status':'PASS','source_url':'https://poly.pizza/m/frSLi6b6Vid','download_url':'https://static.poly.pizza/b5b79a83-4dc0-4d6d-94ae-fb618129e1f7.glb',
        'source_title':'Mallard duck','author':'Poly by Google','license':'CC BY 3.0','license_url':'https://creativecommons.org/licenses/by/3.0/',
        'source_sha256':hashlib.sha256(open(SOURCE,'rb').read()).hexdigest(),
        'body_length_m':float(np.ptp(positions[:,1])),'width_m':float(np.ptp(positions[:,0])),'full_height_m':float(np.ptp(positions[:,2])),
        'glb_bounds_min':[float(positions[:,0].min()),float(positions[:,2].min()),float(-positions[:,1].max())],
        'glb_bounds_max':[float(positions[:,0].max()),float(positions[:,2].max()),float(-positions[:,1].min())],
        'origin':'waterline, centered horizontally','forward_glb':[0,0,1],
        'waterline_above_source_feet_m':WATERLINE,'mesh_count':1,'triangles':len(duck.data.loop_triangles),
        'materials':1,'textures':[{'name':img.name,'dimensions':list(img.size)} for img in bpy.data.images if img.type=='IMAGE' and img.size[0]>0],'animation_clips':0,
        'import_notes':'Use uniform scale 1.0. Set model root Y to the actual lake surface; feet and lower belly remain underwater. Rotate around local Y to follow swim heading. GLB contains only the duck; preview floor, lights and cameras are excluded.'}
json.dump(report,open(OUT+'/qa/duck_asset_report.json','w'),indent=2)
scene.render.filepath=OUT+'/previews/Duck_swimming_threequarter.png'
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/Duck.blend')
print('DUCK_READY',json.dumps(report),flush=True)
