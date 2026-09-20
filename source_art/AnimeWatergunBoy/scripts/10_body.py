CURRENT=cols['02_Clothes']
clear_col(CURRENT);clear_col(cols['01_Body']);clear_col(cols['07_Sneakers'])

def torsofold(t,a,z):
    low=exp(-((z-1.04)/.078)**2)
    middle=exp(-((z-1.18)/.20)**2)
    fade=max(0,min(1,(z-1.015)/.030))
    folds=0
    for zi,amp,width,phase in [(1.049,.006,.008,.4),(1.091,.008,.013,1.7),(1.169,.004,.016,2.3),(1.326,.004,.025,1.2)]:
        center=zi+.045*sin(a*2+phase)
        folds+=amp*exp(-((z-center)/width)**2)-amp*.55*exp(-((z-center-.011)/(width*.75))**2)
    return fade*((.0024*sin(9*a+z*28))*low+.0018*sin(5*a+z*18)*middle+folds)

torso_rings=[(.012,.016,.990,.162,.090),(.011,.016,1.012,.169,.096),(.009,.018,1.055,.177,.106),(.004,.019,1.115,.166,.102),(-.003,.017,1.185,.165,.105),(-.010,.014,1.272,.176,.107),(-.014,.014,1.356,.190,.110),(-.013,.012,1.418,.208,.104),(-.013,.013,1.451,.209,.090),(-.014,.015,1.481,.151,.068),(-.014,.015,1.493,.072,.055)]
torso_rings=[(x,y,z,rx*(.93 if z>1.40 else 1),ry) for x,y,z,rx,ry in torso_rings]
torso=loft('Jacket tailored body',torso_rings,'Jacket',n=64,per=4,fold=torsofold)

def arfold(t,a):
    elbow=exp(-((t-.50)/.20)**2)
    wrist=exp(-((t-.90)/.16)**2)
    return .0055*sin(t*47+a*2)*elbow+.0035*sin(t*78-a*3)*wrist+.0015*sin(a*6+t*19)

armR=[(-.195,.016,1.449),(-.222,-.011,1.403),(-.248,-.047,1.310),(-.270,-.104,1.224),(-.249,-.175,1.190),(-.210,-.249,1.198),(-.179,-.306,1.205)]
armL=[(.173,.015,1.448),(.214,-.010,1.400),(.245,-.021,1.306),(.257,-.074,1.204),(.277,-.157,1.181),(.294,-.218,1.186),(.299,-.271,1.200)]
sleeveR=sweep('Right bent sleeve',armR,[.065,.070,.063,.066,.057,.048,.043],[.075,.074,.067,.068,.061,.052,.047],'Jacket',n=36,per=5,fold=arfold)
sleeveL=sweep('Left bent sleeve',armL,[.065,.070,.063,.061,.056,.047,.042],[.075,.074,.067,.064,.060,.052,.045],'Jacket',n=36,per=5,fold=arfold)
for ob,cent in [(sleeveR,-.195),(sleeveL,.173)]:
    for ve in ob.data.vertices:
        z=ve.co.z;fade=max(0,min(1,(z-1.33)/.10))
        ve.co.x=cent+(ve.co.x-cent)*(1-.15*fade)
        if z>1.445:ve.co.z-=.022*min(1,(z-1.445)/.035)
torso=unify([torso,sleeveR,sleeveL],'Jacket continuous shoulder and sleeves',.0036,.55,'Jacket')
for tag,pts in [('R',armR),('L',armL)]:
    p=Vector(pts[-1]);direction=(p-Vector(pts[-2])).normalized()
    cuff=sweep(tag+' ribbed cuff',[p-direction*.024,p+direction*.007,p+direction*.012],[.045,.039,.037],[.047,.040,.038],'RibKnit',n=40,per=2)
    for j in range(22):
        a=2*pi*j/22;tangent=direction
        u=tangent.cross(Vector((0,1,0))).normalized();v=tangent.cross(u).normalized()
        offset=(cos(a)*u+sin(a)*v)*.0405
        tube(tag+' cuff rib %02d'%j,[p-direction*.011+offset,p+direction*.006+offset],.0007,'JacketSeam',sides=5,per=0)

