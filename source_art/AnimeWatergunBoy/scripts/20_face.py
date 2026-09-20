CURRENT=cols['03_Face'];clear_col(CURRENT);clear_col(cols['05_Glasses'])
# Shape a complete head, with a pointed-but-rounded anime jaw and a shallow facial plane.
headprof=np.array([
 [1.562,.008,.048,.014],[1.570,.022,.060,.026],[1.585,.040,.071,.044],
 [1.601,.055,.078,.063],[1.624,.068,.082,.078],[1.652,.078,.086,.086],
 [1.680,.081,.087,.092],[1.703,.079,.085,.095],[1.728,.078,.082,.096],
 [1.751,.077,.077,.094],[1.774,.069,.062,.087],[1.792,.048,.039,.064],
 [1.805,.018,.014,.024],[1.808,.001,.001,.001]
])

def hprof(z):
    i=max(0,min(len(headprof)-2,int(np.searchsorted(headprof[:,0],z))-1));a=headprof[i];b=headprof[i+1]
    dz=b[0]-a[0];t=max(0,min(1,(z-a[0])/dz));out=[]
    for j in range(1,4):
        ma=(headprof[min(i+1,len(headprof)-1),j]-headprof[max(0,i-1),j])/(headprof[min(i+1,len(headprof)-1),0]-headprof[max(0,i-1),0])
        mb=(headprof[min(i+2,len(headprof)-1),j]-headprof[i,j])/(headprof[min(i+2,len(headprof)-1),0]-headprof[i,0])
        out.append((2*t**3-3*t*t+1)*a[j]+(t**3-2*t*t+t)*ma*dz+(-2*t**3+3*t*t)*b[j]+(t**3-t*t)*mb*dz)
    return out
def front_y(x,z):
    rx,fr,ba=hprof(z);q=min(abs(x)/max(rx,.001),.9999)
    y=-fr*(sqrt(max(0,1-q*q))**.36)
    # Nose belongs to the facial mesh; no stuck-on geometric nose.
    y-=.0085*exp(-(x/.012)**2-((z-1.696)/.030)**2)
    y-=.024*exp(-(x/.0102)**2-((z-1.671)/.0110)**2)
    y-=.004*exp(-(x/.018)**2-((z-1.662)/.009)**2)
    y-=.003*exp(-(x/.026)**2-((z-1.637)/.014)**2)
    y+=.0038*(exp(-((x-.036)/.024)**2)+exp(-((x+.036)/.024)**2))*exp(-((z-1.704)/.018)**2)
    y-=.003*(exp(-((x-.043)/.029)**2)+exp(-((x+.043)/.029)**2))*exp(-((z-1.676)/.021)**2)
    return y

v=[];f=[];uv=[];N=128;K=91
for k in range(K):
    z=1.562+(1.808-1.562)*k/(K-1);rx,fr,ba=hprof(z)
    for j in range(N+1):
        a=-pi+2*pi*j/N;x=rx*sin(a)
        y=front_y(x,z) if cos(a)>=0 else ba*(-cos(a))**.90
        actualz=z+.031*max(0,-cos(a))*(1-k/(K-1))**2
        v.append((x,y,actualz));uv.append((j/N,k/(K-1)))
for k in range(K-1):
    for j in range(N):a=k*(N+1)+j;f.append((a,a+1,a+N+2,a+N+1))
f.append(tuple(reversed(range(N+1))));f.append(tuple((K-1)*(N+1)+j for j in range(N+1)))
head=mesh('Head sculpted face and skull',v,f,'Skin',uv=uv)

