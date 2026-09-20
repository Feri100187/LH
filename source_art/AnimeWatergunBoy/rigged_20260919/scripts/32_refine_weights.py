import bpy,math,json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919'
scene=bpy.data.scenes['AWB_Animated'];bpy.context.window.scene=scene;rig=bpy.data.objects['AWB_Rig'];arm=rig.data
B={b.name:(b.head_local.copy(),b.tail_local.copy()) for b in arm.bones}
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def mix(a,b,t):
 d={k:v*(1-t) for k,v in a.items()}
 for k,v in b.items():d[k]=d.get(k,0)+v*t
 return d
def normal(w):
 w=dict(sorted([(k,v) for k,v in w.items() if v>1e-5],key=lambda p:p[1],reverse=True)[:4]);tot=sum(w.values());return {k:v/tot for k,v in w.items()}
def segment(p,a,b):
 d=b-a;t=max(0,min(1,(p-a).dot(d)/d.length_squared));return (p-a-d*t).length
def torso(p):
 if p.z<1.155:return mix({'pelvis':1},{'spine':1},smooth((p.z-1.00)/.155))
 return mix({'spine':1},{'chest':1},smooth((p.z-1.155)/.175))
def armweight(p,s):
 a,b=B['upper_arm.'+s];c=B['forearm.'+s][1];u=(b-a).normalized();l=(c-b).normalized();n=(u+l).normalized()
 fore=smooth(((p-b).dot(n)+.050)/.100)
 w=mix({'upper_arm.'+s:1},{'forearm.'+s:1},fore)
 shoulder=smooth(((p-a).dot(u)+.028)/.094)
 w=mix({'chest':.40,'clavicle.'+s:.60},w,shoulder)
 hand=smooth(((p-c).dot(l)+.017)/.044)*.38
 return mix(w,{'hand.'+s:1},hand),min(segment(p,a,b),segment(p,b,c))
def jacketweight(p):
 s='R' if p.x<-.013 else 'L';aw,dist=armweight(p,s)
 rx=float(np.interp(p.z,[.97,1.16,1.36,1.45,1.49],[.165,.172,.190,.187,.075]));ry=float(np.interp(p.z,[.97,1.36,1.49],[.096,.108,.055]))
 torso_sdf=(math.sqrt(((p.x+.009)/rx)**2+((p.y-.017)/ry)**2)-1)*.12
 arm_sdf=dist-.067
 influence=smooth((torso_sdf-arm_sdf+.018)/.064)
 if p.z<1.065:influence=0
 return normal(mix(torso(p),aw,influence))
def legweight(p):
 def leg(s):
  knee=B['shin.'+s][0].z
  return mix({'shin.'+s:1},{'thigh.'+s:1},smooth((p.z-knee+.065)/.13))
 if p.z>.79:w=mix(leg('R'),leg('L'),smooth((p.x+.023)/.070))
 else:w=leg('R' if p.x<.012 else 'L')
 h=max(smooth((p.z-.728)/.190),math.exp(-((p.x-.01)/.061)**2)*smooth((p.z-.755)/.080))
 return normal(mix(w,{'pelvis':1},h))
def set_weights(ob,weights):
 for g in list(ob.vertex_groups):ob.vertex_groups.remove(g)
 groups={k:ob.vertex_groups.new(name=k) for k in sorted({k for w in weights for k in w})}
 for i,w in enumerate(weights):
  for k,v in normal(w).items():groups[k].add([i],v,'REPLACE')
def smooth_weights(ob,weights,iterations=5):
 keys=sorted({k for w in weights for k in w});idx={k:i for i,k in enumerate(keys)}
 mat=np.zeros((len(weights),len(keys)))
 for i,w in enumerate(weights):
  for k,v in w.items():mat[i,idx[k]]=v
 edges=np.array([e.vertices[:] for e in ob.data.edges]);degree=np.bincount(edges.ravel(),minlength=len(weights)).reshape(-1,1)
 for _ in range(iterations):
  sm=np.zeros_like(mat);np.add.at(sm,edges[:,0],mat[edges[:,1]]);np.add.at(sm,edges[:,1],mat[edges[:,0]])
  sm/=np.maximum(degree,1);mat=.62*mat+.38*sm
 return [normal({k:float(row[j]) for j,k in enumerate(keys) if row[j]>1e-5}) for row in mat]
jacket=bpy.data.objects['AWB.Jacket continuous shoulder and sleeves'];jw=smooth_weights(jacket,[jacketweight(v.co) for v in jacket.data.vertices],6);set_weights(jacket,jw)
pants=bpy.data.objects['AWB.Pants continuous seat and legs'];pw=smooth_weights(pants,[legweight(v.co) for v in pants.data.vertices],4);set_weights(pants,pw)
def transfer(source,weights,target):
 source.data.calc_loop_triangles();verts=[v.co for v in source.data.vertices];tris=[tuple(t.vertices) for t in source.data.loop_triangles];tree=BVHTree.FromPolygons(verts,tris,all_triangles=True);out=[]
 for v in target.data.vertices:
  q,n,face,d=tree.find_nearest(v.co);ids=tris[face];a,b,c=[verts[k] for k in ids];u=b-a;v1=c-a;v2=q-a
  d00=u.dot(u);d01=u.dot(v1);d11=v1.dot(v1);d20=v2.dot(u);d21=v2.dot(v1);den=d00*d11-d01*d01
  if abs(den)<1e-15:bary=[1,0,0]
  else:
   vj=(d11*d20-d01*d21)/den;wk=(d00*d21-d01*d20)/den;bary=[1-vj-wk,vj,wk]
  w={}
  for i,fac in zip(ids,bary):
   for k,val in weights[i].items():w[k]=w.get(k,0)+val*max(0,fac)
  out.append(normal(w))
 set_weights(target,out)
for name in ['AWB.Clothes | collar pockets and stitched detail','AWB.Clothes | zipper assembly','AWB.Clothes | R ribbed cuff','AWB.Clothes | L ribbed cuff']:
 transfer(jacket,jw,bpy.data.objects[name])
transfer(pants,pw,bpy.data.objects['AWB.Clothes | trouser seam and welts'])
idle=bpy.data.actions['Idle'];rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0];scene.frame_set(1)
bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=OUT+'/AnimeWatergunBoy_Rigged.blend')
print('WEIGHTS_REFINED',flush=True)
