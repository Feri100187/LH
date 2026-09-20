import json,struct,numpy as np
ROOT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/'
def read(path):
    raw=open(path,'rb').read();p=12;doc=None;binary=None
    while p<len(raw):
        length,kind=struct.unpack_from('<II',raw,p);chunk=raw[p+8:p+8+length];p+=8+length
        if kind==0x4e4f534a:doc=json.loads(chunk)
        elif kind==0x004e4942:binary=chunk
    return doc,binary
def data(doc,binary,index):
    a=doc['accessors'][index];view=doc['bufferViews'][a['bufferView']]
    size={'SCALAR':1,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    assert a['componentType']==5126
    return np.frombuffer(binary,dtype='<f4',count=a['count']*size,offset=view.get('byteOffset',0)+a.get('byteOffset',0))
def channels(doc,binary,name):
    a=next(x for x in doc['animations'] if x['name']==name);out={}
    for c in a['channels']:
        sample=a['samplers'][c['sampler']]
        key=(doc['nodes'][c['target']['node']]['name'],c['target']['path'])
        out[key]=(data(doc,binary,sample['input']),data(doc,binary,sample['output']))
    return out
old,ob=read(ROOT+'gameplay_20260920/AnimeWatergunBoy_Gameplay.glb')
new,nb=read(ROOT+'directional_20260920/AnimeWatergunBoy_Directional.glb')
result=[]
for name in ['Idle','Walk','Run','Jump','Shoot','RunJump']:
    a=channels(old,ob,name);b=channels(new,nb,name);assert a.keys()==b.keys()
    difference=max(float(np.max(np.abs(x-y))) for key in a for x,y in zip(a[key],b[key]))
    result.append({'name':name,'channels':len(a),'max_float_difference':difference})
assert all(x['max_float_difference']<1e-5 for x in result)
report={'status':'PASS','actions':result}
json.dump(report,open(ROOT+'directional_20260920/qa/preserved_original_actions.json','w'),indent=2)
print(json.dumps(report))
