import bmesh
CURRENT=cols['02_Clothes']
# Keep fine teeth readable without applying dozens of bevel segments per millimeter.
for ob in cols['02_Clothes'].objects:
    if 'zipper metal teeth' in ob.name:
        for mod in list(ob.modifiers):ob.modifiers.remove(mod)

budgets={
 'AWB.Jacket continuous shoulder and sleeves':22000,
 'AWB.Pants continuous seat and legs':15000,
 'AWB.Hair sculpted layered crown':14000,
 'AWB.R continuous sneaker upper':4500,
 'AWB.L continuous sneaker upper':4500,
 'AWB.Head sculpted face and skull':12000
}
for name,target in budgets.items():
    ob=bpy.data.objects[name];ob.data.calc_loop_triangles();count=len(ob.data.loop_triangles)
    if count>target:
        mod=ob.modifiers.new('Final game surface budget','DECIMATE');mod.ratio=target/count;apply_mod(ob,mod)

# Bake the remaining small structural modifiers. Nothing in the export depends on subdivision.
for ob in list(asset.all_objects):
    if ob.type!='MESH':continue
    for mod in list(ob.modifiers):apply_mod(ob,mod)
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0000001)
    bad=[f for f in bm.faces if f.calc_area()<1e-14]
    if bad:bmesh.ops.delete(bm,geom=bad,context='FACES')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(ob.data);bm.free();ob.data.update()

def merge_filter(c, name, predicate):
    objs=[o for o in list(c.objects) if o.type=='MESH' and predicate(o.name)]
    return join(objs,name,c) if len(objs)>1 else (objs[0] if objs else None)

# Functional editable objects, instead of hundreds of screws, ribs and tiny curves.
c=cols['08_Watergun']
merge_filter(c,'Watergun | white receiver and rails',lambda n:any(s in n for s in ['white main shell','white raised side panel','blue inlay','recessed lower rail','lower rail vent','shell fastening ring','blue top fin','top sight']))
merge_filter(c,'Watergun | blue reservoir',lambda n:any(s in n for s in ['blue water reservoir','Reservoir collar','Reservoir bright shoulder']))
merge_filter(c,'Watergun | orange fill cap',lambda n:'fill cap' in n or 'Fill cap' in n)
merge_filter(c,'Watergun | blue rear grip and guard',lambda n:any(s in n for s in ['blue rear pistol grip','handle butt','grip recessed panel','grip texture rib','blue trigger guard']))
merge_filter(c,'Watergun | green foregrip',lambda n:any(s in n for s in ['green front pump','green end button','Green molded pump rib','Foregrip white attachment']))
merge_filter(c,'Watergun | orange muzzle and open bore',lambda n:'muzzle' in n or 'Orange collar molded rib' in n or 'recessed dark bore' in n)

c=cols['04_Hair']
merge_filter(c,'Hair | layered bangs',lambda n:'Bangs' in n)
merge_filter(c,'Hair | crown tufts',lambda n:'Natural crown tuft' in n)
merge_filter(c,'Hair | nape locks',lambda n:'Nape taper' in n)
c=cols['05_Glasses']
merge_filter(c,'Glasses | dark frame bridge and temples',lambda n:'transparent lens' not in n)
merge_filter(c,'Glasses | transparent lenses',lambda n:'transparent lens' in n)
c=cols['03_Face']
for tag in ['R','L']:
    merge_filter(c,'Face | '+tag+' ear',lambda n:n.startswith('AWB.'+tag+' ear'))
    merge_filter(c,'Face | '+tag+' eye and eyelids',lambda n:n.startswith('AWB.'+tag+' ') and any(s in n for s in ['almond sclera','upper lash rim','lower eyelid','layered iris','eye catchlight','upper eyelid crease']))
