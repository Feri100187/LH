import bpy,json,os
from mathutils import Vector
out='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919'
os.makedirs(out+'/qa',exist_ok=True)
scene=bpy.data.scenes['AWB_Presentation'];bpy.context.window.scene=scene
asset=bpy.data.collections['AWB | Anime watergun boy']
data={'version':bpy.app.version_string,'source':bpy.data.filepath,'scenes':[s.name for s in bpy.data.scenes],'objects':[]}
for o in asset.all_objects:
 if o.type!='MESH':continue
 vv=[o.matrix_world@v.co for v in o.data.vertices];o.data.calc_loop_triangles()
 data['objects'].append({'name':o.name,'verts':len(vv),'tris':len(o.data.loop_triangles),'bounds':[[min(v[i] for v in vv) for i in range(3)],[max(v[i] for v in vv) for i in range(3)]],'modifiers':[(m.name,m.type) for m in o.modifiers],'groups':[v.name for v in o.vertex_groups]})
for type_name,prop in [('Constraint','type'),('Constraint','owner_space'),('Object','rotation_mode'),('Armature','display_type'),('FModifier','type'),('Keyframe','interpolation'),('NlaStrip','blend_type'),('NlaStrip','extrapolation'),('RenderSettings','engine'),('ImageFormatSettings','file_format')]:
 try:data[type_name+'.'+prop]=[i.identifier for i in getattr(bpy.types,type_name).bl_rna.properties[prop].enum_items]
 except Exception as e:data[type_name+'.'+prop]=str(e)
data['mode_enums']=[i.identifier for i in bpy.ops.object.mode_set.get_rna_type().properties['mode'].enum_items]
data['camera_type_enums']=[i.identifier for i in bpy.types.Camera.bl_rna.properties['type'].enum_items]
data['bone_inherit_scale']=[i.identifier for i in bpy.types.Bone.bl_rna.properties['inherit_scale'].enum_items]
data['export_animation_enums']={k:[i.identifier for i in p.enum_items] for k,p in bpy.ops.export_scene.gltf.get_rna_type().properties.items() if p.type=='ENUM' and ('anim' in k or 'skin' in k)}
json.dump(data,open(out+'/qa/source_inspection.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print(json.dumps(data,ensure_ascii=False))
