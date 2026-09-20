# Reconstruct anatomically simple finger arcs around the rounded grip outline.
# Collision fitting now makes only small clearance corrections.
Rpaths={
 'index':[(-.113,-.370,1.236),(-.082,-.369,1.237),(-.048,-.372,1.239),(-.011,-.366,1.239),(.009,-.354,1.237),(.018,-.351,1.230)],
 'middle':[(-.109,-.371,1.222),(-.078,-.371,1.222),(-.027,-.366,1.220),(-.023,-.337,1.217),(-.026,-.316,1.216)],
 'ring':[(-.113,-.371,1.202),(-.080,-.370,1.202),(-.032,-.364,1.199),(-.028,-.337,1.195),(-.031,-.316,1.194)],
 'little':[(-.121,-.368,1.184),(-.091,-.370,1.184),(-.044,-.361,1.180),(-.040,-.337,1.178),(-.044,-.318,1.179)],
 'thumb':[(-.146,-.340,1.230),(-.132,-.314,1.228),(-.105,-.299,1.227),(-.076,-.300,1.232),(-.060,-.306,1.219)]
}
Lpaths={}
for i,(x,z,r) in enumerate([(.248,1.263,.0084),(.271,1.265,.0090),(.293,1.263,.0083),(.315,1.258,.0071)]):
    key=['index','middle','ring','little'][i]
    Lpaths[key]=[(x+.002,-.367,1.214),(x-.003,-.385,1.234),(x-.008,-.386,z),(x-.012,-.381,z-.002)]
Lpaths['thumb']=[(.325,-.321,1.207),(.346,-.296,1.221),(.348,-.285,1.242),(.340,-.291,1.258),(.328,-.293,1.258)]

maximums=[]
for tag,paths in [('R',Rpaths),('L',Lpaths)]:
    for digit,ps in paths.items():
        rr={'index':.0084,'middle':.009,'ring':.0083,'little':.0071,'thumb':.0105}[digit]
        corrections=[];pp=catmull(ps,10)
        for i,p in enumerate(pp):
            if i<3:continue
            w=characterroot.matrix_world@T@p;r=rr*(1-.34*i/(len(pp)-1))*GUN_SCALE
            corrections.append((fit_point(w,r)-w).length)
        maximums.append((tag,digit,round(max(corrections)*1000,2)))
print('Maximum contact corrections mm',maximums)
CURRENT=cols['06_Hands'];clear_col(CURRENT)
src=open(os.path.join(OUT,'scripts','54_contact_and_shoes.py'),encoding='utf-8').read()
block=src.split('fitpaths={};hand_results=[]',1)[1].split('contact_metrics=[]',1)[0]
fitpaths={};hand_results=[]
exec(compile(block,'natural_hand_surfaces','exec'),globals())
final=[]
for name,tag in [('AWB.Right hand rear grip','R'),('AWB.Left hand foregrip support','L')]:
    ob=bpy.data.objects[name];inv=ob.matrix_world.inverted()
    for iteration in range(3):
        for v in ob.data.vertices:
            p=ob.matrix_world@v.co;q,n,idx,dist=contact_tree.find_nearest(p);sd=dist if (p-q).dot(n)>=0 else -dist
            if sd<.00065:v.co=inv@(q+n*.00075)
    ds=[]
    for v in ob.data.vertices:
        p=ob.matrix_world@v.co;q,n,idx,dist=contact_tree.find_nearest(p);ds.append(dist if (p-q).dot(n)>=0 else -dist)
    final.append({'hand':tag,'min_skin_clearance_mm':round(min(ds)*1000,3),'vertices_inside':sum(d<0 for d in ds),'contact_vertices_under_2mm':sum(0<=d<.002 for d in ds)})
with open(os.path.join(OUT,'qa','hand_contact_checked.json'),'w',encoding='utf-8') as f:json.dump({'method':'Final hand vertices against closed 0.95 mm voxel union of actual gun geometry; static pose only','results':final},f,indent=2)
print(json.dumps(final))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'AnimeWatergunBoy.blend'))
