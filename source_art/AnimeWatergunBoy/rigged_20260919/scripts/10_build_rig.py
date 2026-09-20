import bpy, os, json, math, hashlib, shutil
from mathutils import Vector, Matrix, Quaternion, Euler
from math import sin, cos, pi, exp, sqrt
import numpy as np

BASE='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy'
OUT=BASE+'/rigged_20260919'
for d in ['qa','previews','frames','scripts']:os.makedirs(OUT+'/'+d,exist_ok=True)
scene=bpy.data.scenes['AWB_Presentation'];bpy.context.window.scene=scene
scene.name='AWB_Animated'
asset=bpy.data.collections['AWB | Anime watergun boy'];asset.name='AWB | Rigged character'
source_hash=hashlib.sha256(open(BASE+'/AnimeWatergunBoy.blend','rb').read()).hexdigest()
json.dump({'path':BASE+'/AnimeWatergunBoy.blend','sha256':source_hash},open(OUT+'/qa/source_preservation.json','w'),indent=2)

def coll(name,parent=None):
 c=bpy.data.collections.new(name);(parent.children if parent else scene.collection.children).link(c);return c
rigcol=coll('RIG | Skeleton and controls',asset)
meshcol=coll('RIG | Bound geometry',asset)
controls=coll('RIG | Control shapes');controls.hide_render=True
FLOOR_SHIFT=.0012
meshes=[o for o in asset.all_objects if o.type=='MESH']
for o in meshes:
 mw=o.matrix_world.copy();o.parent=None;o.data.transform(mw);o.matrix_world=Matrix.Identity(4)
 for v in o.data.vertices:v.co.z+=FLOOR_SHIFT
 for vg in list(o.vertex_groups):o.vertex_groups.remove(vg)
 o['bind_source']='Original AWB static asset; world-space mesh preserved before skinning'
for o in list(asset.all_objects):
 if o.type=='EMPTY':bpy.data.objects.remove(o,do_unlink=True)

arm=bpy.data.armatures.new('AWB_Humanoid_Skeleton')
rig=bpy.data.objects.new('AWB_Rig',arm);rigcol.objects.link(rig)
rig.show_in_front=True;arm.display_type='OCTAHEDRAL'
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
B={}
def bone(name,head,tail,parent=None,deform=True,connect=False):
 eb=arm.edit_bones.new(name);eb.head=Vector(head);eb.tail=Vector(tail)
 eb.head.z+=FLOOR_SHIFT;eb.tail.z+=FLOOR_SHIFT
 eb.use_deform=deform
 if parent:eb.parent=arm.edit_bones[parent];eb.use_connect=connect
 eb.align_roll(Vector((0,1,0)))
 B[name]=(Vector(eb.head),Vector(eb.tail))
 return eb

bone('root',(0,0,0),(0,0,.16))
bone('pelvis',(.010,.020,.916),(.006,.018,1.047),'root')
bone('spine',(.006,.018,1.047),(-.009,.015,1.268),'pelvis',connect=True)
bone('chest',(-.009,.015,1.268),(-.013,.011,1.461),'spine',connect=True)
bone('neck',(-.013,.011,1.461),(-.010,.010,1.553),'chest',connect=True)
bone('head',(-.010,.010,1.553),(-.017,.010,1.746),'neck',connect=True)

J={
 'R':{'hip':(-.086,.021,.900),'knee':(-.167,-.039,.505),'ankle':(-.219,-.015,.123),'ball':(-.231,-.138,.036),'toe':(-.238,-.197,.033),
      'shoulder':(-.183,.011,1.430),'elbow':(-.259,-.111,1.189),'wrist':(-.14556,-.31096,1.1578),'palm':(-.083,-.361,1.165)},
 'L':{'hip':(.103,.021,.900),'knee':(.130,-.028,.505),'ankle':(.145,.050,.123),'ball':(.155,-.076,.036),'toe':(.160,-.133,.033),
      'shoulder':(.173,.011,1.430),'elbow':(.257,-.065,1.194),'wrist':(.2551,-.2757,1.1544),'palm':(.249,-.361,1.177)}
}
for s,j in J.items():
 bone('clavicle.'+s,(-.013,.011,1.448),j['shoulder'],'chest')
 bone('upper_arm.'+s,j['shoulder'],j['elbow'],'clavicle.'+s,connect=True)
 bone('forearm.'+s,j['elbow'],j['wrist'],'upper_arm.'+s,connect=True)
 bone('hand.'+s,j['wrist'],j['palm'],'forearm.'+s)
 bone('thigh.'+s,j['hip'],j['knee'],'pelvis')
 bone('shin.'+s,j['knee'],j['ankle'],'thigh.'+s,connect=True)
 bone('foot.'+s,j['ankle'],j['ball'],'shin.'+s)
 bone('toe.'+s,j['ball'],j['toe'],'foot.'+s,connect=True)

