from pathlib import Path
import json,hashlib,zipfile,datetime
root=Path('D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919')
read=lambda p:json.loads((root/p).read_text(encoding='utf-8'))
src=read('qa/source_preservation.json')
assert hashlib.sha256(Path(src['path']).read_bytes()).hexdigest()==src['sha256']
assert read('qa/rig_animation_quality.json')['status']=='PASS'
assert read('qa/glb_roundtrip_comparison.json')['status']=='PASS'
assert read('qa/video_validation.json')['status']=='PASS'
validation=read('qa/animated_glb_validation.json')
files=[root/'AnimeWatergunBoy_Rigged.blend',root/'AnimeWatergunBoy_Rigged.glb',root/'骨骼与动作说明.md']
files+=sorted((root/'previews').glob('*.mp4'))+sorted((root/'previews').glob('GLB_*.png'))
files+=sorted((root/'scripts').glob('*.py'))
for name in ['actions.json','source_preservation.json','rig_animation_quality.json','animated_glb_validation.json','glb_roundtrip_comparison.json','video_validation.json']:
 files.append(root/'qa'/name)
records=[]
for p in files:
 data=p.read_bytes();records.append({'file':p.relative_to(root).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
glbhash=hashlib.sha256((root/'AnimeWatergunBoy_Rigged.glb').read_bytes()).hexdigest()
manifest={'created':datetime.datetime.now().isoformat(timespec='seconds'),'asset':'AnimeWatergunBoy rigged animation set','actions':['Idle','Walk','Run','Jump','Shoot','RunJump'],'fps':30,'blender_bones':64,'exported_joints':55,'source_static_unchanged':True,'glb_sha256':glbhash,'validation_reports':['qa/rig_animation_quality.json','qa/animated_glb_validation.json','qa/glb_roundtrip_comparison.json','qa/video_validation.json'],'files':records}
mf=root/'qa/delivery_manifest.json';mf.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8');files.append(mf)
dest=root/'AnimeWatergunBoy_Animated_Delivery.zip'
with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in files:z.write(p,p.relative_to(root).as_posix())
with zipfile.ZipFile(dest) as z:
 assert z.testzip() is None
 assert all(p in z.namelist() for p in ['AnimeWatergunBoy_Rigged.blend','AnimeWatergunBoy_Rigged.glb','previews/00_AllActions.mp4'])
print(json.dumps({'status':'PASS','zip':str(dest),'bytes':dest.stat().st_size,'entries':len(files),'glb_sha256':glbhash,'source_unchanged':True},ensure_ascii=False))
