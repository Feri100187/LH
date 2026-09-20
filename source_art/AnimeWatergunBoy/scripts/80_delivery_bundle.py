from pathlib import Path
import json,hashlib,zipfile,struct,datetime
root=Path('D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy')
validation=json.loads((root/'qa/glb_validation.json').read_text(encoding='utf-8'))
assert validation['status']=='PASS'
assert (root/'AnimeWatergunBoy.glb').stat().st_size==validation['file_bytes']
files=[root/'AnimeWatergunBoy.blend',root/'AnimeWatergunBoy.glb',root/'交付说明.md']
files+=sorted((root/'previews').glob('*.png'))
files+=sorted((root/'textures').glob('*.png'))
files+=sorted((root/'reference').glob('*.png'))
files+=sorted((root/'scripts').glob('*.py'))
files+=[root/'qa/glb_validation.json',root/'qa/blend_geometry_report.json',root/'qa/hand_contact_checked.json']
files+=sorted((root/'qa').glob('GLB_checked_*.png'))
records=[]
for path in files:
    data=path.read_bytes();entry={'file':path.relative_to(root).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    if path.suffix=='.png':
        assert data[:8]==b'\x89PNG\r\n\x1a\n'
        entry['pixels']=list(struct.unpack_from('>II',data,16))
    records.append(entry)
manifest={'asset':'AnimeWatergunBoy','created_local':datetime.datetime.now().isoformat(timespec='seconds'),'visual_review':['Final GLB front','Final GLB side','Final GLB back','Final GLB three-quarter','Final face detail','Final hands detail','Final shoes detail'],'glb_check':validation,'files':records}
mp=root/'qa/delivery_manifest.json';mp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8');files.append(mp)
dest=root/'AnimeWatergunBoy_Delivery.zip'
with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for path in files:archive.write(path,path.relative_to(root).as_posix())
with zipfile.ZipFile(dest) as archive:
    assert archive.testzip() is None
    assert {'AnimeWatergunBoy.blend','AnimeWatergunBoy.glb','previews/01_Front.png','previews/02_Side.png','previews/03_Back.png','previews/04_ThreeQuarter.png'}.issubset(archive.namelist())
print(json.dumps({'zip':str(dest),'bytes':dest.stat().st_size,'entries':len(files),'glb_sha256':next(r['sha256'] for r in records if r['file']=='AnimeWatergunBoy.glb'),'status':'PASS'},ensure_ascii=False))
