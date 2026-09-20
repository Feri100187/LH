CURRENT=cols['02_Clothes']
# Remove only our detail layer for repeatable refinement.
for ob in list(CURRENT.objects):
    if ob.name.startswith('AWB.Detail.'):bpy.data.objects.remove(ob,do_unlink=True)
def front_torso(z,x=0):
    rr=np.array(torso_rings)
    cy=float(np.interp(z,rr[:,2],rr[:,1]));ry=float(np.interp(z,rr[:,2],rr[:,4]));rx=float(np.interp(z,rr[:,2],rr[:,3]));cx=float(np.interp(z,rr[:,2],rr[:,0]))
    a=math.asin(max(-.97,min(.97,(x-cx)/rx)))
    return cy-(ry+torsofold(0,a,z))*cos(a)-.001

# A sewn zipper channel, fine paired teeth, pull and top stop.
zs=np.linspace(.989,1.485,62)
for dx in [-.005,.005]:
    tube('Detail.zipper tape '+str(dx),[(float(np.interp(z,np.array(torso_rings)[:,2],np.array(torso_rings)[:,0]))+dx,front_torso(z),z) for z in zs],.0028,'JacketSeam',sides=7,per=0)
teeth=[]
for i,z in enumerate(np.linspace(.998,1.470,75)):
    x=float(np.interp(z,np.array(torso_rings)[:,2],np.array(torso_rings)[:,0]))
    for sign in [-1,1]:teeth.append(box('Detail.zipper tooth',(x+sign*.0017,front_torso(z)-.0022,z+sign*.0011),(.0028,.0023,.0033),'Zipper',.0004))
teethob=join(teeth,'Detail.zipper metal teeth')
box('Detail.zipper slider',(-.013,front_torso(1.473)-.004,1.472),(.010,.005,.020),'Zipper',.0018)
pull=tube('Detail.zipper pull loop',[(-.016,front_torso(1.463)-.008,1.468),(-.017,front_torso(1.452)-.008,1.447),(-.011,front_torso(1.452)-.008,1.446),(-.010,front_torso(1.463)-.008,1.467)],.0013,'Zipper',sides=7,per=3)
box('Detail.zipper pull orange insert',(-.013,front_torso(1.450)-.009,1.451),(.003,.0015,.004),'GunOrange',.0005)

# Pockets, topstitching and shoulder seams are geometric and restrained.
for sign in [-1,1]:
    path=[]
    for t in np.linspace(0,1,16):
        x=sign*(.082+.061*t);z=1.159-.069*t
        path.append((x,front_torso(z,x)-.002,z))
    tube('Detail.pocket opening '+str(sign),path,.0027,'JacketSeam',sides=8,per=0)
    tube('Detail.pocket welt '+str(sign),[(x+sign*.005,y-.001,z+.001) for x,y,z in path],.0014,'JacketPanel',sides=7,per=0)
    shoulder=[(sign*.084-.014,-.033,1.482),(sign*.128-.014,-.061,1.466),(sign*.166-.014,-.061,1.444),(sign*.188-.014,-.053,1.412)]
    tube('Detail.raglan shoulder seam '+str(sign),shoulder,.0018,'JacketSeam',sides=7,per=4)
    # Metal grommets lie on the front edge of the hood.
    gx=sign*.059-.013;gy=-.061;gz=1.484
    ring=[(gx+.006*cos(a),gy,gz+.006*sin(a)) for a in np.linspace(0,2*pi,25)]
    tube('Detail.hood drawcord grommet '+str(sign),ring,.0011,'Zipper',sides=7,per=0)
    cord=[(gx,gy-.001,gz),(gx+sign*.003,-.076,1.455),(gx+sign*.008,-.091,1.406),(gx+sign*.004,-.093,1.373)]
    tube('Detail.hood drawstring '+str(sign),cord,.0015,'RibKnit',sides=8,per=5)
    tube('Detail.hood cord metal tip '+str(sign),[cord[-1],(cord[-1][0],cord[-1][1],cord[-1][2]-.010)],.0017,'Zipper',sides=8,per=0)
    # Light grey shoulder fabric insert; deliberately no copied letters/brand marks.
    path=[(sign*.215-.013,-.021,1.444),(sign*.230-.013,-.033,1.417),(sign*.238-.013,-.043,1.391)]
    tube('Detail.shoulder reflective piping '+str(sign),path,.0024,'ShoePale',sides=7,per=4)

# Neck/collar front panel helps the hood meet the zipper without a gap.
for sign in [-1,1]:
    ob=profile_xz('Detail.standing collar '+str(sign),[(sign*.004-.013,1.483),(sign*.006-.013,1.517),(sign*.047-.013,1.515),(sign*.073-.013,1.494),(sign*.062-.013,1.474)],-.050,.020,'Jacket',.004)
print('Zipper, hood cords, seams and pocket finishing complete')
