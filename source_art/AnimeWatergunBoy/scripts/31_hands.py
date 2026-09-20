CURRENT=cols['06_Hands'];clear_col(CURRENT)
# Both palms are shaped cross-sections; fingers curl around the actual prop dimensions.
Rparts=[]
Rparts.append(sweep('R wrist to thenar',[(-.179,-.306,1.205),(-.155,-.333,1.211),(-.129,-.355,1.213),(-.093,-.367,1.210)],[.025,.029,.035,.032],[.028,.030,.023,.018],'Skin',n=24,per=4))
Rpaths={
 'index':[(-.113,-.384,1.241),(-.074,-.391,1.249),(-.025,-.387,1.253),(.002,-.362,1.242),(-.002,-.346,1.233)],
 'middle':[(-.100,-.389,1.224),(-.065,-.390,1.223),(-.028,-.379,1.216),(-.025,-.348,1.209),(-.050,-.319,1.213)],
 'ring':[(-.107,-.389,1.207),(-.075,-.388,1.204),(-.042,-.379,1.194),(-.044,-.348,1.188),(-.068,-.321,1.193)],
 'little':[(-.118,-.382,1.189),(-.084,-.384,1.187),(-.058,-.373,1.176),(-.060,-.348,1.174),(-.080,-.325,1.180)],
 'thumb':[(-.146,-.345,1.229),(-.134,-.324,1.249),(-.107,-.309,1.253),(-.078,-.308,1.244),(-.060,-.315,1.225)]
}
for key,path in Rpaths.items():
    path=[(x,y+.014 if key!='thumb' else y,z) for x,y,z in path]
    Rpaths[key]=path
    r={'index':.0084,'middle':.0090,'ring':.0083,'little':.0071,'thumb':.0108}[key]
    Rparts.append(tube('R '+key+' curved finger',path,r,'Skin',sides=12,per=5,radii=[r*1.03,r,r*.94,r*.87,r*.66]))
right=unify(Rparts,'Right hand rear grip',.00165,.57,'Skin')

Lparts=[]
Lparts.append(sweep('L wrist to palm',[(.298,-.264,1.201),(.296,-.299,1.204),(.291,-.343,1.207),(.289,-.369,1.216)],[.024,.029,.043,.041],[.026,.025,.022,.017],'Skin',n=24,per=4))
Lpaths={}
for i,(x,ztop,r) in enumerate([(.248,1.292,.0088),(.271,1.295,.0090),(.293,1.294,.0085),(.315,1.288,.0073)]):
    key=['index','middle','ring','little'][i]
    path=[(x+.002,-.370,1.216),(x-.003,-.379,1.237),(x-.005,-.379,1.260),(x-.007,-.366,ztop-.002),(x-.006,-.341,ztop)]
    Lpaths[key]=path
    Lparts.append(tube('L '+key+' support finger',path,r,'Skin',sides=12,per=5,radii=[r*1.03,r,r*.95,r*.88,r*.64]))
Lpaths['thumb']=[(.325,-.321,1.210),(.343,-.308,1.224),(.348,-.304,1.244),(.341,-.313,1.265),(.330,-.324,1.274)]
Lparts.append(tube('L opposing thumb',Lpaths['thumb'],.0105,'Skin',sides=12,per=5,radii=[.011,.0107,.0100,.0093,.007]))
left=unify(Lparts,'Left hand foregrip support',.0016,.57,'Skin')

# Small nail plates and shallow knuckle creases; every digit is separate in silhouette.
for tag,paths in [('R',Rpaths),('L',Lpaths)]:
    for key,ps in paths.items():
        r={'index':.0084,'middle':.0090,'ring':.0083,'little':.0071,'thumb':.0105}[key]
        tip=Vector(ps[-1]);pre=Vector(ps[-2]);tan=(tip-pre).normalized()
        normal=Vector((0,-1,0)) if tag=='R' else Vector((0,-.50,.866))
        normal=(normal-tan*normal.dot(tan)).normalized();across=tan.cross(normal).normalized()
        center=tip-tan*.005+normal*r*.74
        vv=[tuple(center+normal*.00025)]
        for j in range(25):
            a=2*pi*j/24;vv.append(tuple(center+across*(cos(a)*r*.52)+tan*(sin(a)*.0058)))
        nail=mesh(tag+' '+key+' nail plate',vv,[(0,j+1,j+2) for j in range(24)],'Nails')
        if key!='thumb':
            p=Vector(ps[2]);n=Vector((0,-1,0));w=Vector((1,0,0)) if tag=='L' else Vector((0,0,1))
            line=[p+n*(r*.91)+w*t for t in [-.0035,0,.0035]]
            tube(tag+' '+key+' knuckle crease',line,.00027,'EarInner',sides=5,per=2)
right['anatomy']='Character RIGHT hand (viewer left), rear pistol grip; 5 digits'
left['anatomy']='Character LEFT hand (viewer right), green foregrip support; 5 digits'
print('Hands: two continuous skin meshes, 10 curled fingers; anatomical L/R named explicitly')