rawR={
 'index':[(-.113,-.370,1.236),(-.082,-.369,1.237),(-.048,-.372,1.239),(-.011,-.366,1.239),(.009,-.354,1.237),(.018,-.351,1.230)],
 'middle':[(-.109,-.371,1.222),(-.078,-.371,1.222),(-.027,-.366,1.220),(-.023,-.337,1.217),(-.026,-.316,1.216)],
 'ring':[(-.113,-.371,1.202),(-.080,-.370,1.202),(-.032,-.364,1.199),(-.028,-.337,1.195),(-.031,-.316,1.194)],
 'little':[(-.121,-.368,1.184),(-.091,-.370,1.184),(-.044,-.361,1.180),(-.040,-.337,1.178),(-.044,-.318,1.179)],
 'thumb':[(-.146,-.340,1.230),(-.132,-.314,1.228),(-.105,-.299,1.227),(-.076,-.300,1.232),(-.060,-.306,1.219)]}
rawL={}
for i,(x,z) in enumerate([(.248,1.263),(.271,1.265),(.293,1.263),(.315,1.258)]):
 rawL[['index','middle','ring','little'][i]]=[(x+.002,-.367,1.214),(x-.003,-.385,1.234),(x-.008,-.386,z),(x-.012,-.381,z-.002)]
rawL['thumb']=[(.325,-.321,1.207),(.346,-.296,1.221),(.348,-.285,1.242),(.340,-.291,1.258),(.328,-.293,1.258)]
finger_paths={}
def arclerp(points,u):
 lengths=[0.0]
 for a,b in zip(points,points[1:]):lengths.append(lengths[-1]+(b-a).length)
 t=u*lengths[-1]
 for i in range(len(points)-1):
  if t<=lengths[i+1]:return points[i].lerp(points[i+1],(t-lengths[i])/(lengths[i+1]-lengths[i]))
 return points[-1]
for s,raw in [('R',rawR),('L',rawL)]:
 for d,pp in raw.items():
  pp=[Vector((.84*x+.0048,.84*y-.05392,.84*z+.1456)) for x,y,z in pp]
  jp=[arclerp(pp,u) for u in [0,.40,.73,1]];finger_paths[(s,d)]=jp
  for k in range(3):bone(f'{d}.{k+1:02d}.{s}',jp[k],jp[k+1],f'{d}.{k:02d}.{s}' if k else 'hand.'+s,connect=k>0)

W=Vector((-.055,-.337,1.185))
bone('CTRL_weapon',W,W+Vector((.25,0,0)),'chest',False)
bone('weapon',W,W+Vector((.25,0,0)),'chest',True)
pole_positions={}
for s,j in J.items():
 bone('CTRL_foot.'+s,j['ankle'],j['ball'],'root',False)
 bone('CTRL_hand.'+s,j['wrist'],j['palm'],'CTRL_weapon',False)
 for region,pts in [('knee',[j['hip'],j['knee'],j['ankle']]),('elbow',[j['shoulder'],j['elbow'],j['wrist']])]:
  a,b,c=map(Vector,pts);axis=c-a;projection=a+axis*(b-a).dot(axis)/axis.length_squared
  bend=(b-projection).normalized();pole=b+bend*.45
  name='POLE_'+region+'.'+s;pole_positions[name]=pole
  bone(name,pole,pole+Vector((0,0,.08)),'root' if region=='knee' else 'chest',False)
bpy.ops.object.mode_set(mode='OBJECT')
for pb in rig.pose.bones:pb.rotation_mode='QUATERNION'
rest={b.name:b.matrix_local.copy() for b in arm.bones}
for s in ['R','L']:
 for low,ctrl,pole in [('shin','CTRL_foot','POLE_knee'),('forearm','CTRL_hand','POLE_elbow')]:
  pb=rig.pose.bones[low+'.'+s];c=pb.constraints.new('IK');c.name='Two-bone '+low+' IK';c.target=rig;c.subtarget=ctrl+'.'+s;c.chain_count=2;c.use_stretch=False
  c.pole_target=rig;c.pole_subtarget=pole+'.'+s
  for part in [('thigh' if low=='shin' else 'upper_arm'),low]:rig.pose.bones[part+'.'+s].ik_stretch=0
 for name,target in [('foot.','CTRL_foot.'),('hand.','CTRL_hand.')]:
  c=rig.pose.bones[name+s].constraints.new('COPY_TRANSFORMS');c.target=rig;c.subtarget=target+s;c.target_space='POSE';c.owner_space='POSE'
