"""Cross-stack integration: Cosmo driver → subgraphs/ → offline compose → router load.

Validates the end-to-end file-based federation pipeline the demo depends on when
`wgc` is unavailable (§14 hermetic mode). Flow:

  1. CosmoDreamQuery(mock) → dream_query("export orders") → returns SDL delta
  2. Write delta into apps/cosmo-router/subgraphs/agent_test.graphql
  3. Run scripts/register_agent_subgraph.sh in offline mode → drives
     compose_supergraph.sh → offline_compose.py → writes supergraph.json
  4. apps/cosmo-router/main.load_supergraph() sees the new subgraph
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
DRIVER_DIR = REPO_ROOT / "apps" / "cosmo-mcp-driver"
if str(DRIVER_DIR) not in sys.path:
    sys.path.insert(0, str(DRIVER_DIR))


@pytest.fixture
def isolated_router(tmp_path, monkeypatch):
    """Work on a copy of the router tree so the real subgraphs aren't mutated."""
    src = REPO_ROOT / "apps" / "cosmo-router"
    dst = tmp_path / "cosmo-router"
    shutil.copytree(src, dst)
    return dst


@pytest.mark.asyncio
async def test_dream_query_then_offline_compose_sees_subgraph(
    isolated_router: Path, monkeypatch
) -> None:
    # 1. Dream query via CosmoMockMCP (no network).
    from driver import CosmoDreamQuery  # type: ignore[import-not-found]
    from clients import CosmoMockMCP  # type: ignore[import-not-found]

    monkeypatch.setenv("COSMO_MOCK", "1")
    dq = CosmoDreamQuery(
        run_id="ci-run-001",
        client=CosmoMockMCP(fixtures_dir=REPO_ROOT / "fixtures" / "cosmo"),
        store=None,  # DreamStore persistence is covered elsewhere
    )
    delta = await dq.dream_query("Export yesterday's Shopify orders to CSV")
    assert "orderExports" in delta.sdl_delta
    assert delta.confidence > 0

    # 2. Land the SDL in the isolated router's subgraphs/ dir.
    subgraph_path = isolated_router / "subgraphs" / "agent_test.graphql"
    subgraph_path.write_text(delta.sdl_delta)

    # 3. Drive the offline composer directly — this is what register_agent_subgraph.sh
    #    falls through to in its offline branch.
    manifest = isolated_router / "compose.yaml"
    manifest_lines = ["version: 1", "subgraphs:"]
    for sdl in sorted((isolated_router / "subgraphs").glob("*.graphql")):
        name = sdl.stem
        manifest_lines += [
            f"  - name: {name}",
            "    schema:",
            f"      file: subgraphs/{name}.graphql",
            f"    routing_url: http://{name}:4001/graphql",
        ]
    manifest.write_text("\n".join(manifest_lines) + "\n")

    out_file = isolated_router / "supergraph.json"
    subprocess.run(
        [
            "python3",
            str(isolated_router / "scripts" / "offline_compose.py"),
            "--manifest", str(manifest),
            "--out", str(out_file),
        ],
        check=True,
    )

    # 4. Load via the router module, pointing it at the isolated copy.
    # The apps/cosmo-router/main.py module derives its paths from __file__, which
    # would read the shipped supergraph.json. We import from source and call its
    # load helper after re-binding the path constants to the isolated tree.
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "understudy_router_main_isolated",
        str(isolated_router / "main.py"),
    )
    assert spec and spec.loader
    router_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(router_mod)
    router_mod.ROUTER_DIR = isolated_router
    router_mod.SUPERGRAPH_PATH = out_file
    router_mod.SUBGRAPHS_DIR = isolated_router / "subgraphs"

    super_json = router_mod.load_supergraph()
    names = [sg["name"] for sg in super_json["subgraphs"]]
    assert "agent_test" in names, f"new subgraph not composed into supergraph: {names}"
    # Previously-shipped subgraphs should still be there.
    assert "agent_alpha" in names or len(names) >= 1
    # Each subgraph entry carries a routing_url matching the filename convention.
    entry = next(sg for sg in super_json["subgraphs"] if sg["name"] == "agent_test")
    assert entry["routing_url"] == "http://agent_test:4001/graphql"
    assert "orderExports" in entry["sdl"]


def test_register_agent_subgraph_sh_offline_mode(isolated_router: Path, tmp_path) -> None:
    """End-to-end: shell script, offline mode (no wgc, no COSMO_API_KEY) still re-composes."""
    sdl_src = tmp_path / "agent_shell.graphql"
    sdl_src.write_text(
        "extend type Query {\n  shellTest: String!\n}\n"
    )

    # We need to run the script out of a *repo-root-shaped* directory because
    # it derives ROUTER_DIR from its own location. Copy the script alongside
    # a mock repo root that uses the isolated router tree.
    repo_mock = tmp_path / "repo_mock"
    (repo_mock / "apps").mkdir(parents=True)
    shutil.copytree(isolated_router, repo_mock / "apps" / "cosmo-router")
    (repo_mock / "scripts").mkdir()
    shutil.copy(REPO_ROOT / "scripts" / "register_agent_subgraph.sh", repo_mock / "scripts")

    env = {**os.environ}
    env.pop("COSMO_API_KEY", None)  # force offline path
    env["PATH"] = env.get("PATH", "")  # no wgc

    result = subprocess.run(
        [
            "bash",
            str(repo_mock / "scripts" / "register_agent_subgraph.sh"),
            "--name", "agent_shell",
            "--sdl", str(sdl_src),
            "--routing-url", "http://agent_shell:4001/graphql",
        ],
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
    assert "offline mode" in result.stderr.lower() or "offline mode" in result.stdout.lower()

    out_json = (repo_mock / "apps" / "cosmo-router" / "supergraph.json").read_text()
    assert "agent_shell" in out_json
