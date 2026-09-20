from mathutils.bvhtree import BVHTree
import bmesh
bpy.context.view_layer.update()
jacket=bpy.data.objects['AWB.Jacket continuous shoulder and sleeves'];tree=bvh_object(jacket)
zipper=bpy.data.objects['AWB.Clothes | zipper assembly'];inv=zipper.matrix_world.inverted()
for v in zipper.data.vertices:
    p=zipper.matrix_world@v.co
    q,n,idx,dist=tree.ray_cast(Vector((p.x,-.55,p.z)),Vector((0,1,0)),1.0)
    if q is not None:
        rawz=p.z-characterroot.matrix_world.translation.z
        previous_base=front_torso(rawz)
        relative_depth=max(-.019,min(.003,p.y-previous_base))
        p.y=q.y+relative_depth-.0011
        v.co=inv@p
zipper.data.update()
# Overlap the neck inside the skull so the rear junction has no exposed end cap.
neck=bpy.data.objects['AWB.Neck']
for v in neck.data.vertices:
    if v.co.z>1.535:
        t=(v.co.z-1.535)/.064
        v.co.z+=.027*t
        v.co.y+=.006*t*max(0,(v.co.y-.008)/.05)
bm=bmesh.new();bm.from_mesh(neck.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(neck.data);bm.free()

# Re-export exactly the same editable asset and refresh the report; do not touch the original scene.
exec(compile(open(os.path.join(OUT,'scripts','61_final_mesh.py'),encoding='utf-8').read(),'61_final_mesh.py','exec'),globals())
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        space=area.spaces.active;space.region_3d.view_perspective='CAMERA';space.region_3d.view_camera_zoom=0;space.region_3d.view_camera_offset=(0,0)
        space.shading.type='MATERIAL';space.overlay.show_overlays=False
scene.camera=cameras['ThreeQuarter'];scene.camera.data.passepartout_alpha=1
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'AnimeWatergunBoy.blend'))
