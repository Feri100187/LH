CURRENT=cols['08_Watergun'];clear_col(CURRENT)
GY=-.337;GZ=1.299
# Independent, manufactured plastic assembly. X is the firing axis.
reservoir=lathe_x('Gun blue water reservoir',[(-.263,.006),(-.261,.026),(-.253,.044),(-.236,.054),(-.207,.057),(-.091,.057),(-.079,.052),(-.075,.041)],GY,GZ,'GunBlue',n=64)
lathe_x('Reservoir collar',[(-.104,.056),(-.100,.059),(-.075,.059),(-.070,.049)],GY,GZ,'GunBlueDark',n=48)
lathe_x('Reservoir bright shoulder',[(-.106,.0563),(-.102,.0573),(-.099,.0573)],GY,GZ,'GunBlueLight',n=48)

# Body outline is based on the prop sheet, including the angular lower receiver.
shell=[(-.081,1.248),(-.091,1.270),(-.088,1.339),(-.056,1.354),(.001,1.350),(.018,1.360),(.143,1.354),(.157,1.365),(.349,1.355),(.372,1.339),(.370,1.279),(.153,1.265),(.126,1.230),(.080,1.226),(.064,1.246),(-.005,1.247)]
profile_xz('Gun white main shell',shell,GY,.082,'GunWhite',.005)
for sign in [-1,1]:
    side=GY+sign*.0433
    profile_xz('Gun white raised side panel '+str(sign),[(-.068,1.280),(-.064,1.332),(.026,1.337),(.153,1.342),(.334,1.336),(.335,1.293),(.144,1.281),(.115,1.257),(.044,1.253),(.030,1.274)],side,.003,'GunWhite',.0015)
    profile_xz('Gun blue inlay '+str(sign),[(.002,1.312),(.017,1.339),(.110,1.340),(.094,1.314)],side+sign*.0021,.002,'GunBlue',.001)
    profile_xz('Gun recessed lower rail '+str(sign),[(.118,1.282),(.138,1.292),(.331,1.303),(.331,1.292),(.143,1.282)],side+sign*.0022,.002,'GunPanel',.0006)
    for j in range(10):
        ob=box('Gun lower rail vent '+str(sign)+' '+str(j),(.157+j*.016,side+sign*.003,1.291+j*.0009),(.008,.002,.003),'GunWhite',.0005);ob.rotation_euler.y=-.08
    for x,z in [(-.052,1.273),(.052,1.265),(.342,1.315)]:
        # Molded screw dimples on both sides.
        pts=[(x+.0025*cos(a),side+sign*.0024,z+.0025*sin(a)) for a in np.linspace(0,2*pi,17)]
        tube('Gun shell fastening ring',pts,.00055,'GunPanel',sides=5,per=0)

profile_xz('Gun blue top fin',[(-.111,1.349),(-.082,1.370),(-.023,1.372),(-.014,1.354)],GY,.061,'GunBlue',.002)
box('Gun top sight',(-.048,GY,1.374),(.033,.018,.009),'GunBlueLight',.0015)
lathe_x('Gun orange muzzle collar',[(.348,.043),(.351,.054),(.360,.056),(.394,.056),(.400,.046)],GY,GZ,'GunOrange',n=64)
lathe_x('Gun muzzle stepped tip',[(.393,.044),(.403,.046),(.414,.044),(.417,.039),(.436,.039),(.442,.034)],GY,GZ,'GunOrangeLight',n=64)
# Annular muzzle, with a recessed bore rather than a solid cylinder end.
lathe_x('Gun muzzle open annular lip',[(.438,.034),(.445,.034),(.446,.029),(.440,.026),(.418,.026)],GY,GZ,'GunOrange',n=64)
lathe_x('Gun recessed dark bore',[(.416,.0255),(.417,.0255),(.418,.0003)],GY,GZ,'GunBore',n=48)
for i in range(10):
    a=2*pi*i/10
    tube('Orange collar molded rib '+str(i),[(.358,GY+.056*cos(a),GZ+.056*sin(a)),(.385,GY+.056*cos(a),GZ+.056*sin(a))],.0030,'GunOrangeLight',sides=7,per=0)

# Blue sloping pistol grip and trigger guard are clearly different structures.
handlepoly=[(-.057,1.267),(-.014,1.257),(-.024,1.221),(-.051,1.158),(-.053,1.142),(-.089,1.129),(-.111,1.143),(-.089,1.190),(-.086,1.226)]
profile_xz('Gun blue rear pistol grip',handlepoly,GY,.046,'GunBlue',.004)
profile_xz('Gun handle butt',[(-.115,1.150),(-.065,1.132),(-.055,1.119),(-.063,1.111),(-.108,1.126),(-.119,1.138)],GY,.050,'GunBlue',.003)
for sign in [-1,1]:
    profile_xz('Gun grip recessed panel '+str(sign),[(-.080,1.224),(-.045,1.235),(-.066,1.171),(-.096,1.155)],GY+sign*.024,.0018,'GunBlueDark',.002)
    for j in range(4):
        tube('Gun grip texture rib',[( -.091+j*.004,GY+sign*.025,1.165+j*.012),(-.066+j*.004,GY+sign*.025,1.175+j*.012)],.0009,'GunBlueLight',sides=5,per=0)
guard=[(-.028,GY,1.257),(.052,GY,1.254),(.073,GY,1.238),(.061,GY,1.205),(.042,GY,1.198),(-.043,GY,1.213)]
tube('Gun blue trigger guard',guard,.0082,'GunBlue',sides=12,per=4)
profile_xz('Gun orange trigger',[(.012,1.253),(.028,1.251),(.020,1.236),(.030,1.222),(.016,1.225),(.008,1.238)],GY,.014,'GunOrange',.0015)

# Green pump/foregrip. Underside finger scallops and separate rib bands.
lathe_x('Gun green front pump',[(.177,.018),(.178,.030),(.188,.036),(.340,.036),(.353,.031),(.355,.023)],GY,1.253,'GunGreen',n=48)
lathe_x('Gun green end button',[(.351,.025),(.360,.025),(.364,.021),(.364,.012)],GY,1.253,'GunGreenLight',n=40)
for j in range(8):
    xx=.192+j*.0185
    lathe_x('Green molded pump rib %02d'%j,[(xx,.0358),(xx+.002,.038),(xx+.008,.038),(xx+.010,.0358)],GY,1.253,'GunGreenLight' if j in [0,7] else 'GunGreen',n=32)
box('Foregrip white attachment',(.256,GY,1.284),(.155,.050,.012),'GunWhite',.003)
# Reservoir fill cap is orange and rises above the blue tank.
cap=loft('Gun orange fill cap',[(-.181,GY,1.354,.020,.020),(-.181,GY,1.360,.022,.022),(-.181,GY,1.368,.019,.019),(-.181,GY,1.373,.015,.015)],'GunOrange',n=36,per=1)
box('Fill cap locking tab',(-.180,GY-.014,1.371),(.045,.008,.008),'GunOrangeLight',.002)

# Keep the complete prop editable and movable as one independent hierarchy.
gunroot=bpy.data.objects.new('AWB.WATERGUN_ROOT',None);CURRENT.objects.link(gunroot);gunroot.location=(0,GY,GZ)
bpy.context.view_layer.update()
for ob in list(CURRENT.objects):
    if ob!=gunroot:
        ob.parent=gunroot;ob.matrix_parent_inverse=gunroot.matrix_world.inverted()
gunroot['asset_role']='Independent toy watergun; front +X; reservoir/grip blue, shell white, muzzle orange, pump green'
print('Independent watergun built:',len(CURRENT.objects))
