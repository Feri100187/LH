"""Copy imported clip binaries into the existing native assets, preserving their UUIDs.

Run only after prepare-player-assets.py and Laya's waitAssetBusy have completed.
Scene, prefab, material and controller JSON are edited separately through the IDE MCP.
"""
from pathlib import Path
import hashlib, json, shutil, uuid

ROOT = Path(__file__).resolve().parents[1]
report = json.loads((ROOT/'docs/player_avatar/game_model_import.json').read_text(encoding='utf-8'))
native = ROOT/'assets/characters/AnimeWatergunPlayer-unpacked'
backup = ROOT/'backups/player_view_direction_20260920/native_clips'
backup.mkdir(parents=True, exist_ok=True)
results = []
for clip in report['clips']:
    imported = ROOT/'library'/report['model_uuid'][:2]/(clip['uuid']+'.lani')
    target = native/(clip['name']+'.lani')
    meta = target.with_suffix('.lani.meta')
    assert imported.is_file(), clip['name']
    old, new = target.read_bytes() if target.exists() else b'', imported.read_bytes()
    assert len(new) > 100 and b'LAYAANIMATION' in new[:100], f'Invalid clip binary: {imported}'
    saved = backup/target.name
    if target.exists() and not saved.exists():
        shutil.copy2(target, saved)
        shutil.copy2(meta, backup/meta.name)
    if not meta.exists():
        meta.write_text(json.dumps({'uuid':str(uuid.uuid4()),'previewHost':'22760ead-afd0-48cf-8155-7a1974793221'},indent=2),encoding='utf-8')
    target.write_bytes(new)
    results.append({'name':clip['name'], 'duration':clip['duration'],
                    'native_uuid':json.loads(meta.read_text(encoding='utf-8'))['uuid'],
                    'source_sha256':hashlib.sha256(new).hexdigest(),
                    'previous_sha256':hashlib.sha256(old).hexdigest(),
                    'changed':new != old})
out = ROOT/'docs/player_view_direction/native_animation_update.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps({'clips':len(results), 'changed':sum(c['changed'] for c in results), 'report':str(out)}))
