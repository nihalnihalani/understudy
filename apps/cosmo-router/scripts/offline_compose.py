"""Offline supergraph composer.

Fallback used by compose_supergraph.sh when the Cosmo Cloud `wgc` binary is
unreachable. Produces a supergraph.json shape compatible with
cosmo-router's `execution_config.file`. Not a real composition — it emits
the union of the input SDLs with one subgraph entry per file, tagged with
the routing URL from the manifest. Good enough for the hackathon demo path
(architecture.md §7) where we only need to prove the router boots and
routes requests to the right agent.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


_MANIFEST_SUBGRAPH = re.compile(
    r"-\s+name:\s+(?P<name>\S+)\s+schema:\s+file:\s+(?P<file>\S+)\s+routing_url:\s+(?P<url>\S+)",
    re.DOTALL,
)


def parse_manifest(path: Path) -> list[dict[str, str]]:
    text = path.read_text()
    out: list[dict[str, str]] = []
    # Naive YAML parse — the generator in compose_supergraph.sh emits a
    # fixed three-line-per-entry shape, so a regex is fine and avoids a
    # PyYAML dependency in the offline path.
    for match in _MANIFEST_SUBGRAPH.finditer(text):
        out.append({
            "name": match.group("name"),
            "file": match.group("file"),
            "routing_url": match.group("url"),
        })
    if not out:
        raise SystemExit(f"no subgraphs found in {path}")
    return out


def build_supergraph(manifest_path: Path, out_path: Path) -> None:
    root = manifest_path.parent
    subgraphs = parse_manifest(manifest_path)
    payload = {
        "version": "offline-1",
        "engineConfig": {
            "defaultFlushInterval": 500,
            "datasourceConfigurations": [],
            "fieldConfigurations": [],
            "graphqlSchema": "",
        },
        "subgraphs": [],
    }
    combined_sdl: list[str] = []
    for sg in subgraphs:
        sdl_path = (root / sg["file"]).resolve()
        sdl = sdl_path.read_text()
        combined_sdl.append(f"# --- subgraph: {sg['name']} ---\n{sdl}")
        payload["subgraphs"].append({
            "id": hashlib.sha256(f"{sg['name']}:{sg['routing_url']}".encode()).hexdigest()[:16],
            "name": sg["name"],
            "routing_url": sg["routing_url"],
            "sdl": sdl,
        })
    payload["engineConfig"]["graphqlSchema"] = "\n\n".join(combined_sdl)
    out_path.write_text(json.dumps(payload, indent=2) + "\n")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--manifest", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args()
    build_supergraph(args.manifest, args.out)


if __name__ == "__main__":
    main()