merge_filter(c,'Face | brows',lambda n:'shaped eyebrow' in n)
merge_filter(c,'Face | mouth and nose detail',lambda n:any(s in n for s in ['Quiet closed mouth','Lower lip soft highlight','Nostril']))
c=cols['06_Hands']
for tag in ['R','L']:merge_filter(c,'Hand | '+tag+' nails',lambda n:n.startswith('AWB.'+tag+' ') and 'nail' in n)
c=cols['02_Clothes']
for tag in ['R','L']:merge_filter(c,'Clothes | '+tag+' ribbed cuff',lambda n:n.startswith('AWB.'+tag+' ') and 'cuff' in n)
merge_filter(c,'Clothes | layered hood and lining',lambda n:'Hood ' in n)
merge_filter(c,'Clothes | zipper assembly',lambda n:'Detail.zipper' in n)
merge_filter(c,'Clothes | collar pockets and stitched detail',lambda n:n.startswith('AWB.Detail.'))
merge_filter(c,'Clothes | trouser seam and welts',lambda n:'pants pocket' in n or 'pants outer seam' in n)
c=cols['07_Sneakers']
for tag in ['R','L']:
    merge_filter(c,'Shoe | '+tag+' layered sole',lambda n:n.startswith('AWB.'+tag+' ') and any(s in n for s in ['outsole','midsole','sole piping']))
    merge_filter(c,'Shoe | '+tag+' tongue laces and panels',lambda n:n.startswith('AWB.'+tag+' ') and 'continuous sneaker upper' not in n)

# Standard PBR throughout the delivered model, including all cloth vertex color data.
for ob in asset.all_objects:
    if ob.type=='MESH':
        for mat in ob.data.materials:
            if not mat or not mat.use_nodes:continue
            bs=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            if bs:bs.inputs['Subsurface Weight'].default_value=0

bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get();details=[];bounds=[];total=0;zeros=0
for ob in asset.all_objects:
    if ob.type!='MESH':continue
    me=ob.data;me.calc_loop_triangles();tri=len(me.loop_triangles);total+=tri
    zero=sum(t.area<1e-14 for t in me.loop_triangles);zeros+=zero
    bounds.extend([ob.matrix_world@v.co for v in me.vertices])
    details.append({'name':ob.name,'vertices':len(me.vertices),'triangles':tri,'materials':[m.name for m in me.materials if m],'zero_area_triangles':zero})
lo=[min(v[i] for v in bounds) for i in range(3)];hi=[max(v[i] for v in bounds) for i in range(3)]
report={'mesh_objects':len(details),'triangles':total,'bounds_min_m':lo,'bounds_max_m':hi,'dimensions_m':[hi[i]-lo[i] for i in range(3)],'zero_area_triangles':zeros,'texture_images':[{'name':im.name,'size':list(im.size),'packed':bool(im.packed_file)} for im in bpy.data.images if im.name.startswith('AWB.')],'objects':details,'original_scene_preserved':[(s.name,len(s.objects)) for s in bpy.data.scenes if s!=scene]}
with open(os.path.join(OUT,'qa','blend_geometry_report.json'),'w',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False,indent=2)

# Select only the new asset. Studio, original scene, and construction copies are not model exports.
bpy.ops.object.select_all(action='DESELECT')
for ob in asset.all_objects:ob.select_set(True)
bpy.context.view_layer.objects.active=characterroot
glb=os.path.join(OUT,'AnimeWatergunBoy.glb')
bpy.ops.export_scene.gltf(filepath=glb,export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT',export_image_format='AUTO',export_texcoords=True,export_normals=True,export_vertex_color='MATERIAL',export_all_vertex_colors=True,export_cameras=False,export_lights=False,export_extras=True)

scene.camera=cameras['ThreeQuarter'];scene.render.resolution_x=1280;scene.render.resolution_y=1600;scene.render.resolution_percentage=100;scene.cycles.samples=96
scene.render.filepath=os.path.join(OUT,'previews','04_ThreeQuarter.png')
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU'
bpy.ops.object.select_all(action='DESELECT')
characterroot.select_set(True);bpy.context.view_layer.objects.active=characterroot
for a in bpy.context.screen.areas:
    if a.type=='VIEW_3D':
        a.spaces.active.region_3d.view_location=(.015,0,.91);a.spaces.active.region_3d.view_distance=2.5
        a.spaces.active.region_3d.view_rotation=cameras['ThreeQuarter'].rotation_euler.to_quaternion()
        a.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'AnimeWatergunBoy.blend'))
print(json.dumps({'mesh_objects':len(details),'triangles':total,'dimensions_m':report['dimensions_m'],'zero_area_triangles':zeros,'glb_bytes':os.path.getsize(glb)}))
