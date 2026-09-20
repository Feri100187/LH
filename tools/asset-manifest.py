"""Shared, fail-closed source selection for the stable asset preparation recipes."""
from pathlib import Path
import hashlib, json, tempfile

ROOT = Path(__file__).resolve().parents[1]

def load_manifest():
    return json.loads((ROOT/'config/assets.manifest.json').read_text(encoding='utf-8-sig'))

def approved_source(group_name, supplied=None):
    group = load_manifest()['groups'][group_name]
    expected = (ROOT/group['sourceGlb']['path']).resolve()
    chosen = Path(supplied).resolve() if supplied else expected
    if chosen != expected:
        raise ValueError(f'Unapproved source: {chosen}. Stable {group_name} source is {expected}. Update the manifest through an explicit reviewed baseline change; historical models are not import defaults.')
    raw = chosen.read_bytes()
    if raw.startswith(b'version https://git-lfs.github.com/spec/v1'):
        raise ValueError(f'Git LFS resource is not restored: {chosen}. Run git lfs pull.')
    digest = hashlib.sha256(raw).hexdigest()
    if digest != group['sourceGlb']['sha256']:
        raise ValueError(f'Approved source hash changed: {chosen}')
    return group, chosen

def preparation_paths(group_name, output_dir=None):
    group = load_manifest()['groups'][group_name]
    cache = ROOT/'.baseline-cache'
    cache.mkdir(exist_ok=True)
    output = Path(output_dir).resolve() if output_dir else Path(tempfile.mkdtemp(prefix=f'prepare-{group_name}-',dir=cache))
    if not output.is_relative_to(cache.resolve()):
        raise ValueError('Preparation only writes under this checkout\'s .baseline-cache; use npm run assets:import to validate the approved runtime resources.')
    output.mkdir(parents=True,exist_ok=True)
    canonical_meta = ROOT/(group['gameGlb']['path']+'.meta')
    meta = json.loads(canonical_meta.read_text(encoding='utf-8-sig'))
    if meta['uuid'] != group['gameGlb']['uuid']:
        raise ValueError('Runtime model UUID differs from the stable manifest.')
    return output/Path(group['gameGlb']['path']).name, output, canonical_meta