loft('Ribbed waistband',[(.012,.016,.980,.158,.088),(.012,.016,.988,.162,.093),(.010,.016,1.014,.165,.094),(.010,.016,1.020,.163,.093)],'RibKnit',n=64,per=2)
loft('White undershirt hem',[(.012,.014,.968,.157,.087),(.013,.014,.979,.160,.090),(.012,.014,.988,.161,.092)],'Shirt',n=64,per=2,fold=lambda t,a,z:.002*sin(a*6))

# Lowered hood, fully modeled outside and inside, with a rolled rim.
hoodrings=[(-.013,.126,1.361,.008,.009),(-.013,.121,1.376,.038,.025),(-.013,.091,1.408,.080,.070),(-.013,.052,1.451,.121,.109),(-.013,.036,1.486,.117,.106),(-.013,.028,1.508,.088,.081)]
hood=loft('Hood outer drape',hoodrings,'JacketPanel',n=56,per=4,cap=False,fold=lambda t,a,z:.003*sin(a*5+z*13))
so=hood.modifiers.new('Real fabric thickness','SOLIDIFY');so.thickness=.004
inner=loft('Hood dark lining',[(x,y,z+.002,rx*.948,ry*.95) for x,y,z,rx,ry in hoodrings[1:]],'HoodInside',n=56,per=3,cap=False)
rim=[]
for j in range(65):
    a=2*pi*j/64;rim.append((-.013+.088*sin(a),.028-.081*cos(a),1.508+.004*cos(a*2)))
tube('Hood rolled opening',rim,.0045,'JacketPanel',sides=10,per=0)
tube('Hood back central seam',[(-.013,.140,1.371),(-.013,.165,1.410),(-.013,.161,1.451),(-.013,.140,1.482)],.0013,'JacketSeam',sides=7)

# Neck is a continuous shaped loft; its hidden base meets the neckline.
CURRENT=cols['01_Body']
loft('Neck',[(0,.014,1.451,.049,.043),(-.002,.010,1.486,.043,.040),(-.005,.008,1.541,.038,.038),(-.005,.011,1.579,.043,.040),(-.006,.012,1.599,.050,.045)],'Skin',n=40,per=4)

CURRENT=cols['02_Clothes']
# Pants are fused at the seat/crotch; no separate cylinder-looking hips.
def pantfold(t,a,z):
    ankle=exp(-((z-.165)/.058)**2);knee=exp(-((z-.515)/.100)**2);hip=exp(-((z-.81)/.13)**2)
    fold=.0048*sin(z*112+a*2)*ankle+.0045*sin(z*71-a*2)*knee+.0025*sin(6*a+z*26)*hip+.0022*sin(a*5+z*15)
    for zi,amp,w,slant in [(.225,.006,.009,.030),(.395,.004,.012,-.031),(.562,.006,.016,.045),(.670,.004,.018,-.065),(.800,.005,.014,.07)]:
        d=z-zi-slant*sin(a+.4)
        fold+=amp*exp(-(d/w)**2)-amp*.40*exp(-((d-.012)/(w*.65))**2)
    return fold

