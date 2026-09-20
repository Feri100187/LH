"""Apply the existing Laya vertex-color compatibility treatment to the FPS derivative."""
from pathlib import Path
import json, struct, uuid
ROOT=Path(__file__).resolve().parents[1]
src=ROOT/'source_art/AnimeWatergunBoy/first_person_20260920/WatergunArms.glb'
dest=ROOT/'assets/characters/WatergunArms.glb'
raw=src.read_bytes();p=12;g=None;data=None
while p<len(raw):
 n,t=struct.unpack_from('<II',raw,p);p+=8;c=raw[p:p+n];p+=n
 if t==0x4e4f534a:g=json.loads(c)
 elif t==0x004e4942:data=bytearray(c)
g['scenes']=[g['scenes'][g.get('scene',0)]];g['scene']=0
colored=[]
for mesh_index, mesh in enumerate(g['meshes']):
 for primitive in mesh['primitives']:
  index=primitive['attributes'].get('COLOR_0')
  if index is None:continue
  a=g['accessors'][index];v=g['bufferViews'][a['bufferView']]
  fmt,size,denom={5126:('f',4,1),5121:('B',1,255),5123:('H',2,65535)}[a['componentType']]
  width={'VEC3':3,'VEC4':4}[a['type']];stride=v.get('byteStride',size*width)
  start=v.get('byteOffset',0)+a.get('byteOffset',0);rows=[]
  for i in range(a['count']):
   row=struct.unpack_from('<'+fmt*width,data,start+i*stride)
   if a.get('normalized'):row=[x/denom for x in row]
   rows.append([max(0,x)**(1/2.2) for x in row[:3]]+[row[3] if width==4 else 1])
  data+=b'\0'*((-len(data))%4);offset=len(data)
  for row in rows:data.extend(struct.pack('<4f',*row))
  view=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data)-offset})
  primitive['attributes']['COLOR_0']=len(g['accessors'])
  g['accessors'].append({'bufferView':view,'componentType':5126,'count':len(rows),'type':'VEC4'})
  colored.append({'mesh':mesh['name'],'mesh_index':mesh_index,'material':g['materials'][primitive['material']]['name']})
g['buffers'][0]['byteLength']=len(data)
js=json.dumps(g,separators=(',',':')).encode();js+=b' '*((-len(js))%4);data+=b'\0'*((-len(data))%4)
out=struct.pack('<III',0x46546c67,2,28+len(js)+len(data))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data
mp=dest.with_suffix('.glb.meta')
meta=json.loads(mp.read_text()) if mp.exists() else {'uuid':str(uuid.uuid4())}
meta['importer']={'scaleFactor':1,'AnimCompression':False};mp.write_text(json.dumps(meta,indent=2));dest.write_bytes(out)
report={'source':str(src),'destination':str(dest),'uuid':meta['uuid'],'colored_meshes':colored,'clips':[a['name'] for a in g['animations']]}
(ROOT/'docs/player_view_direction/fps_import.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
