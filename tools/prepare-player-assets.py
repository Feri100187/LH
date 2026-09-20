"""Create the game's in-place GLB derivative; never overwrite the authored source."""
from pathlib import Path
import json,struct,math,uuid,copy,hashlib,argparse
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--animations',type=Path,help='Re-authored GLB animations; retain the original game geometry and bind pose')
parser.add_argument('--model-source',type=Path,help='Authored GLB geometry source, including approved mesh refinements')
args=parser.parse_args()
SRC=args.model_source or ROOT/'source_art/AnimeWatergunBoy/rigged_20260919/AnimeWatergunBoy_Rigged.glb'
DEST=ROOT/'assets/characters/AnimeWatergunPlayer.glb'
DOC=ROOT/'docs/player_avatar';DOC.mkdir(parents=True,exist_ok=True)
raw=SRC.read_bytes();pos=12;g=None;data=None
while pos<len(raw):
 n,t=struct.unpack_from('<II',raw,pos);pos+=8;c=raw[pos:pos+n];pos+=n
 if t==0x4e4f534a:g=json.loads(c)
 if t==0x004e4942:data=bytearray(c)
assert g and data
# Laya's importer assumes every scene has a nodes array; Blender also exported
# an unused empty original scene. Keep only the selected character scene.
g['scenes']=[g['scenes'][g.get('scene',0)]]
g['scene']=0
component={5126:('f',4),5123:('H',2),5125:('I',4),5121:('B',1)}
width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def read(index):
 a=g['accessors'][index];b=g['bufferViews'][a['bufferView']];fmt,size=component[a['componentType']];count=width[a['type']]
 offset=b.get('byteOffset',0)+a.get('byteOffset',0);stride=b.get('byteStride',size*count)
 return [list(struct.unpack_from('<'+fmt*count,data,offset+i*stride)) for i in range(a['count'])]
def append(rows,type_name):
 while len(data)%4:data.append(0)
 offset=len(data)
 for r in rows:data.extend(struct.pack('<'+'f'*len(r),*r))
 view=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data)-offset})
 a={'bufferView':view,'componentType':5126,'count':len(rows),'type':type_name}
 if type_name=='SCALAR':a['min']=[min(r[0] for r in rows)];a['max']=[max(r[0] for r in rows)]
 idx=len(g['accessors']);g['accessors'].append(a);return idx

animation_source=None
if args.animations:
 ar=args.animations.read_bytes();ap=12;ag=None;ad=None
 while ap<len(ar):
  an,at=struct.unpack_from('<II',ar,ap);ap+=8;ac=ar[ap:ap+an];ap+=an
  if at==0x4e4f534a:ag=json.loads(ac)
  elif at==0x004e4942:ad=ac
 assert ag and ad
 def animation_read(index):
  a=ag['accessors'][index];b=ag['bufferViews'][a['bufferView']];fmt,size=component[a['componentType']];count=width[a['type']]
  offset=b.get('byteOffset',0)+a.get('byteOffset',0);stride=b.get('byteStride',size*count)
  return [list(struct.unpack_from('<'+fmt*count,ad,offset+i*stride)) for i in range(a['count'])]
 by_name={n.get('name'):i for i,n in enumerate(g['nodes'])}
 original_joints={g['nodes'][j]['name']:m for skin in g['skins'] for j,m in zip(skin['joints'],read(skin['inverseBindMatrices']))}
 changed_joints={ag['nodes'][j]['name']:m for skin in ag['skins'] for j,m in zip(skin['joints'],animation_read(skin['inverseBindMatrices']))}
 bind_error=max(abs(v-w) for name,m in original_joints.items() for v,w in zip(m,changed_joints[name]))
 assert bind_error<1e-4, f'Animation skin bind pose differs from original: {bind_error}'
 new_actions=[]
 for action in ag['animations']:
  out={'name':action['name'],'samplers':[],'channels':[]}
  for sampler in action['samplers']:
   out['samplers'].append({'input':append(animation_read(sampler['input']),'SCALAR'),
     'output':append(animation_read(sampler['output']),ag['accessors'][sampler['output']]['type']),
     'interpolation':sampler.get('interpolation','LINEAR')})
  for channel in action['channels']:
   target=copy.deepcopy(channel['target']);target['node']=by_name[ag['nodes'][target['node']]['name']]
   out['channels'].append({'sampler':channel['sampler'],'target':target})
  new_actions.append(out)
 assert {a['name'] for a in g['animations']} <= {a['name'] for a in new_actions}
 assert len({a['name'] for a in new_actions}) == len(new_actions)
 g['animations']=new_actions
 animation_source={'path':str(args.animations),'sha256':hashlib.sha256(ar).hexdigest(),'maximum_bind_matrix_error':bind_error}
