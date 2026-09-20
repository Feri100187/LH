"""Synchronize selected imported meshes without changing native prefab/bone/material UUIDs."""
from pathlib import Path
import argparse, json, struct, shutil, hashlib

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--indices',type=int,nargs='+',required=True)
parser.add_argument('--backup',type=Path,required=True)
parser.add_argument('--report',type=Path,required=True)
args=parser.parse_args()
model=ROOT/'assets/characters/AnimeWatergunPlayer.glb'
raw=model.read_bytes();length=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+length])
model_uuid=json.loads(model.with_suffix('.glb.meta').read_text())['uuid']
native=ROOT/'assets/characters/AnimeWatergunPlayer-unpacked'
prefab=json.loads((native/'AnimeWatergunPlayer.lh').read_text(encoding='utf-8'))
native_mesh_by_object={}
def visit(node):
    for component in node.get('_$comp',[]):
        if component.get('_$type')=='MeshFilter':
            native_mesh_by_object[node['name']]=component['sharedMesh']['_$uuid']
    for child in node.get('_$child',[]):visit(child)
visit(prefab)
paths={json.loads(p.read_text(encoding='utf-8'))['uuid']:p.with_suffix('') for p in native.glob('*.lm.meta')}
args.backup.mkdir(parents=True,exist_ok=True)
rows=[]
for index in sorted(set(args.indices)):
    objects=[n['name'] for n in g['nodes'] if n.get('mesh')==index]
    targets={paths[native_mesh_by_object[name]] for name in objects}
    assert objects and targets, (index,objects)
    imported=ROOT/'library'/model_uuid[:2]/f'{model_uuid}@lm{index}.lm'
    assert imported.is_file() and imported.stat().st_size>100, imported
    assert imported.stat().st_mtime+1>=model.stat().st_mtime, f'Import not ready: {imported}'
    new=imported.read_bytes()
    for target in targets:
        old=target.read_bytes()
        saved=args.backup/target.name
        if not saved.exists():
            shutil.copy2(target,saved)
            shutil.copy2(target.with_suffix('.lm.meta'),args.backup/(target.name+'.meta'))
        target.write_bytes(new)
        rows.append({'index':index,'mesh':g['meshes'][index]['name'],'objects':objects,
          'native_file':str(target.relative_to(ROOT)),'uuid':json.loads(target.with_suffix('.lm.meta').read_text())['uuid'],
          'old_sha256':hashlib.sha256(old).hexdigest(),'new_sha256':hashlib.sha256(new).hexdigest(),'changed':old!=new})
args.report.parent.mkdir(parents=True,exist_ok=True)
args.report.write_text(json.dumps(rows,indent=2),encoding='utf-8')
print(json.dumps({'synced':len(rows),'changed':sum(row['changed'] for row in rows),'report':str(args.report)}))
