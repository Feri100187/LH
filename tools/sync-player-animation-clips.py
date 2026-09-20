"""Retired animation-clip writer; delegate only to the stable player-resource validator."""

from pathlib import Path
import shutil
import subprocess
import sys

GUIDANCE = (
    "This legacy writer is retired. No runtime files or resource UUIDs are changed.\n"
    "Use: node tools/assets.cjs sync --asset player\n"
    "To prepare or import approved resources, use the documented assets:prepare / assets:import commands."
)

if len(sys.argv) > 1:
    print(GUIDANCE, file=sys.stdout if sys.argv[1:] in (["-h"], ["--help"]) else sys.stderr)
    if sys.argv[1:] in (["-h"], ["--help"]):
        raise SystemExit(0)
    print("Legacy write arguments are no longer accepted.", file=sys.stderr)
    raise SystemExit(2)

try:
    script_file = Path(__file__).resolve(strict=True)
except (NameError, TypeError, OSError) as exc:
    raise SystemExit("Cannot locate the legacy entrypoint; run its actual file.\n" + GUIDANCE) from exc
project = script_file.parent.parent
validator = project / "tools" / "assets.cjs"
if script_file.parent.name != "tools" or not (project / "LH.laya").is_file() or not validator.is_file():
    raise SystemExit("Stable asset validator is missing from this checkout.\n" + GUIDANCE)
node = shutil.which("node")
if node is None:
    raise SystemExit("Node.js is required for the read-only asset check.\n" + GUIDANCE)
print(GUIDANCE, flush=True)
result = subprocess.run([node, str(validator), "sync", "--asset", "player"], cwd=project, check=False)
raise SystemExit(result.returncode)