# Laya 3.4.1 reads COLOR as four floats unconditionally and its vertex shader
# gamma-decodes vertex RGB. Preserve the original linear colors in this target.
color_meshes=[]
for mesh_id,mesh in enumerate(g['meshes']):
 for primitive in mesh['primitives']:
  a=primitive['attributes'].get('COLOR_0')
  if a is None:continue
  rows=read(a)
  if g['accessors'][a].get('normalized'):
   denom=255 if g['accessors'][a]['componentType']==5121 else 65535
   rows=[[v/denom for v in row] for row in rows]
  rgba=[[max(0,v)**(1/2.2) for v in row[:3]]+[row[3] if len(row)>3 else 1] for row in rows]
  primitive['attributes']['COLOR_0']=append(rgba,'VEC4')
  color_meshes.append({'index':mesh_id,'name':mesh['name']})
root_id=next(i for i,n in enumerate(g['nodes']) if n.get('name')=='root')
removed=0
for anim in g['animations']:
 channels=[]
 for c in anim['channels']:
  if c['target']['node']==root_id and c['target']['path']=='translation':removed+=1
  else:channels.append(c)
 anim['channels']=channels
def sample(times,values,t,rotation):
 if t<=times[0]:return values[0]
 if t>=times[-1]:return values[-1]
 import bisect
 i=bisect.bisect_right(times,t)-1;f=(t-times[i])/(times[i+1]-times[i]);a=values[i];b=values[i+1]
 if rotation:
  dot=sum(x*y for x,y in zip(a,b))
  if dot<0:b=[-v for v in b];dot=-dot
  if dot<.9995:
   theta=math.acos(max(-1,min(1,dot)));sn=math.sin(theta)
   return [(x*math.sin((1-f)*theta)+y*math.sin(f*theta))/sn for x,y in zip(a,b)]
  v=[x+(y-x)*f for x,y in zip(a,b)];norm=math.sqrt(sum(x*x for x in v));return [x/norm for x in v]
 return [x+(y-x)*f for x,y in zip(a,b)]
def cut(source,name,start,end):
 a=next(a for a in g['animations'] if a['name']==source);out={'name':name,'channels':[],'samplers':[]}
 for c in a['channels']:
  s=a['samplers'][c['sampler']];times=[r[0] for r in read(s['input'])];values=read(s['output'])
  ts=[start]+[v for v in times if start+1e-6<v<end-1e-6]+[end]
  vals=[sample(times,values,t,c['target']['path']=='rotation') for t in ts]
  si=len(out['samplers']);out['samplers'].append({'input':append([[t-start] for t in ts],'SCALAR'),'output':append(vals,g['accessors'][s['output']]['type']),'interpolation':'LINEAR'})
  out['channels'].append({'sampler':si,'target':copy.deepcopy(c['target'])})
 g['animations'].append(out)
for args in [('Jump','JumpAir',.29*1.4,.69*1.4),('Jump','JumpLand',.69*1.4,1.4),('RunJump','RunJumpAir',.24*1.6,.73*1.6),('RunJump','RunJumpLand',.73*1.6,1.6)]:cut(*args)
parents={c:p for p,n in enumerate(g['nodes']) for c in n.get('children',[])}
def path(i):
 arr=[]
 while True:
  arr.append(g['nodes'][i]['name'])
  if i not in parents:break
  i=parents[i]
 return '/'.join(reversed(arr))
spine=next(i for i,n in enumerate(g['nodes']) if n.get('name')=='spine');upper={}
def visit(i):
 upper[path(i)]=True
 for child in g['nodes'][i].get('children',[]):visit(child)
visit(spine)
mask={'_avatarPathMap':upper}
g['buffers'][0]['byteLength']=len(data)
jb=json.dumps(g,separators=(',',':'),ensure_ascii=False).encode('utf-8');jb+=b' '*((-len(jb))%4);data+=b'\0'*((-len(data))%4)
glb=struct.pack('<III',0x46546c67,2,12+8+len(jb)+8+len(data))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(data),0x004e4942)+data
meta_path=DEST.with_suffix('.glb.meta');meta=json.loads(meta_path.read_text()) if meta_path.exists() else {'uuid':str(uuid.uuid4())}
meta['importer']={'scaleFactor':1,'AnimCompression':False};meta_path.write_text(json.dumps(meta,indent=2),encoding='utf-8')
DEST.write_bytes(glb)
clips=[]
for i,a in enumerate(g['animations']):
 duration=max(read(s['input'])[-1][0] for s in a['samplers']);clips.append({'name':a['name'],'uuid':meta['uuid']+'@lani'+str(i),'duration':duration})
json.dump(mask,open(DOC/'upper_body_mask.json','w'),indent=2)
info={'source':str(SRC),'source_sha256':hashlib.sha256(raw).hexdigest(),'model_uuid':meta['uuid'],'prefab_uuid':meta['uuid']+'@0','root_translation_tracks_removed':removed,'root_default_translation':g['nodes'][root_id].get('translation'),'clips':clips,'upper_body_paths':list(upper),'color_meshes':color_meshes,'vertex_color_compatibility':'RGBA with Laya vertex gamma-decode compensation','triangles_source_preserved':True}
if animation_source:info['animation_source']=animation_source
json.dump(info,open(DOC/'game_model_import.json','w'),indent=2)
print(json.dumps(info))
