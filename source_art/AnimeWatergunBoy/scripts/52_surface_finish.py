import bmesh
CURRENT=cols['04_Hair']
# Close the scalp before volume union; open construction boundaries must never leave holes.
old=bpy.data.objects['AWB.Hair sculpted layered crown'];old_parent=old.parent;old_inverse=old.matrix_parent_inverse.copy()
bpy.data.objects.remove(old,do_unlink=True)
parts=[]
for src in sources.objects:
    if 'Bangs' in src.name or 'Natural crown tuft' in src.name:continue
    cp=src.copy();cp.data=src.data.copy();CURRENT.objects.link(cp);cp.name=src.name.replace('.source','.sculpt');cp.hide_render=False;cp.hide_set(False)
    bm=bmesh.new();bm.from_mesh(cp.data)
    boundary=[e for e in bm.edges if e.is_boundary]
    if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(cp.data);bm.free()
    parts.append(cp)
crown=unify(parts,'Hair sculpted layered crown',.00115,.16,'HairMid')
crown.parent=old_parent;crown.matrix_parent_inverse=old_inverse

# Tailored shoulder slope and sculpted tension/compression folds in the cloth itself.
jacket=bpy.data.objects['AWB.Jacket continuous shoulder and sleeves']
vg=jacket.vertex_groups.new(name='Shoulder smoothing')
for ve in jacket.data.vertices:
    x,y,z=ve.co
    if abs(x)>.150 and z>1.285:
        t=max(0,min(1,(z-1.285)/.10))
        newx=math.copysign(.15+(abs(x)-.15)*.70,x)
        ve.co.x=x+(newx-x)*t
    if z>1.375 and abs(x)>.125:
        vg.add([ve.index],max(0,min(1,(z-1.375)/.05)),'REPLACE')
sm=jacket.modifiers.new('Rounded fabric shoulder transition','SMOOTH');sm.factor=.65;sm.iterations=8;sm.vertex_group=vg.name;apply_mod(jacket,sm)

def profile_leg(v):
    rings=np.array(pr if v.x<.02 else pl)
    x,y,z=v
    cx=float(np.interp(z,rings[:,2],rings[:,0]));cy=float(np.interp(z,rings[:,2],rings[:,1]));rx=float(np.interp(z,rings[:,2],rings[:,3]));ry=float(np.interp(z,rings[:,2],rings[:,4]))
    a=math.atan2((x-cx)/rx,-(y-cy)/ry)
    return cx,cy,rx,ry,a

pants=bpy.data.objects['AWB.Pants continuous seat and legs'];paint={}
for ve in pants.data.vertices:
    p=ve.co;x,y,z=p
    cx,cy,rx,ry,a=profile_leg(p)
    displacement=0;shade=0
    if .155<z<.890:
        for zi,amp,w,slant,phase in [(.801,.008,.017,.072,.4),(.708,.006,.013,-.105,.2),(.566,.009,.012,.032,.4),(.496,.007,.011,-.043,.2),(.241,.006,.012,.022,.3),(.179,.005,.009,-.021,.2)]:
            d=z-zi-slant*sin(a+phase)
            ridge=exp(-(d/w)**2);trough=exp(-((d-.014)/(w*.75))**2)
            displacement+=amp*(ridge-.50*trough)
            shade+=.37*ridge-.22*trough
        p.x+=sin(a)*displacement;p.y-=cos(a)*displacement
    paint[ve.index]=1+shade+.055*sin(a*3+z*7)

def painted_cloth(ob,name,base,values):
    mat=material(name,base,.9)
    bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Specular IOR Level'].default_value=.16
    ca=ob.data.color_attributes.get('GarmentColor') or ob.data.color_attributes.new(name='GarmentColor',type='FLOAT_COLOR',domain='CORNER')
    for i,loop in enumerate(ob.data.loops):
        factor=values.get(loop.vertex_index,1)
        ca.data[i].color=(*(max(.001,min(1,c*factor)) for c in base),1)
    ob.data.color_attributes.active_color=ca
    attr=mat.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='GarmentColor'
    mat.node_tree.links.new(attr.outputs['Color'],bs.inputs['Base Color'])
    ob.data.materials.clear();ob.data.materials.append(mat)
painted_cloth(pants,'Pants painted fold values',(.029,.032,.043),paint)

paint={}
for ve in jacket.data.vertices:
    p=ve.co;x,y,z=p;shade=0
    # Broad diagonal tension folds below the pockets and at the back waist.
    if z<1.27 and abs(y)<.15:
        a=math.atan2(x/.172,-(y-.017)/.105);disp=0
        for zi,amp,w,slant,phase in [(1.063,.006,.012,.038,.3),(1.112,.005,.017,-.04,1.8),(1.198,.004,.020,.06,.2)]:
            d=z-zi-slant*sin(2*a+phase)
            ridge=exp(-(d/w)**2);trough=exp(-((d-.013)/(w*.7))**2)
            disp+=amp*(ridge-.40*trough);shade+=.28*ridge-.20*trough
        p.x+=sin(a)*disp;p.y-=cos(a)*disp
    shade+=.05*sin(x*12+z*6)
    paint[ve.index]=1+shade
painted_cloth(jacket,'Jacket painted fold values',(.030,.032,.041),paint)

# Re-evaluate normals after edits, preserving the original sharp plastic outlines.
for ob in [jacket,pants,crown]:
    bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()

# Lift the background value uniformly without washing out the character.
bs=next(n for n in M['Backdrop'].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bs.inputs['Emission Strength'].default_value=.47
scene.view_settings.exposure=0
bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Strength'].default_value=.30
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'AnimeWatergunBoy.blend'))
print('Closed hair crown, directional fabric folds, portable painted vertex colors complete')