c=rig.pose.bones['weapon'].constraints.new('COPY_TRANSFORMS');c.target=rig;c.subtarget='CTRL_weapon';c.target_space='POSE';c.owner_space='POSE'
bpy.context.view_layer.update()
calibration=[]
for s in ['R','L']:
 for low,joint in [('shin','knee'),('forearm','elbow')]:
  c=rig.pose.bones[low+'.'+s].constraints[0];target=Vector(J[s][joint])+Vector((0,0,FLOOR_SHIFT));best=(1e9,0)
  for theta in np.linspace(-pi,pi,73):
   c.pole_angle=float(theta);bpy.context.view_layer.update();err=(rig.pose.bones[low+'.'+s].head-target).length
   if err<best[0]:best=(err,float(theta))
  for theta in np.linspace(best[1]-.10,best[1]+.10,31):
   c.pole_angle=float(theta);bpy.context.view_layer.update();err=(rig.pose.bones[low+'.'+s].head-target).length
   if err<best[0]:best=(err,float(theta))
  c.pole_angle=best[1];calibration.append({'joint':joint+'.'+s,'error_m':best[0],'pole_angle':best[1]})

def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def seg(p,a,b):
 ab=b-a;t=max(0,min(1,(p-a).dot(ab)/ab.length_squared));q=a+t*ab;return (p-q).length,t
def normalize(w):
 w={k:v for k,v in w.items() if v>1e-5};w=dict(sorted(w.items(),key=lambda kv:kv[1],reverse=True)[:4]);total=sum(w.values());return {k:v/total for k,v in w.items()}
def mix(a,b,t):
 out={k:v*(1-t) for k,v in a.items()}
 for k,v in b.items():out[k]=out.get(k,0)+v*t
 return out
def torso_weights(p):
 z=p.z
 if z<1.155:return mix({'pelvis':1},{'spine':1},smooth((z-1.00)/.155))
 return mix({'spine':1},{'chest':1},smooth((z-1.155)/.175))
def leg_weights(p):
 s='R' if p.x<.012 else 'L';k=J[s]['knee'][2]+FLOOR_SHIFT
 thigh=smooth((p.z-(k-.060))/.120)
 out=mix({'shin.'+s:1},{'thigh.'+s:1},thigh)
 hip=smooth((p.z-.794)/.125)
 return mix(out,{'pelvis':1},hip)
def shoe_weights(p,s):
 a,b=B['foot.'+s];forward=(b-a).normalized();t=(p-a).dot(forward)/(b-a).length
 toe=smooth((t-.87)/.40)
 return {'foot.'+s:1-toe,'toe.'+s:toe}
def arm_weights(p,s):
 a,b=B['upper_arm.'+s];_,c=B['forearm.'+s];lu=(b-a).length;lf=(c-b).length
 du,tu=seg(p,a,b);df,tf=seg(p,b,c)
 arclen=tu*lu if du<df else lu+tf*lf
 f=smooth((arclen-(lu-.055))/.11)
 out=mix({'upper_arm.'+s:1},{'forearm.'+s:1},f)
 if arclen<.045:out=mix({'clavicle.'+s:.35,'chest':.65},out,smooth(arclen/.055))
 hand=smooth((arclen-(lu+lf-.017))/.040)*.45
 return mix(out,{'hand.'+s:1},hand),min(du,df)
def jacket_weights(p):
 tw=torso_weights(p);s='R' if p.x<-.013 else 'L';aw,dist=arm_weights(p,s)
 side=smooth((abs(p.x+.013)-.133)/.084)
 front=smooth((-p.y-.107)/.095)
 closeness=1-smooth((dist-.057)/.052)
 influence=max(side,front)*closeness
 if p.z<1.075:influence=0
 return mix(tw,aw,influence)
def hand_weights(p,s):
 candidates=[]
 for d in ['thumb','index','middle','ring','little']:
  for k in range(1,4):
   name=f'{d}.{k:02d}.{s}';a,b=B[name];dist,t=seg(p,a,b);candidates.append((dist,name,t))
 candidates.sort();dist,name,t=candidates[0]
 k=int(name.split('.')[1]);finger=name.split('.')[0]
 root=B[f'{finger}.01.{s}'][0];tip=B[f'{finger}.03.{s}'][1]
 _,prog=seg(p,root,tip)
 strength=(1-smooth((dist-.007)/.009))*smooth((prog-.025)/.23)
 out={name:1}
 if t<.20 and k>1:out=mix({f'{finger}.{k-1:02d}.{s}':1},out,smooth(t/.20)*.5+.5)
 elif t>.80 and k<3:out=mix(out,{f'{finger}.{k+1:02d}.{s}':1},smooth((t-.80)/.20)*.5)
 return mix({'hand.'+s:1},out,strength)

