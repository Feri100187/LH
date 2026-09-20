import bpy,math,json,os
from mathutils import Vector,Matrix,Quaternion,Euler
from math import sin,cos,pi,exp,sqrt
import numpy as np
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919'
scene=bpy.data.scenes['AWB_Animated'];bpy.context.window.scene=scene
rig=bpy.data.objects['AWB_Rig'];arm=rig.data
asset=bpy.data.collections['AWB | Rigged character'];rigcol=bpy.data.collections['RIG | Skeleton and controls']
FLOOR_SHIFT=.0012
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
e=arm.edit_bones.new('water_jet');e.head=(.380,-.337,1.2392);e.tail=(1.060,-.337,1.2392);e.parent=arm.edit_bones['weapon'];e.use_deform=True;e.align_roll(Vector((0,0,1)))
e=arm.edit_bones.new('trigger');e.head=(.016,-.337,1.195);e.tail=(.021,-.337,1.173);e.parent=arm.edit_bones['weapon'];e.use_deform=True;e.align_roll(Vector((0,1,0)))
bpy.ops.object.mode_set(mode='OBJECT')
fxcol=bpy.data.collections.new('RIG | Water pulse effect');asset.children.link(fxcol)
watermat=bpy.data.materials.new('AWB.M.Animated water');watermat.use_nodes=True
bs=next(n for n in watermat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Base Color'].default_value=(.018,.42,.82,.63);bs.inputs['Roughness'].default_value=.24;bs.inputs['Alpha'].default_value=.63;bs.inputs['Emission Color'].default_value=(.01,.17,.38,1);bs.inputs['Emission Strength'].default_value=.12
watermat.diffuse_color=(.018,.42,.82,.63)
allowed=[i.identifier for i in watermat.bl_rna.properties['surface_render_method'].enum_items]
if 'BLENDED' in allowed:watermat.surface_render_method='BLENDED'
vs=[];fs=[];N=12
for i,(x,r) in enumerate([(.382,.0025),(.411,.0040),(.50,.0033),(.64,.0038),(.78,.0029),(.90,.0022),(.99,.0009)]):
 for j in range(N):
  a=2*pi*j/N;vs.append((x,-.337+r*cos(a),1.2392+r*sin(a)-.014*((x-.38)/.65)**2))
for i in range(6):
 for j in range(N):a=i*N+j;b=i*N+(j+1)%N;fs.append((a,b,b+N,a+N))
fs.extend([tuple(reversed(range(N))),tuple(6*N+j for j in range(N))])
for k in range(7):
 base=len(vs);cx=1.015+k*.032;cy=-.337+.006*sin(k*2.4);cz=1.223-.005*k;r=.0038-.00030*k
 for row in range(7):
  phi=pi*row/6
  for j in range(8):
   a=2*pi*j/8;vs.append((cx+.011*cos(phi),cy+r*sin(phi)*cos(a),cz+r*sin(phi)*sin(a)))
 for row in range(6):
  for j in range(8):a=base+row*8+j;b=base+row*8+(j+1)%8;fs.append((a,b,b+8,a+8))
me=bpy.data.meshes.new('Water pulse mesh');me.from_pydata(vs,[],fs);me.update();me.materials.append(watermat)
water=bpy.data.objects.new('FX_WaterPulse',me);fxcol.objects.link(water);water.parent=rig
for p in me.polygons:p.use_smooth=True
g=water.vertex_groups.new(name='water_jet');g.add(list(range(len(me.vertices))),1,'REPLACE')
mod=water.modifiers.new('Water pulse bone','ARMATURE');mod.object=rig
water['Effect']='Lightweight stylized water pulse; bone-scaled per clip, hidden outside Shoot. Optional for game integration.'
trigger=bpy.data.objects['AWB.Gun orange trigger']
for g in list(trigger.vertex_groups):trigger.vertex_groups.remove(g)
g=trigger.vertex_groups.new(name='trigger');g.add(list(range(len(trigger.data.vertices))),1,'REPLACE')
for pb in rig.pose.bones:pb.rotation_mode='QUATERNION'
rest={b.name:b.matrix_local.copy() for b in arm.bones}
PB=rig.pose.bones

# Refine pole angles with the actual solved rest pose, keeping the original skin pose intact.
for s in ['R','L']:
 for low in ['shin','forearm']:
  pb=PB[low+'.'+s];c=pb.constraints[0];target=arm.bones[pb.name].head_local.copy();center=c.pole_angle
  for size in [.009,.0015,.00020,.00003]:
   best=(1e9,center)
   for theta in np.linspace(center-size,center+size,17):
    c.pole_angle=float(theta);bpy.context.view_layer.update();d=(pb.head-target).length
    if d<best[0]:best=(d,float(theta))
   center=best[1]
  c.pole_angle=center

def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def lerpkeys(t,keys):
 for (a,x),(b,y) in zip(keys,keys[1:]):
  if t<=b:return x+(y-x)*smooth((t-a)/(b-a))
 return keys[-1][1]
def local_rot(name,xyz):
 q=rest[name].to_quaternion();PB[name].rotation_quaternion=q.inverted()@Euler(xyz,'XYZ').to_quaternion()@q
def local_translate(name,v):PB[name].location=rest[name].to_3x3().inverted()@Vector(v)
def reset_pose():
 for p in PB:p.location=(0,0,0);p.rotation_quaternion=(1,0,0,0);p.scale=(1,1,1)
def bone_delta(name):return PB[name].matrix@rest[name].inverted()
sole={}
for s in ['R','L']:
 obj=bpy.data.objects['AWB.Shoe | '+s+' layered sole'];ankle=arm.bones['foot.'+s].head_local
 sole[s]=[v.co-ankle for v in obj.data.vertices]
def foot(s,x,y,lift,pitch=0):
 name='CTRL_foot.'+s;r=Matrix.Rotation(pitch,4,'X');zmin=min((r.to_3x3()@v).z for v in sole[s])
 mat=Matrix.Translation((x,y,lift-zmin))@r@rest[name].to_3x3().to_4x4()
 PB[name].matrix=bone_delta('root')@mat
def gait(phase,duty,stride,height):
 u=phase%1
 if u<duty:
  q=u/duty;y=-stride/2+stride*q;h=0
  if q<.28:pitch=math.radians(-12)*(1-smooth(q/.28))
  elif q>.74:pitch=math.radians(18)*smooth((q-.74)/.26)
  else:pitch=0
 else:
  q=(u-duty)/(1-duty);h00=2*q**3-3*q*q+1;h10=q**3-2*q*q+q;h01=-2*q**3+3*q*q;h11=q**3-q*q
  tangent=stride/duty*(1-duty)
  y=h00*stride/2+h10*tangent-h01*stride/2+h11*tangent
  h=height*sin(pi*q)**1.35
  pitch=math.radians(18)*(1-smooth(q/.22)) if q<.22 else math.radians(-12)*smooth((q-.50)/.50)
 return y,h,pitch

KEYED=['root','pelvis','spine','chest','neck','head','CTRL_weapon','CTRL_foot.R','CTRL_foot.L','water_jet','trigger','index.01.R','index.02.R','index.03.R']
def pose(kind,t):
 reset_pose();hroot=0;travel=0;hip=0;hipx=0;hiproll=0;hipyaw=0;lean=0;chestyaw=0;headyaw=0;headpitch=0;gunoff=Vector((0,0,0));gunyaw=0;gunpitch=0;shot=0
 fr={s:(arm.bones['foot.'+s].head_local.x,arm.bones['foot.'+s].head_local.y,0,0) for s in ['R','L']}
 if kind=='Idle':
  breath=sin(2*pi*t);hip=.0025*breath;hipx=.003*sin(2*pi*t);hiproll=.006*sin(2*pi*t)
  lean=.008*breath;headpitch=-.008*breath;gunoff.z=.003*breath
 elif kind in ['Walk','Run']:
  run=kind=='Run';duty=.40 if run else .64;stride=.65 if run else .50;height=.23 if run else .085
  hip=(-.094+.018*cos(4*pi*(t-.43))) if run else (-.018-.021*cos(4*pi*t))
  hipx=(.012 if run else .016)*sin(2*pi*t);hiproll=(.020 if run else .026)*sin(2*pi*t)
  hipyaw=(.045 if run else .035)*sin(2*pi*t);chestyaw=-.55*hipyaw
  lean=math.radians(8 if run else 3);headpitch=-lean*.48
  for s,ph in [('R',t),('L',t+.5)]:
   y,h,p=gait(ph,duty,stride,height)
   fr[s]=(-.125 if s=='R' else .125,y,h,p*(1.05 if run else .7))
  gunoff=Vector((.003*sin(2*pi*t),-.007 if run else 0,.005*sin(4*pi*t)))
 elif kind=='Jump':
  hip=lerpkeys(t,[(0,0),(.19,-.15),(.29,-.025),(.45,-.025),(.69,-.025),(.79,-.15),(1,0)])
  lean=lerpkeys(t,[(0,0),(.19,.17),(.33,.035),(.66,.020),(.79,.14),(1,0)])
  headpitch=-lean*.55
  alpha=max(0,min(1,(t-.29)/.40));air=sin(pi*alpha) if .29<t<.69 else 0
  hroot=.38*4*alpha*(1-alpha) if .29<t<.69 else 0
  for s in ['R','L']:
   a=arm.bones['foot.'+s].head_local
   pitch=lerpkeys(t,[(0,0),(.20,0),(.29,.28),(.44,.04),(.62,-.12),(.70,0),(1,0)])
   fr[s]=(a.x,a.y+.085*air,.090*air,pitch)
  gunoff.z=-.014*sin(pi*t)**2
 elif kind=='RunJump':
  if t<=.73:travel=-2.12*t
  else:
   stop=(t-.73)/.27;travel=-2.12*.73-(1.85-2.12*.73)*(1-(1-stop)**2)
  hip=lerpkeys(t,[(0,-.065),(.18,-.14),(.30,-.055),(.54,-.06),(.73,-.045),(.83,-.15),(1,-.025)])
  lean=lerpkeys(t,[(0,.11),(.18,.18),(.38,.08),(.67,.09),(.84,.16),(1,.045)]);headpitch=-lean*.50
  a=max(0,min(1,(t-.24)/.49));air=sin(pi*a) if .24<t<.73 else 0
  hroot=.43*4*a*(1-a) if .24<t<.73 else 0
  ry=lerpkeys(t,[(0,-.23),(.20,.16),(.37,.19),(.59,.10),(.76,.13),(1,.015)])
  ly=lerpkeys(t,[(0,.17),(.20,-.12),(.37,-.24),(.58,-.27),(.74,-.26),(1,-.06)])
  if t<=.20:ry=-.23-travel
  if t>=.73:ly=(-2.12*.73-.26)-travel
  rh=lerpkeys(t,[(0,0),(.20,0),(.25,.04),(.40,.20),(.61,.17),(.78,.08),(.88,0),(1,0)])
  if t>=.78:
   landing_y=(-2.12*.73-.26+.14)-travel
   ry=ry+(landing_y-ry)*smooth((t-.78)/.10)
  lh=lerpkeys(t,[(0,.09),(.18,.12),(.39,.13),(.60,.045),(.73,0),(1,0)])
  fr['R']=(-.13,ry,rh,math.radians(10)*air);fr['L']=(.13,ly,lh,math.radians(-10)*air)
 elif kind=='Shoot':
  aim=lerpkeys(t,[(0,0),(.25,1),(.75,1),(1,0)])
  for center in [.39,.51,.63]:shot+=exp(-((t-center)/.025)**2)
  shot=min(1,shot);gunyaw=-pi/4*aim;gunpitch=math.radians(-5*aim-1.5*shot)
  gunoff=Vector((-.0035*shot,.080*aim,.150*aim+.0015*shot))
  chestyaw=math.radians(8)*aim;headyaw=math.radians(43)*aim;headpitch=-.015*aim
  hip=-.018*aim;lean=.015*aim
 local_translate('root',(0,travel,hroot))
 local_translate('pelvis',(hipx,0,hip));local_rot('pelvis',(lean*.25,hiproll,hipyaw))
 local_rot('spine',(lean*.42,-hiproll*.2,chestyaw*.35));local_rot('chest',(lean*.33,-hiproll*.25,chestyaw*.65))
 local_rot('neck',(headpitch*.3,0,headyaw*.20));local_rot('head',(headpitch*.7,0,headyaw*.80))
 bpy.context.view_layer.update()
 wp=rest['CTRL_weapon'].translation;rot=Euler((0,gunpitch,gunyaw),'XYZ').to_matrix().to_4x4()
 PB['CTRL_weapon'].matrix=bone_delta('chest')@Matrix.Translation(gunoff)@Matrix.Translation(wp)@rot@Matrix.Translation(-wp)@rest['CTRL_weapon']
 for s,(x,y,h,p) in fr.items():foot(s,x,y,h,p)
 if shot>.03:
  PB['water_jet'].scale=(.65+.35*shot,.42+.65*shot,.65+.35*shot)
 else:PB['water_jet'].scale=(.0001,.0001,.0001)
 PB['trigger'].rotation_quaternion=Quaternion((1,0,0),-.16*shot)
 for i,ang in [(1,.015),(2,.055),(3,.080)]:PB[f'index.{i:02d}.R'].rotation_quaternion=Quaternion((0,0,1),ang*shot)
 bpy.context.view_layer.update()
 return {'root_height':hroot,'travel':travel,'shot':shot,'feet':fr}

rig.animation_data_create();meta=[]
for kind,frames,loop in [('Idle',90,True),('Walk',32,True),('Run',22,True),('Jump',42,False),('Shoot',75,False),('RunJump',48,False)]:
 action=bpy.data.actions.new(kind);action.use_fake_user=True;slot=action.slots.new(id_type='OBJECT',name=rig.name)
 rig.animation_data.action=action;rig.animation_data.action_slot=slot
 lastq={};metrics=[]
 for k in range(frames+1):
  scene.frame_set(k+1);state=pose(kind,k/frames)
  for name in KEYED:
   p=PB[name];q=p.rotation_quaternion
   if name in lastq and q.dot(lastq[name])<0:q.negate()
   lastq[name]=q.copy()
   p.keyframe_insert(data_path='location',frame=k+1,group=name);p.keyframe_insert(data_path='rotation_quaternion',frame=k+1,group=name);p.keyframe_insert(data_path='scale',frame=k+1,group=name)
  errors={}
  for side in ['R','L']:
   errors['ankle.'+side]=(PB['shin.'+side].tail-PB['CTRL_foot.'+side].head).length
   errors['wrist.'+side]=(PB['forearm.'+side].tail-PB['CTRL_hand.'+side].head).length
  metrics.append({'frame':k+1,'ik_error_m':errors,'root_height':state['root_height'],'travel':state['travel'],'shot':state['shot']})
 for layer in action.layers:
  for strip in layer.strips:
   cb=strip.channelbag(slot)
   if cb:
    for fc in cb.fcurves:
     for key in fc.keyframe_points:key.interpolation='LINEAR'
 action['loop']=loop;action['fps']=30;action['duration_seconds']=frames/30
 action['movement']='forward root motion 1.85m' if kind=='RunJump' else 'in place / grounded origin'
 track=rig.animation_data.nla_tracks.new();track.name=kind;track.mute=True
 st=track.strips.new(kind,1,action);st.action_slot=slot;st.blend_type='REPLACE';st.extrapolation='NOTHING'
 meta.append({'name':kind,'frames':[1,frames+1],'seconds':frames/30,'loop':loop,'root_motion':kind=='RunJump','max_ik_error_m':max(max(m['ik_error_m'].values()) for m in metrics)})
 json.dump(metrics,open(OUT+'/qa/'+kind+'_pose_metrics.json','w'),indent=2)
 print('ACTION_READY',kind,meta[-1],flush=True)

idle=bpy.data.actions['Idle'];rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0]
scene.frame_start=1;scene.frame_end=91;scene.frame_set(1);pose('Idle',0)
scene.camera=bpy.data.objects['AWB.Camera.ThreeQuarter'];scene.render.fps=30
scene.timeline_markers.clear()
for f,n in [(1,'IDLE / breathe'),(24,'select Action to preview other clips')]:scene.timeline_markers.new(n,frame=f)
rig['Animation_notes']='Walk and Run are seamless in-place cycles. Jump and Shoot return to ready pose. RunJump has -Y root motion. Water pulse is a separately skinned optional effect.'
json.dump(meta,open(OUT+'/qa/actions.json','w'),indent=2)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/AnimeWatergunBoy_Rigged.blend')
print('ACTIONS_SAVED',len(meta),flush=True)
