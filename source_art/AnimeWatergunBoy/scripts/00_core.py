import bpy, math, os, json, random
import numpy as np
from mathutils import Vector, Matrix
from math import sin, cos, pi, exp, sqrt

OUT = r'D:\a\xiang_mu\LH\source_art\AnimeWatergunBoy'
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(OUT, 'previews'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'qa'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'textures'), exist_ok=True)
random.seed(23)

# Preserve every pre-existing scene and collection.
if 'AWB_Presentation' in bpy.data.scenes:
    scene = bpy.data.scenes['AWB_Presentation']
else:
    scene = bpy.data.scenes.new('AWB_Presentation')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

def collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        (parent.children if parent else scene.collection.children).link(c)
    return c

asset = collection('AWB | Anime watergun boy')
cols = {k:collection('AWB.'+k, asset) for k in ['01_Body','02_Clothes','03_Face','04_Hair','05_Glasses','06_Hands','07_Sneakers','08_Watergun','09_Pose']}
studio = collection('AWB | Preview studio')
CURRENT = cols['01_Body']

def clear_col(c):
    for o in list(c.objects):
        bpy.data.objects.remove(o, do_unlink=True)

def put(o, c=None):
    c = c or CURRENT
    for old in list(o.users_collection): old.objects.unlink(o)
    c.objects.link(o)
    return o

def material(name, color, rough=.5, metal=0, alpha=1):
    name='AWB.M.'+name
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes=True
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=(*color,alpha)
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metal
    bs.inputs['Alpha'].default_value=alpha
    m.diffuse_color=(*color,alpha)
    return m

