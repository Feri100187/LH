import bmesh
from mathutils.bvhtree import BVHTree
CURRENT=cols['07_Sneakers']
for side,cx,cy,rot in [('R',-.219,-.039,-.12),('L',.145,.026,.09)]:
    def fv(x,y,z):return Vector((cx+x*cos(rot)-y*sin(rot),cy+x*sin(rot)+y*cos(rot),z))
    for ob in list(CURRENT.objects):
        if ob.name.startswith('AWB.'+side+' ') and any(s in ob.name for s in ['continuous sneaker upper','grey quarter panel','side inset seam','heel pull tab']):bpy.data.objects.remove(ob,do_unlink=True)
    v=[];f=[];N=64;K=17
    for k in range(K):
        t=k/(K-1);sc=cos(t*pi/2)*.98
        for j in range(N):
            a=2*pi*j/N;yy=-.031+.135*cos(a);width=.045+.012*((1-cos(a))/2)
            xx=width*sin(a)*sc;yy=-.031+(yy+.031)*sc
            height=.036+.051*exp(-((yy-.025)/.058)**2)
            zz=.051+sin(t*pi/2)*height
            v.append(tuple(fv(xx,yy,zz)))
    for k in range(K-1):
        for j in range(N):a=k*N+j;b=k*N+(j+1)%N;f.append((a,b,b+N,a+N))
    f.append(tuple(reversed(range(N))));f.append(tuple((K-1)*N+j for j in range(N)))
    toe=mesh(side+' closed vamp',v,f,'ShoeWhite')
    bm=bmesh.new();bm.from_mesh(toe.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000005);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(toe.data);bm.free()
    heel=loft(side+' closed heel counter',[(0,.032,.053,.046,.067),(0,.035,.078,.047,.062),(0,.036,.103,.044,.052),(0,.035,.125,.039,.046),(0,.035,.134,.036,.044)],'ShoeWhite',n=48,per=3)
    for ve in heel.data.vertices:ve.co=fv(*ve.co)
    upper=unify([toe,heel],side+' continuous sneaker upper',.0017,.26,'ShoeWhite');upper.parent=characterroot
    bpy.context.view_layer.update();stree=bvh_object(upper)
    def project_local(p,offset=.0015):
        world=characterroot.matrix_world@p;q,n,idx,d=stree.find_nearest(world)
        return characterroot.matrix_world.inverted()@(q+n*offset)
    for sign in [-1,1]:
        poly=[(.012,.071),(-.004,.100),(-.036,.091),(-.082,.067),(-.116,.061),(-.087,.077),(-.045,.091),(.040,.105),(.078,.075)]
        vv=[tuple(project_local(fv(sign*(.050 if yy<.015 else .042),yy,zz),.0015)) for yy,zz in poly]
        panel=mesh(side+' grey quarter panel '+str(sign),vv,[tuple(range(len(vv)))],'ShoePale',smooth=False);panel.parent=characterroot
        so=panel.modifiers.new('Sewn panel thickness','SOLIDIFY');so.thickness=.001
        for j in range(3):
            yy=-.057+j*.030
            path=[project_local(fv(sign*.049,yy-.011,.064),.002),project_local(fv(sign*.047,yy,.081),.002),project_local(fv(sign*.041,yy+.018,.092),.002)]
            ob=tube(side+' side inset seam '+str(sign)+' '+str(j),path,.00085,'ShoeGrey',sides=6,per=3);ob.parent=characterroot
    tabpts=[project_local(fv(0,.085,.090),.0018),project_local(fv(0,.082,.107),.0018),project_local(fv(0,.078,.126),.0018)]
    tab=tube(side+' stitched heel tab',tabpts,.004,'ShoeGrey',sides=8,per=3);tab.parent=characterroot
    for ob in list(CURRENT.objects):
        if ob.name.startswith('AWB.'+side+' ') and any(s in ob.name for s in ['crossed lace','tied lace loop','lace end','lace eyestay','padded tongue']):
            for ve in ob.data.vertices:ve.co.z+=.007

# Closed union of the actual exported gun parts, used only for contact fitting.
deps=bpy.context.evaluated_depsgraph_get();verts=[];faces=[]
for ob in cols['08_Watergun'].objects:
    if ob.type!='MESH':continue
    ev=ob.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();start=len(verts)
    verts.extend([tuple(ev.matrix_world@v.co) for v in me.vertices]);faces.extend([tuple(start+i for i in tri.vertices) for tri in me.loop_triangles]);ev.to_mesh_clear()
