import bmesh
# Correct the facial proportions as one editable assembly, with no billboard features.
for cname in ['03_Face','04_Hair','05_Glasses']:
    for ob in cols[cname].objects:
        if ob.type!='MESH':continue
        for ve in ob.data.vertices:
            ve.co.x*=1.12
            ve.co.z=1.700+(ve.co.z-1.700)*.90
        ob.data.update()

# Use dark matte hair, dark cotton and clear lenses. The color grading is shared by all views.
settings={
 'Hair':((.005,.006,.009),.68,.14), 'HairMid':((.010,.011,.015),.64,.16),'HairLit':((.020,.019,.024),.65,.15),
 'Jacket':((.015,.017,.023),.84,.13),'JacketPanel':((.021,.024,.033),.83,.14),'JacketSeam':((.007,.009,.013),.86,.1),
 'Pants':((.020,.022,.030),.90,.12),'RibKnit':((.009,.011,.016),.93,.10),
 'EyeWhite':((.74,.74,.70),.5,.12),'Iris':((.030,.043,.073),.53,.18),'IrisLight':((.11,.14,.21),.5,.18),
 'Pupil':((.005,.007,.013),.55,.10),'Lash':((.018,.010,.015),.9,.08),
 'GunBlue':((.005,.037,.65),.3,.30),'GunBlueLight':((.010,.095,.8),.30,.32),'GunOrange':((.9,.102,.003),.34,.28),'GunOrangeLight':((1,.20,.008),.33,.28),
 'GunGreen':((.12,.55,.012),.33,.28),'GunGreenLight':((.22,.71,.017),.33,.28),
 'ShoeWhite':((.70,.71,.74),.72,.15),'ShoePale':((.44,.47,.53),.70,.14),
}
for key,(color,rough,spec) in settings.items():
    mat=M[key];bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Specular IOR Level'].default_value=spec;mat.diffuse_color=(*color,1)
bs=next(n for n in M['Glass'].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bs.inputs['Alpha'].default_value=.023;bs.inputs['Specular IOR Level'].default_value=.1

# Open the nozzle properly: remove the disks that would otherwise block the recess.
o=bpy.data.objects['AWB.Gun muzzle open annular lip']
bm=bmesh.new();bm.from_mesh(o.data)
faces=[p for p in bm.faces if len(p.verts)>4]
bmesh.ops.delete(bm,geom=faces,context='FACES');bm.to_mesh(o.data);bm.free()
o=bpy.data.objects['AWB.Gun muzzle stepped tip']
bm=bmesh.new();bm.from_mesh(o.data);bm.faces.ensure_lookup_table()
# Only the forward closure needs to disappear; the external barrel silhouette stays intact.
faces=[p for p in bm.faces if len(p.verts)>4 and p.calc_center_median().x>.43]
bmesh.ops.delete(bm,geom=faces,context='FACES');bm.to_mesh(o.data);bm.free()

scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=-.20
bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Strength'].default_value=.19
for name,energy in [('Key softbox',330),('Front fill',140),('Hair and shoulder rim',240),('Back fill',125)]:bpy.data.objects['AWB.'+name].data.energy=energy
bs=next(n for n in M['Backdrop'].node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Base Color'].default_value=(.73,.77,.81,1);bs.inputs['Emission Color'].default_value=(.73,.77,.81,1);bs.inputs['Emission Strength'].default_value=.45

# Smooth head silhouette and outward-facing watertight hair surfaces.
for ob in asset.all_objects:
    if ob.type!='MESH':continue
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(ob.data);bm.free();ob.data.update()

bpy.context.view_layer.update()
scene.camera=cameras['ThreeQuarter'];scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'AnimeWatergunBoy.blend'))
print('Proportions, material contrast, cloth silhouette and open muzzle refined')
