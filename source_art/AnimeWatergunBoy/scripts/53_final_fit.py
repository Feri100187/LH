from mathutils.bvhtree import BVHTree
import bmesh
# Ease the broad folds back to restrained cloth relief.
for ve in pants.data.vertices:
    p=ve.co;x,y,z=p
    cx,cy,rx,ry,a=profile_leg(p);disp=0
    if .155<z<.890:
        for zi,amp,w,slant,phase in [(.801,.008,.017,.072,.4),(.708,.006,.013,-.105,.2),(.566,.009,.012,.032,.4),(.496,.007,.011,-.043,.2),(.241,.006,.012,.022,.3),(.179,.005,.009,-.021,.2)]:
            d=z-zi-slant*sin(a+phase);disp+=amp*(exp(-(d/w)**2)-.50*exp(-((d-.014)/(w*.75))**2))
        p.x-=sin(a)*disp*.65;p.y+=cos(a)*disp*.65
ca=pants.data.color_attributes.get('GarmentColor');base=(.029,.032,.043)
for c in ca.data:c.color=(*(base[i]+(c.color[i]-base[i])*.35 for i in range(3)),1)

def bvh_object(ob):
    deps=bpy.context.evaluated_depsgraph_get();ev=ob.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles()
    verts=[ev.matrix_world@v.co for v in me.vertices];faces=[tuple(p.vertices) for p in me.loop_triangles]
    tree=BVHTree.FromPolygons(verts,faces,all_triangles=True);ev.to_mesh_clear();return tree

bpy.context.view_layer.update()
tree=bvh_object(jacket)
for ob in list(cols['02_Clothes'].objects):
    if 'shoulder reflective piping' in ob.name:
        bpy.data.objects.remove(ob,do_unlink=True);continue
    if 'raglan shoulder seam' in ob.name or 'pocket opening' in ob.name or 'pocket welt' in ob.name:
        inv=ob.matrix_world.inverted()
        for ve in ob.data.vertices:
            pt,normal,idx,dist=tree.find_nearest(ob.matrix_world@ve.co)
            if pt is not None:ve.co=inv@(pt+normal*.0009)

# Raise the heel counter to meet the ankle, eliminating the detached heel tabs.
CURRENT=cols['07_Sneakers']
for side,cx,cy,rot in [('R',-.219,-.039,-.12),('L',.145,.026,.09)]:
    def fv(x,y,z):return Vector((cx+x*cos(rot)-y*sin(rot),cy+x*sin(rot)+y*cos(rot),z))
    old=bpy.data.objects.get('AWB.'+side+' heel pull tab')
    if old:
        old.location=fv(0,.078,.109)
    rings=[(0,.032,.053,.046,.067),(0,.035,.078,.047,.062),(0,.036,.103,.044,.052),(0,.035,.125,.039,.046),(0,.035,.134,.036,.044)]
    heel=loft(side+' padded heel counter',rings,'ShoeWhite',n=40,per=3,cap=True)
    for ve in heel.data.vertices:ve.co=fv(*ve.co)
    heel.parent=characterroot
    before=bpy.data.objects['AWB.'+side+' shaped sneaker upper']
    # Join in world space but keep the sole-relative model coordinates.
    # Both parts have the same character parent transform.
    upper=unify([before,heel],side+' continuous sneaker upper',.0022,.35,'ShoeWhite')
    bpy.context.view_layer.update()
    stree=bvh_object(upper)
    for ob in list(CURRENT.objects):
        if not ob.name.startswith('AWB.'+side+' '):continue
        if any(k in ob.name for k in ['grey quarter panel','side inset seam','heel pull tab']):
            inv=ob.matrix_world.inverted()
            for ve in ob.data.vertices:
                pt,normal,idx,dist=stree.find_nearest(ob.matrix_world@ve.co)
                if pt is not None:ve.co=inv@(pt+normal*.0012)
    # Continuous padded ankle opening sits beneath the trouser hem.
    rim=[tuple(fv(.037*sin(a),.035-.044*cos(a),.130)) for a in np.linspace(0,2*pi,49)]
    ob=tube(side+' ankle collar piping',rim,.0023,'ShoePale',sides=7,per=0);ob.parent=characterroot

# Nape locks overlap the shortened crown and taper naturally toward the neck.
CURRENT=cols['04_Hair']
for i in range(10):
    x=-.071+i*.0158
    o=lock('Nape taper '+str(i),[(x*.96,.087,1.711),(x,.099,1.681),(x*.90,.085,1.654),(x*.77,.067,1.632+.007*sin(i*2.1))],.0115,'Hair',.002)
    for ve in o.data.vertices:ve.co.x*=1.12;ve.co.z=1.70+(ve.co.z-1.70)*.9
    o.parent=headroot;o.matrix_parent_inverse=old_inverse

# A detail camera looks down enough to inspect both shoes as complete objects.
cameras['ShoesDetail']=camera('ShoesDetail',(1.4,-2.8,.90),(-.03,-.025,.095),.68)
cameras['GripReverse']=camera('GripReverse',(-1.5,-.02,1.6),(.02,-.3,1.21),.73)

bpy.context.view_layer.update()
for ob in [pants,jacket]:
    bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()

# Record centerline-to-prop clearance as a diagnostic, then inspect actual surfaces visually.
deps=bpy.context.evaluated_depsgraph_get();verts=[];faces=[]
for ob in cols['08_Watergun'].objects:
    if ob.type!='MESH':continue
    ev=ob.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();base=len(verts)
    verts.extend([ev.matrix_world@v.co for v in me.vertices]);faces.extend([tuple(base+i for i in p.vertices) for p in me.loop_triangles]);ev.to_mesh_clear()
gun_tree=BVHTree.FromPolygons(verts,faces,all_triangles=True)
contact=[]
for tag,paths in [('R',Rpaths),('L',Lpaths)]:
    for digit,points in paths.items():
        path=catmull(points,10);r={'index':.0084,'middle':.0090,'ring':.0083,'little':.0071,'thumb':.0105}[digit]
        gaps=[]
        for i,p in enumerate(path):
            t=i/(len(path)-1)
            if t<.40:continue
            world=characterroot.matrix_world@T@p
            q,n,ind,dist=gun_tree.find_nearest(world)
            signed=dist if (world-q).dot(n)>=0 else -dist
            radius=r*(1-.34*t)*GUN_SCALE
            gaps.append(signed-radius)
        contact.append({'hand':tag,'digit':digit,'min_centerline_clearance_minus_radius_mm':round(min(gaps)*1000,2),'max_mm':round(max(gaps)*1000,2)})
with open(os.path.join(OUT,'qa','finger_contact_diagnostic.json'),'w',encoding='utf-8') as f:json.dump(contact,f,indent=2)
print(json.dumps(contact))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'AnimeWatergunBoy.blend'))