# Original 1K painted-style complexion: no photo and no reference-sheet projection.
W=1024;H=1024
yy,xx=np.mgrid[0:H,0:W];u=xx/(W-1);t=yy/(H-1)
a=(u-.5)*2*pi;z=1.562+t*.246
rx=np.interp(z,headprof[:,0],headprof[:,1]);x=rx*np.sin(a)
front=np.clip(np.cos(a)*5,0,1)
blush=(np.exp(-((x-.048)/.025)**2-((z-1.676)/.019)**2)+np.exp(-((x+.048)/.025)**2-((z-1.676)/.019)**2))*front
under=np.exp(-((z-1.586)/.025)**2)*front
rgb=np.zeros((H,W,4),np.float32);rgb[:,:,:3]=(.88,.698,.552)
rgb[:,:,0]+=.022*blush;rgb[:,:,1]-=.036*blush+.018*under;rgb[:,:,2]-=.020*blush+.024*under;rgb[:,:,3]=1
img=bpy.data.images.get('AWB.FaceAlbedo.1K') or bpy.data.images.new('AWB.FaceAlbedo.1K',width=W,height=H,alpha=False)
img.pixels.foreach_set(np.clip(rgb,0,1).ravel());img.filepath_raw=os.path.join(OUT,'textures','FaceAlbedo_1K.png');img.file_format='PNG';img.save();img.pack()
facemat=material('Face painted peach',(.75,.46,.29),.68)
bs=next(n for n in facemat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Subsurface Weight'].default_value=.025
tex=next((n for n in facemat.node_tree.nodes if n.type=='TEX_IMAGE'),None) or facemat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img
facemat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color']);head.data.materials.clear();head.data.materials.append(facemat)

# Ears: thick outer helix, recessed concha and inner antihelix.
for side in [-1,1]:
    path=[(side*.075,.001,1.711),(side*.088,-.006,1.708),(side*.094,-.009,1.697),(side*.092,-.011,1.676),(side*.084,-.020,1.655),(side*.077,-.021,1.652),(side*.074,-.011,1.674),(side*.075,.001,1.711)]
    tube(('L' if side>0 else 'R')+' ear outer helix',path,.0049,'Skin',sides=10,per=5)
    vv=[(side*.081,-.009,1.683)]+[(side*x,y,z) for x,y,z in [(.077,-.010,1.706),(.087,-.010,1.704),(.090,-.011,1.691),(.087,-.018,1.672),(.080,-.021,1.657),(.076,-.014,1.670)]]
    ff=[(0,j+1,(j+1)%6+1) for j in range(6)]
    ob=mesh(('L' if side>0 else 'R')+' ear concha',vv,ff,'EarInner');so=ob.modifiers.new('Ear thickness','SOLIDIFY');so.thickness=.004
    tube(('L' if side>0 else 'R')+' ear inner fold',[(side*.078,-.016,1.664),(side*.082,-.018,1.680),(side*.085,-.014,1.695),(side*.080,-.014,1.699)],.0026,'SkinLight',sides=8,per=4)

# Calm almond eyes, eyelid rims and layered irises follow the head curvature.
def eyelines(t):
    baseline=1.698+.009*t
    return baseline+.0085*sin(pi*t)**.8,baseline-.0052*sin(pi*t)**.8
def eye_y(x,z):
    rel=(abs(x)-.011)/.054;up,lo=eyelines(max(0,min(1,rel)))
    b=max(0,1-((z-(up+lo)/2)/max(.001,(up-lo)/2))**2)
    return front_y(x,z)-.0010-.0037*sin(pi*max(0,min(1,rel)))*b

for side in [-1,1]:
    tag='L' if side>0 else 'R';vv=[];ff=[]
    for i in range(33):
        t=i/32;x=side*(.011+.054*t);up,lo=eyelines(t)
        for j in range(9):
            z=lo+(up-lo)*j/8;vv.append((x,eye_y(x,z),z))
    for i in range(32):
            for j in range(8):a=i*9+j;ff.append((a,a+1,a+10,a+9) if side<0 else (a,a+9,a+10,a+1))
    mesh(tag+' almond sclera',vv,ff,'EyeWhite')
    # Upper lid has a dark tapered contour, lower lid a warm fine edge.
    for upper in [True,False]:
        path=[]
        for i in range(25):
            t=i/24;x=side*(.011+.054*t);up,lo=eyelines(t);z=up if upper else lo
            path.append((x,eye_y(x,z)-.0008,z))
        tube(tag+(' upper lash rim' if upper else ' lower eyelid'),path,.001,'Lash' if upper else 'EarInner',sides=7,per=0,radii=[.00045,.00135,.00165,.0014,.0005] if upper else [.00035,.00050,.00065,.0005,.00025])
    # Iris disc is clipped by both lids, so the expression remains relaxed.
    cx=side*.0375;cz=1.706;rrx=.0091;rrz=.0109;nv=64;rs=[.005,.27,.41,.69,.90,1.0]
    vv=[];ff=[];rings=[]
    for r in rs:
        for j in range(nv):
            a=2*pi*j/nv;x=cx+rrx*r*cos(a);z=cz+rrz*r*sin(a)
            t=(abs(x)-.011)/.054;up,lo=eyelines(t);z=min(up-.0002,max(lo+.00025,z))
            vv.append((x,eye_y(x,z)-.0005-.0008*(1-r*r),z))
    for k in range(len(rs)-1):
        for j in range(nv):a=k*nv+j;b=k*nv+(j+1)%nv;ff.append((a,b,b+nv,a+nv))
    ob=mesh(tag+' layered iris',vv,ff,'Pupil')
    for m in ['Iris','IrisLight','HairLine']:ob.data.materials.append(M[m])
    for p in ob.data.polygons:
        ring=p.index//nv;ang=(p.index%nv)*2*pi/nv
        p.material_index=0 if ring<2 else (3 if ring==4 else (2 if sin(ang)<-.1 and ring==3 else 1))
    for dx,dz,rad in [(-.0025,.0044,.0019),(.0031,-.0035,.0007)]:
        px=cx+dx;pz=cz+dz;vv=[(px,eye_y(px,pz)-.00165,pz)]
        for j in range(20):a=2*pi*j/20;xx=px+rad*cos(a);zz=pz+rad*sin(a);vv.append((xx,eye_y(xx,zz)-.0017,zz))
        mesh(tag+' eye catchlight',vv,[(0,j+1,(j+1)%20+1) for j in range(20)],'Glint')
    # Upper eyelid fold, visible above the glasses rather than a drawn eye outline.
    tube(tag+' upper eyelid crease',[(side*(.016+.044*t),front_y(side*(.016+.044*t),1.721+.003*sin(pi*t))-.0007,1.721+.003*sin(pi*t)) for t in np.linspace(0,1,18)],.00045,'EarInner',sides=6,per=0)
    browpts=[(.011,1.734,.0015),(.027,1.737,.0040),(.046,1.737,.0042),(.060,1.734,.0028),(.069,1.730,.0001)]
    vv=[]
    for x,z,w in browpts:
        for dz in [-w/2,w/2]:vv.append((side*x,front_y(side*x,z+dz)-.0016,z+dz))
    mesh(tag+' shaped eyebrow',vv,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(browpts)-1)],'HairMid')