M={}
for n,c,r,mt in [
    ('Skin',(0.68,0.395,0.25),.63,0),('SkinLight',(0.76,.455,.30),.62,0),
    ('EarInner',(.46,.205,.125),.68,0),('Lips',(.38,.145,.105),.72,0),('Nails',(.82,.52,.38),.55,0),
    ('Jacket',(.022,.025,.033),.76,0),('JacketPanel',(.029,.033,.043),.72,0),('JacketSeam',(.013,.016,.023),.74,0),
    ('RibKnit',(.011,.014,.019),.84,0),('HoodInside',(.008,.010,.015),.82,0),
    ('Pants',(.023,.025,.034),.84,0),('PantsSeam',(.012,.014,.021),.82,0),
    ('Shirt',(.68,.69,.73),.85,0),('Zipper',(.22,.26,.31),.33,.65),
    ('Hair',(.009,.011,.016),.48,0),('HairMid',(.017,.019,.025),.46,0),('HairLit',(.028,.027,.032),.5,0),('HairLine',(.005,.006,.01),.65,0),
    ('Frame',(.011,.015,.022),.3,.25),('EyeWhite',(.78,.78,.73),.32,0),('Lash',(.025,.015,.020),.7,0),
    ('Iris',(.075,.103,.16),.38,0),('IrisLight',(.20,.245,.34),.4,0),('Pupil',(.008,.012,.023),.38,0),('Glint',(.96,.97,1),.2,0),
    ('ShoeWhite',(.77,.78,.80),.62,0),('ShoeGrey',(.35,.38,.43),.68,0),('ShoePale',(.57,.60,.64),.6,0),('Sole',(.62,.65,.68),.82,0),('Outsole',(.19,.22,.26),.85,0),('Laces',(.88,.87,.82),.84,0),
    ('GunWhite',(.82,.86,.93),.28,0),('GunPanel',(.58,.64,.73),.33,0),('GunBlue',(.008,.075,.77),.25,0),('GunBlueLight',(.018,.17,.95),.23,0),('GunBlueDark',(.005,.037,.37),.35,0),
    ('GunOrange',(.97,.165,.009),.3,0),('GunOrangeLight',(1,.27,.017),.28,0),('GunBore',(.15,.033,.009),.5,0),
    ('GunGreen',(.20,.67,.025),.3,0),('GunGreenLight',(.34,.87,.04),.29,0),('GunGreenDark',(.087,.35,.015),.4,0),('Backdrop',(.84,.87,.89),.82,0)
]: M[n]=material(n,c,r,mt)
M['Glass']=material('Glass',(.53,.68,.8),.16,0,.09)
glassbs=next(n for n in M['Glass'].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
glassbs.inputs['IOR'].default_value=1.46
for k in ['Skin','SkinLight']:
    bs=next(n for n in M[k].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Subsurface Weight'].default_value=.035

def mesh(name, verts, faces, mat, c=None, smooth=True, uv=None):
    me=bpy.data.meshes.new('AWB.'+name+'.mesh')
    me.from_pydata(verts, [], faces); me.update()
    ob=bpy.data.objects.new('AWB.'+name, me)
    (c or CURRENT).objects.link(ob)
    if mat: me.materials.append(M[mat] if isinstance(mat,str) else mat)
    for p in me.polygons: p.use_smooth=smooth
    if uv:
        layer=me.uv_layers.new(name='UVMap')
        for p in me.polygons:
            for li in p.loop_indices: layer.data[li].uv=uv[me.loops[li].vertex_index]
    return ob

def subdiv(o, level=1):
    m=o.modifiers.new('Surface refinement','SUBSURF');m.levels=level;m.render_levels=level
    return o

def bevel(o, amount=.003, segments=2):
    b=o.modifiers.new('Manufactured edge radius','BEVEL');b.width=amount;b.segments=segments
    return o

def apply_mod(o,m):
    bpy.context.view_layer.objects.active=o
    o.select_set(True)
    bpy.ops.object.modifier_apply(modifier=m.name)
    o.select_set(False)

def catmull(pts, per=6):
    p=[Vector(x) for x in pts]; out=[]
    for i in range(len(p)-1):
        a=p[max(i-1,0)];b=p[i];c=p[i+1];d=p[min(i+2,len(p)-1)]
        for j in range(per):
            t=j/per
            out.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
    return out+[p[-1]]

def tube(name, pts, radius, mat, c=None, sides=10, per=5, radii=None, cap=True):
    path=catmull(pts,per) if per else [Vector(p) for p in pts]
    v=[];f=[];uv=[];old=None
    for i,p in enumerate(path):
        tangent=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
        ref=Vector((0,1,0)) if abs(tangent.y)<.9 else Vector((1,0,0))
        u=tangent.cross(ref).normalized()
        if old and u.dot(old)<0:u=-u
        old=u;w=tangent.cross(u).normalized()
        t=i/(len(path)-1)
        r=radius if radii is None else float(np.interp(t,np.linspace(0,1,len(radii)),radii))
        for j in range(sides):
            a=2*pi*j/sides
            v.append(tuple(p+r*(cos(a)*u+sin(a)*w)));uv.append((j/sides,t))
    for i in range(len(path)-1):
        for j in range(sides):
            n=i*sides+j; nj=i*sides+(j+1)%sides
            f.append((n,nj,nj+sides,n+sides))
    if cap:
        f.append(tuple(reversed(range(sides))));f.append(tuple((len(path)-1)*sides+j for j in range(sides)))
    return mesh(name,v,f,mat,c,uv=uv)

def loft(name, rings, mat, c=None, n=48, per=3, fold=None, cap=True):
    # Rings: x, y, z, radius_x, radius_y. Anatomical/clothing cross-sections, not primitives.
    a=np.array(rings,float); v=[];f=[];uv=[]
    levels=(len(rings)-1)*per+1
    for k in range(levels):
        t=k/(levels-1);q=t*(len(rings)-1);i=min(int(q),len(rings)-2);s=q-i
        p0=a[max(i-1,0)];p1=a[i];p2=a[i+1];p3=a[min(i+2,len(a)-1)]
        p=.5*(2*p1+(-p0+p2)*s+(2*p0-5*p1+4*p2-p3)*s*s+(-p0+3*p1-3*p2+p3)*s*s*s)
        x,y,z,rx,ry=p
        for j in range(n):
            ang=2*pi*j/n
            d=fold(t,ang,z) if fold else 0
            v.append((x+(rx+d)*sin(ang),y-(ry+d)*cos(ang),z));uv.append((j/n,t))
    for k in range(levels-1):
        for j in range(n):
            a0=k*n+j;b=k*n+(j+1)%n
            f.append((a0,b,b+n,a0+n))
    if cap:
        f.append(tuple(reversed(range(n))));f.append(tuple((levels-1)*n+j for j in range(n)))
    return mesh(name,v,f,mat,c,uv=uv)

def sweep(name, pts, widths, depths, mat, c=None, n=24, per=4, fold=None):
    path=catmull(pts,per);v=[];f=[];uv=[]
    for i,p in enumerate(path):
        t=i/(len(path)-1)
        tangent=(path[min(i+1,len(path)-1)]-path[max(i-1,0)]).normalized()
        u=tangent.cross(Vector((0,1,0))).normalized();w=tangent.cross(u).normalized()
        rx=float(np.interp(t,np.linspace(0,1,len(widths)),widths));ry=float(np.interp(t,np.linspace(0,1,len(depths)),depths))
        for j in range(n):
            a=2*pi*j/n;d=fold(t,a) if fold else 0
            v.append(tuple(p+(rx+d)*cos(a)*u+(ry+d)*sin(a)*w));uv.append((j/n,t))
    for i in range(len(path)-1):
        for j in range(n):
            a=i*n+j;b=i*n+(j+1)%n;f.append((a,b,b+n,a+n))
    f.append(tuple(reversed(range(n))));f.append(tuple((len(path)-1)*n+j for j in range(n)))
    return mesh(name,v,f,mat,c,uv=uv)

def box(name, loc, size, mat, edge=.002, c=None):
    x,y,z=[d/2 for d in size]
    v=[(-x,-y,-z),(-x,-y,z),(-x,y,-z),(-x,y,z),(x,-y,-z),(x,-y,z),(x,y,-z),(x,y,z)]
    f=[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)]
    o=mesh(name,v,f,mat,c,smooth=False);o.location=loc
    if edge:bevel(o,edge,3)
    return o

def profile_xz(name, poly, y, depth, mat, edge=.002, c=None):
    v=[(x,y-depth/2,z) for x,z in poly]+[(x,y+depth/2,z) for x,z in poly]
    n=len(poly);f=[tuple(reversed(range(n))),tuple(n+i for i in range(n))]
    for i in range(n):j=(i+1)%n;f.append((i,j,j+n,i+n))
    o=mesh(name,v,f,mat,c,False)
    if edge:bevel(o,edge,3)
    return o

def lathe_x(name, rings, y,z,mat,c=None,n=48):
    v=[];f=[]
    for x,r in rings:
        for j in range(n):a=2*pi*j/n;v.append((x,y+r*cos(a),z+r*sin(a)))
    for i in range(len(rings)-1):
        for j in range(n):a=i*n+j;b=i*n+(j+1)%n;f.append((a,b,b+n,a+n))
    f.append(tuple(reversed(range(n))));f.append(tuple((len(rings)-1)*n+j for j in range(n)))
    return mesh(name,v,f,mat,c)

def join(objs,name,c=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]
    bpy.ops.object.join();o=bpy.context.object;o.name='AWB.'+name
    if c:put(o,c)
    return o

def unify(objs,name,voxel=.004,ratio=.5,mat=None):
    o=join(objs,name)
    bpy.context.view_layer.objects.active=o
    o.data.remesh_voxel_size=voxel
    bpy.ops.object.voxel_remesh()
    sm=o.modifiers.new('Relax anatomical transitions','SMOOTH');sm.factor=.65;sm.iterations=3;apply_mod(o,sm)
    de=o.modifiers.new('Realtime surface budget','DECIMATE');de.ratio=ratio;apply_mod(o,de)
    for p in o.data.polygons:p.use_smooth=True
    if mat:o.data.materials.clear();o.data.materials.append(M[mat])
    return o

print('AWB core ready; originals preserved:',[s.name for s in bpy.data.scenes])
