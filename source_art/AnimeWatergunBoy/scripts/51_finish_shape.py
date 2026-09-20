import bmesh
CURRENT=cols['04_Hair']
# Keep an editable source for the clump-based crown, outside the exported collection.
sources=collection('AWB | Hair construction source')
sources.hide_render=True
for ob in list(CURRENT.objects):
    cp=ob.copy();cp.data=ob.data.copy();sources.objects.link(cp);cp.name=ob.name+'.source';cp.hide_render=True;cp.hide_set(True)
merge=[o for o in CURRENT.objects if 'Bangs' not in o.name and 'Natural crown tuft' not in o.name]
crown=unify(merge,'Hair sculpted layered crown',.00135,.24,'HairMid')
sources.hide_viewport=True

# A slightly shorter visible neck and a small head tilt remove the mannequin stance.
headroot=bpy.data.objects.new('AWB.HEAD_ROOT',None);cols['09_Pose'].objects.link(headroot);headroot.location=(0,0,1.690)
bpy.context.view_layer.update()
for key in ['03_Face','04_Hair','05_Glasses']:
    for ob in cols[key].objects:
        ob.parent=headroot;ob.matrix_parent_inverse=headroot.matrix_world.inverted()
headroot.location.x=-.010;headroot.location.z-=.018
headroot.rotation_euler.y=-.032;headroot.rotation_euler.z=-.045

# Scale the toy and the gripping anatomy together. The forearms are adjusted to the new wrists.
GUN_SCALE=.84
pivot=Vector((.030,-.337,1.265));offset=Vector((0,0,-.045))
root=bpy.data.objects['AWB.WATERGUN_ROOT']
bpy.context.view_layer.update()
T=Matrix.Translation(pivot+offset) @ Matrix.Diagonal((GUN_SCALE,GUN_SCALE,GUN_SCALE,1)) @ Matrix.Translation(-pivot)
root.matrix_world=T@root.matrix_world
for ob in cols['06_Hands'].objects:ob.matrix_world=T@ob.matrix_world
oldW={'R':Vector((-.179,-.306,1.205)),'L':Vector((.298,-.264,1.201))}
delta={tag:(T@p)-p for tag,p in oldW.items()}
for ob in cols['02_Clothes'].objects:
    if 'continuous shoulder' in ob.name:
        for ve in ob.data.vertices:
            p=ve.co;x,y,z=p
            # Clean rounded shoulder slope.
            if abs(x+.012)>.12 and z>1.415:
                zmax=1.489-.155*abs(x+.012)
                p.z-=max(0,p.z-zmax)*.82
            # Arm regions stay separate from the front/back torso field.
            if z>1.115 and (abs(x)>.216 or (y<-.15 and abs(x)>.12)):
                tag='R' if x<0 else 'L';d=delta[tag]
                lower=max(0,min(1,(-y-.10)/.19))
                upper=max(0,min(1,(1.39-z)/.18))
                p.x+=d.x*lower;p.y+=d.y*lower;p.z+=d.z*max(lower,upper)
    elif 'cuff' in ob.name:
        tag='R' if ob.name.startswith('AWB.R') else 'L';center=oldW[tag]
        for ve in ob.data.vertices:ve.co=center+(ve.co-center)*.89+delta[tag]

# The undershirt is a clean continuous strip with a shallow cloth wave.
old=bpy.data.objects.get('AWB.White undershirt hem')
if old:bpy.data.objects.remove(old,do_unlink=True)
CURRENT=cols['02_Clothes']
loft('White undershirt hem',[(.012,.014,.966,.162,.095),(.012,.014,.976,.164,.096),(.012,.014,.986,.162,.094)],'Shirt',n=64,per=2,fold=lambda t,a,z:.0007*sin(a*5))

# More readable charcoal values and lower-gloss molded plastic.
for key,color in [('Jacket',(.029,.031,.039)),('JacketPanel',(.038,.041,.052)),('Pants',(.029,.031,.041))]:
    mat=M[key];bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Base Color'].default_value=(*color,1);mat.diffuse_color=(*color,1)
for key in ['GunWhite','GunPanel','ShoeWhite','Laces']:
    bs=next(n for n in M[key].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    col=bs.inputs['Base Color'].default_value
    mult=.63 if key=='GunWhite' else .86
    bs.inputs['Base Color'].default_value=(col[0]*mult,col[1]*mult,col[2]*mult,1)
    bs.inputs['Specular IOR Level'].default_value=.22

# Consistent studio colors; a larger neutral source gives gentle fabric shading.
scene.view_settings.view_transform='Khronos PBR Neutral';scene.view_settings.look='None';scene.view_settings.exposure=.10
bs=next(n for n in M['Backdrop'].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bs.inputs['Emission Strength'].default_value=.10
bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Strength'].default_value=.28
bpy.data.objects['AWB.Key softbox'].data.energy=480
bpy.data.objects['AWB.Key softbox'].data.size=3.1
bpy.data.objects['AWB.Front fill'].data.energy=125
bpy.data.objects['AWB.Hair and shoulder rim'].data.energy=290

# Actual silhouette-preserving realtime budget. Original crown sources are excluded from export.
budgets={
 'AWB.Jacket continuous shoulder and sleeves':26000,
 'AWB.Pants continuous seat and legs':19000,
 'AWB.Right hand rear grip':7500,
 'AWB.Left hand foregrip support':7500,
 'AWB.Head sculpted face and skull':14000,
 'AWB.Hair sculpted layered crown':14000
}
for name,target in budgets.items():
    ob=bpy.data.objects[name];ob.data.calc_loop_triangles();num=len(ob.data.loop_triangles)
    if num>target:
        mod=ob.modifiers.new('Game mesh budget','DECIMATE');mod.ratio=target/num;apply_mod(ob,mod)

# The face and hands share a natural peach complexion while their shading stays gentle.
for key in ['Skin','SkinLight','Nails']:
    bs=next(n for n in M[key].node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Specular IOR Level'].default_value=.22

bpy.context.view_layer.update()
# Bring the soles to the origin plane; the four render cameras keep the entire figure in frame.
characterroot=bpy.data.objects.new('AWB.CHARACTER_ROOT',None);cols['09_Pose'].objects.link(characterroot)
bpy.context.view_layer.update()
for ob in list(asset.all_objects):
    if ob!=characterroot and ob.parent is None:
        ob.parent=characterroot;ob.matrix_parent_inverse=characterroot.matrix_world.inverted()
characterroot.location.z=-.0118
characterroot['asset_scale']='meters; sole at Z=0; full height approximately 1.81 m'
characterroot['pose']='Right hand rear pistol grip, left hand foregrip support; authored static pose'
characterroot['reference_priority']='holding-pose image > face close-up > orthographic supplementary views'
characterroot['rig_status']='Unrigged editable meshes; pose controls are separate parent empties'

scene.camera=cameras['ThreeQuarter']
for a in bpy.context.screen.areas:
    if a.type=='VIEW_3D':
        a.spaces.active.region_3d.view_location=(.02,0,.91);a.spaces.active.region_3d.view_distance=2.5
        a.spaces.active.region_3d.view_rotation=cameras['ThreeQuarter'].rotation_euler.to_quaternion()
scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'AnimeWatergunBoy.blend'))
print('Figure refined and reduced for realtime use')