# A small shaped mouth and understated nostrils serve the anime treatment.
path=[]
for x,z in [(-.019,1.630),(-.011,1.6325),(-.002,1.6328),(.008,1.6325),(.017,1.6318)]:path.append((x,front_y(x,z)-.0009,z))
tube('Quiet closed mouth',path,.0008,'Lips',sides=7,per=5,radii=[.00035,.00085,.00085,.0007,.0002])
tube('Lower lip soft highlight',[(x,front_y(x,1.628)-.0008,1.628-.0005*cos(x*100)) for x in np.linspace(-.010,.010,16)],.0006,'SkinLight',sides=6,per=0)
for side in [-1,1]:
    tube('Nostril '+str(side),[(side*.007,front_y(side*.007,1.662)-.0005,1.662),(side*.0095,front_y(side*.0095,1.663)-.0004,1.663)],.00055,'EarInner',sides=6,per=4)

# Rectangular eyeglasses, separate frame, temple arms and thin transparent lenses.
CURRENT=cols['05_Glasses'];M['Glass'].surface_render_method='BLENDED'
def glass_y(x,z):return -.119+.016*(abs(x)/.079)**1.9
for side in [-1,1]:
    tag='L' if side>0 else 'R'
    # Ordered rounded rectangle, softly swept upward at the temple.
    outline=[(.008,1.715),(.014,1.722),(.043,1.724),(.070,1.723),(.076,1.718),(.072,1.691),(.065,1.687),(.022,1.685),(.014,1.689),(.008,1.715)]
    pts=[(side*x,glass_y(x,z),z) for x,z in outline]
    tube(tag+' full rectangular frame',pts,.00155,'Frame',sides=9,per=4)
    tube(tag+' emphasized top rim',[pts[i] for i in range(5)],.00215,'Frame',sides=9,per=4)
    border=catmull(pts,4)[:-1];center=sum(border,Vector())/len(border)
    vv=[tuple(center+Vector((0,.0005,0)))]+[tuple(center+(p-center)*.97+Vector((0,.0005,0))) for p in border]
    lens=mesh(tag+' transparent lens',vv,[(0,j+1,(j+1)%len(border)+1) for j in range(len(border))],'Glass')
    tube(tag+' temple arm',[(side*.074,-.103,1.719),(side*.082,-.083,1.717),(side*.086,-.030,1.709),(side*.087,.020,1.703),(side*.083,.038,1.692)],.0027,'Frame',sides=9,per=4,radii=[.003,.0026,.0022,.0025,.0022])
    tube(tag+' nose pad stem',[(side*.010,-.116,1.704),(side*.009,-.107,1.698)],.00065,'Zipper',sides=6,per=2)
tube('Eyeglasses bridge',[(-.009,-.119,1.713),(-.004,-.122,1.715),(0,-.123,1.7155),(.004,-.122,1.715),(.009,-.119,1.713)],.0018,'Frame',sides=10,per=3)
print('Face and glasses ready:',len(cols['03_Face'].objects),len(cols['05_Glasses'].objects))