pantparts=[]
pr=[(-.219,-.024,.125,.059,.057),(-.217,-.020,.151,.066,.062),(-.203,-.004,.201,.062,.063),(-.185,.007,.317,.063,.061),(-.170,-.006,.466,.069,.068),(-.158,-.008,.525,.075,.073),(-.140,.008,.639,.082,.080),(-.110,.017,.792,.094,.090),(-.086,.020,.874,.103,.096),(-.066,.020,.957,.099,.096),(-.064,.020,.987,.090,.09)]
pl=[(.141,.045,.125,.057,.054),(.143,.047,.153,.064,.061),(.144,.048,.208,.063,.061),(.137,.047,.351,.064,.063),(.130,.038,.493,.068,.067),(.119,.037,.546,.074,.071),(.111,.033,.667,.081,.079),(.111,.024,.795,.093,.091),(.105,.020,.875,.096,.095),(.083,.020,.956,.096,.095),(.081,.020,.984,.085,.09)]
pr=[(x,y,z,rx*(1.06 if .22<z<.72 else 1),ry*(1.06 if .22<z<.72 else 1)) for x,y,z,rx,ry in pr]
pl=[(x,y,z,rx*(1.06 if .22<z<.72 else 1),ry*(1.06 if .22<z<.72 else 1)) for x,y,z,rx,ry in pl]
pantparts.append(loft('Right trouser cut',pr,'Pants',n=48,per=4,fold=pantfold))
pantparts.append(loft('Left trouser cut',pl,'Pants',n=48,per=4,fold=pantfold))
pantparts.append(loft('Trouser seat',[(.010,.020,.837,.025,.025),(.010,.022,.895,.156,.093),(.011,.023,.944,.170,.096),(.012,.022,.988,.157,.091)],'Pants',n=56,per=3))
pants=unify(pantparts,'Pants continuous seat and legs',.0042,.53,'Pants')
for side,path in [('R',[(-.087,-.079,.955),(-.124,-.069,.926),(-.150,-.052,.879)]),('L',[(.098,-.077,.955),(.132,-.065,.921),(.163,-.044,.883)])]:
    tube(side+' pants pocket welt',path,.0018,'PantsSeam',sides=7)
for side,rings in [('R',pr),('L',pl)]:
    tube(side+' pants outer seam',[(x+(-1 if side=='R' else 1)*rx*.96,y+.005,z) for x,y,z,rx,ry in rings[1:-1]],.001,'PantsSeam',sides=6,per=3)
    x,y,z,rx,ry=rings[0]
    loft(side+' elastic ankle hem',[(x,y,.114,rx*.91,ry*.95),(x,y,.128,rx,ry),(x,y,.140,rx,ry)],'RibKnit',n=40,per=2)

