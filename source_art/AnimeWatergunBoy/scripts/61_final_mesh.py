import bmesh
budgets={
 'AWB.Jacket continuous shoulder and sleeves':16000,
 'AWB.Pants continuous seat and legs':11000,
 'AWB.Hair sculpted layered crown':10500,
 'AWB.Head sculpted face and skull':10000,
 'AWB.Clothes | layered hood and lining':3000,
 'AWB.Watergun | white receiver and rails':3800,
 'AWB.Shoe | R tongue laces and panels':2800,
 'AWB.Shoe | L tongue laces and panels':2800,
 'AWB.R continuous sneaker upper':3200,
 'AWB.L continuous sneaker upper':3200,
 'AWB.Clothes | zipper assembly':2400,
 'AWB.Glasses | dark frame bridge and temples':2100,
 'AWB.Hair | nape locks':2200,
}
for name,target in budgets.items():
    o=bpy.data.objects[name];o.data.calc_loop_triangles();count=len(o.data.loop_triangles)
    if count>target:
        mod=o.modifiers.new('Final realtime detail budget','DECIMATE');mod.ratio=target/count;apply_mod(o,mod)

validation=[]
for o in asset.all_objects:
    if o.type!='MESH':continue
    # Reset material indices left by volume operations before validating the export.
    max_index=max(0,len(o.data.materials)-1)
    for p in o.data.polygons:
        if p.material_index>max_index:p.material_index=0
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.dissolve_degenerate(bm,dist=.0000001,edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
    o.data.validate(verbose=False,clean_customdata=True);o.data.validate_material_indices();o.data.update();o.data.calc_loop_triangles()
    validation.append({'name':o.name,'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles),'zero_area_triangles':sum(t.area<1e-14 for t in o.data.loop_triangles),'materials':[m.name for m in o.data.materials if m]})

bpy.context.view_layer.update();bound=[o.matrix_world@v.co for o in asset.all_objects if o.type=='MESH' for v in o.data.vertices]
lo=[min(v[i] for v in bound) for i in range(3)];hi=[max(v[i] for v in bound) for i in range(3)]
report={'mesh_objects':len(validation),'triangles':sum(o['triangles'] for o in validation),'zero_area_triangles':sum(o['zero_area_triangles'] for o in validation),'bounds_min_m':lo,'bounds_max_m':hi,'dimensions_m':[hi[i]-lo[i] for i in range(3)],'texture_images':[{'name':im.name,'size':list(im.size),'packed':bool(im.packed_file)} for im in bpy.data.images if im.name.startswith('AWB.')],'objects':validation,'original_scene_preserved':[(s.name,len(s.objects)) for s in bpy.data.scenes if s!=scene]}
with open(os.path.join(OUT,'qa','blend_geometry_report.json'),'w',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
bpy.ops.object.select_all(action='DESELECT')
for o in asset.all_objects:o.select_set(True)
bpy.context.view_layer.objects.active=characterroot
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'AnimeWatergunBoy.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT',export_image_format='AUTO',export_texcoords=True,export_normals=True,export_vertex_color='MATERIAL',export_all_vertex_colors=True,export_cameras=False,export_lights=False,export_extras=True)
scene.camera=cameras['ThreeQuarter']
bpy.ops.object.select_all(action='DESELECT');characterroot.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'AnimeWatergunBoy.blend'))
print(json.dumps({k:report[k] for k in ['mesh_objects','triangles','zero_area_triangles','dimensions_m']}))