CURRENT=cols['06_Hands'];clear_col(CURRENT)
collider=mesh('temporary gun contact solid',verts,faces,'GunWhite',studio)
bm=bmesh.new();bm.from_mesh(collider.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
edges=[e for e in bm.edges if e.is_boundary]
if edges:bmesh.ops.holes_fill(bm,edges=edges,sides=0)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(collider.data);bm.free()
collider=unify([collider],'temporary gun contact solid',.00095,.34,'GunWhite')
collider.hide_render=True
bpy.context.view_layer.update();contact_tree=bvh_object(collider)

def fit_point(point,radius,margin=.00115):
    p=point.copy()
    for _ in range(5):
        q,n,idx,dist=contact_tree.find_nearest(p)
        signed=dist if (p-q).dot(n)>=0 else -dist
        if signed>=radius+margin:break
        p=q+n*(radius+margin)
    return p

fitpaths={};hand_results=[]
worldT=characterroot.matrix_world@T
for tag,paths in [('R',Rpaths),('L',Lpaths)]:
    pieces=[]
    if tag=='R':
        palm=sweep('R palm',[(-.179,-.306,1.205),(-.155,-.333,1.211),(-.129,-.355,1.213),(-.093,-.367,1.210)],[.025,.029,.035,.032],[.028,.030,.023,.018],'Skin',n=24,per=4)
    else:
        palm=sweep('L palm',[(.298,-.264,1.201),(.296,-.299,1.204),(.291,-.343,1.207),(.289,-.369,1.216)],[.024,.029,.043,.041],[.026,.025,.022,.017],'Skin',n=24,per=4)
    for ve in palm.data.vertices:ve.co=worldT@ve.co
    pieces.append(palm)
    for digit,ps in paths.items():
        r0={'index':.0084,'middle':.0090,'ring':.0083,'little':.0071,'thumb':.0105}[digit]
        path=[worldT@p for p in catmull(ps,10)];radii=[r0*(1-.34*i/(len(path)-1))*GUN_SCALE for i in range(len(path))]
        # Project the curved centerline, smooth, and project again; no tip may end inside the shell.
        for iteration in range(4):
            path=[fit_point(p,radii[i]) if i>2 else p for i,p in enumerate(path)]
            if iteration<3:
                path=[path[0]]+[path[i]*.70+(path[i-1]+path[i+1])*.15 for i in range(1,len(path)-1)]+[path[-1]]
        fitpaths[(tag,digit)]=(path,radii)
        pieces.append(tube(tag+' fitted '+digit,path,r0,'Skin',sides=12,per=0,radii=radii))
    hand=unify(pieces,'Right hand rear grip' if tag=='R' else 'Left hand foregrip support',.00115,.35,'Skin')
    # Contact projection operates on the final skin surface, not only centerline diagnostics.
    corrected=0
    for ve in hand.data.vertices:
        q,n,idx,dist=contact_tree.find_nearest(ve.co)
        signed=dist if (ve.co-q).dot(n)>=0 else -dist
        if signed<.00060:ve.co=q+n*.00060;corrected+=1
    hand.data.update()
    hand.data.calc_loop_triangles()
    if len(hand.data.loop_triangles)>9500:
        mod=hand.modifiers.new('Hand realtime budget','DECIMATE');mod.ratio=9500/len(hand.data.loop_triangles);apply_mod(hand,mod)
    hand.parent=characterroot;hand.matrix_parent_inverse=characterroot.matrix_world.inverted()
    hand['anatomy']=('RIGHT rear pistol grip' if tag=='R' else 'LEFT foregrip support')+'; 5 fitted digits'
    hand_results.append({'hand':tag,'surface_vertices_corrected':corrected})
    bpy.context.view_layer.update()
    htree=bvh_object(hand)
    for digit in paths:
        path,radii=fitpaths[(tag,digit)];idx=int(len(path)*.80)
        p=path[idx];tan=(path[min(idx+1,len(path)-1)]-path[max(0,idx-1)]).normalized()
        normal=Vector((0,-1,.1)) if tag=='L' else Vector((0,1,.1))
        normal=(normal-tan*normal.dot(tan)).normalized();across=tan.cross(normal).normalized()
        center=p+normal*radii[idx];q,n,ii,dist=htree.find_nearest(center);center=q+n*.00025
        vv=[tuple(center+n*.0001)]
        for j in range(25):
            a=2*pi*j/24;vv.append(tuple(center+across*(cos(a)*radii[idx]*.48)+tan*(sin(a)*.004)))
        nail=mesh(tag+' '+digit+' fitted nail',vv,[(0,j+1,j+2) for j in range(24)],'Nails');nail.parent=characterroot;nail.matrix_parent_inverse=characterroot.matrix_world.inverted()

contact_metrics=[]
for tag in ['R','L']:
    hand=bpy.data.objects['AWB.Right hand rear grip' if tag=='R' else 'AWB.Left hand foregrip support']
    bpy.context.view_layer.update();distances=[]
    for ve in hand.data.vertices:
        p=hand.matrix_world@ve.co;q,n,idx,dist=contact_tree.find_nearest(p);signed=dist if (p-q).dot(n)>=0 else -dist;distances.append(signed)
    contact_metrics.append({'hand':tag,'min_final_skin_vertex_clearance_mm':round(min(distances)*1000,3),'vertices_inside_collider':sum(d<0 for d in distances),'vertices_within_2mm':sum(0<=d<.002 for d in distances)})
with open(os.path.join(OUT,'qa','hand_contact_checked.json'),'w',encoding='utf-8') as f:json.dump({'method':'Final hand surface against closed voxel union of actual gun meshes, 0.95 mm voxel; does not prove arbitrary future poses','results':contact_metrics},f,indent=2)
print(json.dumps(contact_metrics))
bpy.data.objects.remove(collider,do_unlink=True)
scene.camera=cameras['ThreeQuarter'];bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'AnimeWatergunBoy.blend'))