# Shoes: sculpted footprint, separate layered sole, upper, panels and lacing.
CURRENT=cols['07_Sneakers']
for side,cx,cy,rot in [('R',-.219,-.039,-.12),('L',.145,.026,.09)]:
    created=[]; before=set(CURRENT.objects)
    def footv(x,y,z):return (cx+x*cos(rot)-y*sin(rot),cy+x*sin(rot)+y*cos(rot),z)
    def footmesh(name, rings, mat):
        v=[];f=[];N=64
        for z,s,shift in rings:
            for j in range(N):
                a=2*pi*j/N
                yy=-.031+.135*cos(a)+shift
                width=.045+ .012*((-cos(a)+1)/2)
                xx=width*sin(a)*(1+.055*sin(a))
                v.append(footv(xx*s,(-.031+(yy+.031)*s),z))
        for k in range(len(rings)-1):
            for j in range(N):a=k*N+j;b=k*N+(j+1)%N;f.append((a,b,b+N,a+N))
        f.append(tuple(reversed(range(N))));f.append(tuple((len(rings)-1)*N+j for j in range(N)))
        return mesh(side+' '+name,v,f,mat)
    footmesh('rubber outsole',[(.012,.91,0),(.017,1.015,0),(.027,1.026,0),(.032,1.01,0)],'Outsole')
    footmesh('molded midsole',[(.028,1.013,0),(.034,1.026,0),(.049,1.02,0),(.055,.98,0)],'ShoeWhite')
    footmesh('sole piping',[(.046,1.027,0),(.049,1.026,0),(.052,1.018,0)],'Sole')
    v=[];f=[];N=64;K=12
    for k in range(K):
        t=k/(K-1);sc=cos(t*pi/2)*.98
        for j in range(N):
            a=2*pi*j/N;yy=-.031+.135*cos(a);width=.045+.012*((1-cos(a))/2)
            xx=width*sin(a)*sc; yy=-.031+(yy+.031)*sc
            # Instep rises toward the ankle, the toe stays low and rounded.
            height=.036+.051*exp(-((yy-.025)/.058)**2)
            z=.051+sin(t*pi/2)*height
            v.append(footv(xx,yy,z))
    for k in range(K-1):
        for j in range(N):a=k*N+j;b=k*N+(j+1)%N;f.append((a,b,b+N,a+N))
    f.append(tuple((K-1)*N+j for j in range(N)))
    mesh(side+' shaped sneaker upper',v,f,'ShoeWhite')
    for sign in [-1,1]:
        # Sewn side panels without logos or text.
        poly=[(.012,.071),(-.004,.100),(-.036,.091),(-.082,.067),(-.116,.061),(-.087,.077),(-.045,.091),(.040,.105),(.078,.075)]
        vv=[footv(sign*(.050 if yy<.015 else .042),yy,zz) for yy,zz in poly]
        ob=mesh(side+' grey quarter panel '+str(sign),vv,[tuple(range(len(vv)))],'ShoePale',smooth=False)
        so=ob.modifiers.new('Leather panel thickness','SOLIDIFY');so.thickness=.0018
        bevel(ob,.002,2)
        for j in range(3):
            yy=-.057+j*.030
            path=[footv(sign*.049,yy-.011,.064),footv(sign*.047,yy,.081),footv(sign*.041,yy+.018,.092)]
            tube(side+' side inset seam '+str(sign)+' '+str(j),path,.0013,'ShoeGrey',sides=6)
    # Tongue and collar emerge behind the crossed laces.
    vv=[];ff=[]
    for i in range(10):
        yy=-.088+i*.014
        z=.083+.053*(i/9)
        w=.028 if i<7 else .026
        for j in range(9):
            u=-1+2*j/8;vv.append(footv(w*u,yy,z-.006*u*u))
    for i in range(9):
        for j in range(8):a=i*9+j;ff.append((a,a+1,a+10,a+9))
    tongue=mesh(side+' padded tongue',vv,ff,'ShoePale');so=tongue.modifiers.new('Tongue thickness','SOLIDIFY');so.thickness=.003
    for i in range(5):
        yy=-.082+i*.023;zz=.090+i*.009
        for sign in [-1,1]:
            x=sign*(.027-i*.001)
            tube(side+' lace eyestay '+str(i)+' '+str(sign),[footv(x,yy-.006,zz-.003),footv(x,yy+.006,zz+.003)],.0026,'ShoeWhite',sides=8)
        for sign in [-1,1]:
            tube(side+' crossed lace '+str(i)+' '+str(sign),[footv(sign*.024,yy,zz),footv(0,yy+.008,zz+.008),footv(-sign*.024,yy+.018,zz+.006)],.00165,'Laces',sides=7,per=3)
    for sign in [-1,1]:
        tube(side+' tied lace loop '+str(sign),[footv(0,.025,.135),footv(sign*.032,.032,.140),footv(sign*.037,.055,.140),footv(sign*.014,.052,.134),footv(0,.025,.135)],.0017,'Laces',sides=7,per=4)
        tube(side+' lace end '+str(sign),[footv(0,.025,.136),footv(sign*.014,-.006,.126),footv(sign*.024,-.027,.105)],.00155,'Laces',sides=7,per=3)
    # Heel tabs, sole heel shaping and outsole grooves.
    tab=box(side+' heel pull tab',footv(0,.096,.108),(.021,.006,.039),'ShoeGrey',.002);tab.rotation_euler.z=rot
    for j in range(6):
        yy=-.140+j*.043
        tube(side+' outsole tread groove '+str(j),[footv(-.037,yy,.0122),footv(0,yy+.007,.0117),footv(.037,yy,.0122)],.0012,'Sole',sides=5,per=0)

print('Body/clothes/shoes created:',len(asset.all_objects),'objects')