weight_report=[]
for o in meshes:
 n=o.name;groups={b.name:o.vertex_groups.new(name=b.name) for b in arm.bones if b.use_deform}
 for v in o.data.vertices:
  p=v.co
  if 'Watergun' in n or 'Gun orange trigger' in n:w={'weapon':1}
  elif any(k in n for k in ['Head sculpted','Face |','Hair','Glasses']):w={'head':1}
  elif 'Neck' in n:
   w=mix({'chest':1},{'neck':1},smooth((p.z-1.475)/.045));w=mix(w,{'head':1},smooth((p.z-1.551)/.065))
  elif 'hand rear grip' in n or 'Hand | R nails' in n:w=hand_weights(p,'R')
  elif 'hand foregrip support' in n or 'Hand | L nails' in n:w=hand_weights(p,'L')
  elif any(k in n for k in ['continuous sneaker','Shoe |']):w=shoe_weights(p,'R' if ('AWB.R ' in n or 'Shoe | R' in n) else 'L')
  elif 'elastic ankle hem' in n:
   s='R' if 'AWB.R ' in n else 'L';w={'shin.'+s:.72,'foot.'+s:.28}
  elif 'Pants' in n or 'trouser seam' in n:w=leg_weights(p)
  elif 'Ribbed waistband' in n or 'undershirt' in n:w={'pelvis':1}
  elif 'layered hood' in n:w={'chest':1}
  elif 'R ribbed cuff' in n:w=arm_weights(p,'R')[0]
  elif 'L ribbed cuff' in n:w=arm_weights(p,'L')[0]
  elif 'zipper assembly' in n:w=torso_weights(p)
  else:w=jacket_weights(p)
  w=normalize(w)
  for k,val in w.items():groups[k].add([v.index],val,'REPLACE')
 o.parent=rig;o.matrix_parent_inverse=Matrix.Identity(4)
 mod=o.modifiers.new('AWB skeletal deformation','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=False
 sums=[sum(g.weight for g in v.groups) for v in o.data.vertices]
 weight_report.append({'object':n,'vertices':len(o.data.vertices),'min_sum':min(sums),'max_sum':max(sums),'max_influences':max(len(v.groups) for v in o.data.vertices),'unweighted':sum(x<.999 for x in sums)})

# Wire controls stay in Blender; they are not included in the game export.
def shape(name,points,edges):
 me=bpy.data.meshes.new(name);me.from_pydata(points,edges,[]);o=bpy.data.objects.new(name,me);controls.objects.link(o);o.hide_render=True;return o
circle=shape('CS_root',[(cos(a),sin(a),0) for a in np.linspace(0,2*pi,33)[:-1]],[(i,(i+1)%32) for i in range(32)])
box=shape('CS_box',[(-1,-1,0),(-1,1,0),(1,1,0),(1,-1,0)],[(0,1),(1,2),(2,3),(3,0)])
diamond=shape('CS_pole',[(0,0,.7),(-.5,0,0),(0,0,-.7),(.5,0,0)],[(0,1),(1,2),(2,3),(3,0)])
for pb in rig.pose.bones:
 if pb.name=='root':pb.custom_shape=circle;pb.custom_shape_scale_xyz=(3.2,3.2,3.2)
 elif pb.name.startswith('CTRL_'):pb.custom_shape=box;pb.custom_shape_scale_xyz=(.6,.8,.6)
 elif pb.name.startswith('POLE_'):pb.custom_shape=diamond;pb.custom_shape_scale_xyz=(.55,.55,.55)
for o in controls.objects:o.hide_set(True)
controls.hide_viewport=True
for label,pred in [('Deform',lambda n:arm.bones[n].use_deform),('IK Controls',lambda n:n.startswith('CTRL_')),('Pole Controls',lambda n:n.startswith('POLE_'))]:
 bc=arm.collections.new(label)
 for b in arm.bones:
  if pred(b.name):bc.assign(b)
rig['Rig_Instructions']='Move CTRL_foot.L/R for feet; move/rotate CTRL_weapon for both grips; POLE_knee/elbow controls bend direction. Fingers are FK. Root moves the complete character.'
rig['Bind_Pose']='Existing authored holding pose; meters, Z-up. Skinning: linear blend, at most four normalized weights.'
rig['Action_List']='Idle, Walk, Run, Jump, Shoot, RunJump'
scene.render.fps=30
bpy.context.view_layer.update()
json.dump({'bones':len(arm.bones),'deform_bones':sum(b.use_deform for b in arm.bones),'calibration':calibration,'weights':weight_report},open(OUT+'/qa/rig_weight_report.json','w',encoding='utf-8'),indent=2)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/AnimeWatergunBoy_Rigged.blend')
print('RIG_READY',len(arm.bones),json.dumps(calibration),flush=True)
