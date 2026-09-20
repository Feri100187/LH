import json,struct
BASE='D:/a/xiang_mu/LH/'
OUT=BASE+'source_art/AnimeWatergunBoy/first_person_20260920/'
OLD=BASE+'backups/player_camera_arm_20260920/source_fps/WatergunArms.glb'
def read(path):
    raw=open(path,'rb').read();size=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+size]);offset=20+size;length=struct.unpack_from('<I',raw,offset)[0]
    return doc,raw[offset+8:offset+8+length]
def payload(doc,binary,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    size=components*{5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a['componentType']]
    offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size)
    return (a['type'],a['componentType'],a['count'],b''.join(binary[offset+i*stride:offset+i*stride+size] for i in range(a['count'])))
old,ob=read(OLD);new,nb=read(OUT+'WatergunArms.glb')
changed=[]
for om,nm in zip(old['meshes'],new['meshes']):
    equal=om['name']==nm['name'] and len(om['primitives'])==len(nm['primitives'])
    for op,np in zip(om['primitives'],nm['primitives']):
        equal=equal and op.get('material')==np.get('material') and op['attributes'].keys()==np['attributes'].keys()
        for key in op['attributes'].keys()&np['attributes'].keys():
            equal=equal and payload(old,ob,op['attributes'][key])==payload(new,nb,np['attributes'][key])
        equal=equal and payload(old,ob,op['indices'])==payload(new,nb,np['indices'])
    if not equal:changed.append(nm['name'])
animations=[]
for oa,na in zip(old['animations'],new['animations']):
    equal=oa['name']==na['name'] and oa['channels']==na['channels']
    for os,ns in zip(oa['samplers'],na['samplers']):
        equal=equal and payload(old,ob,os['input'])==payload(new,nb,ns['input'])
        equal=equal and payload(old,ob,os['output'])==payload(new,nb,ns['output'])
    animations.append({'name':na['name'],'all_channel_samples_binary_identical':equal})
result={'changed_mesh_data':changed,'mesh_name_order_unchanged':[m['name'] for m in old['meshes']]==[m['name'] for m in new['meshes']],
        'materials_binary_json_identical':old['materials']==new['materials'],
        'joint_order_unchanged':old['skins'][0]['joints']==new['skins'][0]['joints'],
        'inverse_bind_binary_identical':payload(old,ob,old['skins'][0]['inverseBindMatrices'])==payload(new,nb,new['skins'][0]['inverseBindMatrices']),
        'animation_clips':animations}
json.dump(result,open(OUT+'qa/scope_diff.json','w'),indent=2)
print(json.dumps(result,indent=2))
