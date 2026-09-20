CURRENT=cols['04_Hair'];clear_col(CURRENT)
# Scalp envelope follows the skull. Its uneven hairline is hidden by layered solid locks.
v=[];f=[];N=96;K=19
def hairline(a):
    front=max(0,cos(a));back=max(0,-cos(a))
    return 1.680+.080*front-.028*back+.004*sin(a*9)+.002*cos(a*17)
for k in range(K):
    t=k/(K-1)
    for j in range(N):
        a=2*pi*j/N;z0=hairline(a);z=z0+(1.824-z0)*sin(t*pi/2)
        # Ellipsoidal crown with full volume behind the ear.
        r=sqrt(max(.00006,1-((z-1.718)/.108)**2))
        rx=.088*r;ry=.104*r
        v.append((rx*sin(a),.011-ry*cos(a),z))
for k in range(K-1):
    for j in range(N):a=k*N+j;b=k*N+(j+1)%N;f.append((a,b,b+N,a+N))
f.append(tuple((K-1)*N+j for j in range(N)))
mesh('Hair fitted scalp cap',v,f,'Hair')

def lock(name,controls,width,mat='HairMid',thick=.0038):
    path=catmull(controls,5);v=[];f=[];uv=[];n=10
    for i,p in enumerate(path):
        t=i/(len(path)-1)
        tangent=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
        outward=Vector((p.x,(p.y-.012),max(.014,p.z-1.722))).normalized()
        across=tangent.cross(outward).normalized()
        normal=across.cross(tangent).normalized()
        if normal.dot(outward)<0:normal=-normal
        w=width*(.60+.45*sin(pi*t*.95))*(1-t)**.53
        if i==len(path)-1:w=.00018
        for j in range(n):
            a=2*pi*j/n
            # Lenticular, ridge-faced lock, with a true back surface.
            elevation=sin(a)*(thick if sin(a)>0 else thick*.36)*(max(.08,sin(pi*t))**.55)
            v.append(tuple(p+across*(cos(a)*w)+normal*elevation));uv.append((j/n,t))
    for i in range(len(path)-1):
        for j in range(n):a=i*n+j;b=i*n+(j+1)%n;f.append((a,a+n,b+n,b))
    f.append(tuple(range(n)));f.append(tuple(reversed([(len(path)-1)*n+j for j in range(n)])))
    o=mesh(name,v,f,mat,uv=uv)
    # Subtle alternating panels keep black hair readable without individual hair strands.
    o.data.materials.append(M['Hair']);o.data.materials.append(M['HairLit'])
    for poly in o.data.polygons:
        j=poly.index%n
        if j in (1,2):poly.material_index=2 if mat=='HairLit' else 0
        if j in (5,6,7,8):poly.material_index=1
    return o

# Long/short bangs overlap asymmetrically and leave a broken window for the brows.
bangs=[(-.075,-.056,1.713,.011),(-.064,-.037,1.733,.016),(-.052,-.027,1.718,.016),(-.039,-.018,1.733,.017),(-.025,-.010,1.714,.015),(-.013,.005,1.734,.015),(.002,.020,1.724,.014),(.019,.028,1.738,.016),(.036,.036,1.720,.015),(.052,.046,1.739,.016),(.066,.052,1.721,.014),(.077,.059,1.741,.011)]
for i,(tipx,rootx,tipz,w) in enumerate(bangs):
    depth=-.094+.008*(abs(tipx)/.08)
    lock('Bangs %02d'%i,[(rootx,-.039,1.799-(abs(rootx)*.19)),(rootx-.009,-.080,1.784-(abs(rootx)*.20)),(tipx*.95-.004,depth-.007,tipz+.027),(tipx,depth-.002,tipz)],w*1.12,'HairMid' if i%4 else 'HairLit',.0023)

# Crown locks follow sweeping flow from an off-center whorl.
for i in range(18):
    a=2*pi*i/18+.10
    ea=a+.21
    root=Vector((-.013,.024,1.821))
    mid=Vector((.066*sin(a),.019-.073*cos(a),1.798+.007*sin(i*2.1)))
    tip=Vector((.094*sin(ea),.012-.110*cos(ea),1.731+.039*cos(a)+.011*sin(i*3.7)))
    lock('Crown swept lock %02d'%i,[root,root*.40+mid*.60+Vector((0,0,.014)),mid,tip],.023 if i%3 else .027,'HairMid' if i%4 else 'HairLit',.0026)

# Layered temple and occipital locks, with the nape behind the ears.
for layer in range(2):
    count=15
    for i in range(count):
        a=pi*.36+(2*pi-pi*.72)*i/(count-1)
        a+=.125*layer+.05*sin(i*1.7)
        r=.065 if layer==0 else .070
        zroot=(1.785 if layer==0 else 1.753)+.013*sin(i*2.71)
        top=(r*sin(a),.010-.082*cos(a),zroot+.014*cos(a))
        mid=(.091*sin(a+.06),.010-.106*cos(a+.06),zroot-.034)
        ztip=1.687-.025*max(0,-cos(a)) if layer==0 else 1.666-.023*max(0,-cos(a))
        if abs(sin(a))>.90:ztip+=.015
        tip=((.093+.002*sin(i))*sin(a+.18),.014-.106*cos(a+.18),ztip+.014*sin(i*2.2))
        lock('Side and nape L%d %02d'%(layer,i),[top,mid,tip],.020 if layer==0 else .016,'Hair' if layer else 'HairMid',.0023)

# Five restrained silhouette tufts; avoid a uniform spiky helmet.
tufts=[([(-.020,.01,1.810),(-.034,.000,1.834),(-.016,-.023,1.848)],.010),([(-.010,.021,1.819),(.024,.012,1.835),(.052,.011,1.828)],.014),([(.029,.035,1.812),(.058,.046,1.826),(.086,.047,1.813)],.012),([(-.063,.026,1.789),(-.084,.021,1.795),(-.103,.010,1.771)],.010),([(.064,-.024,1.783),(.085,-.034,1.785),(.098,-.045,1.762)],.012)]
for i,(p,w) in enumerate(tufts[:2]):lock('Natural crown tuft '+str(i),p,w*1.2,'HairMid',.002)
print('Layered hair clumps:',len(CURRENT.objects)-1)
