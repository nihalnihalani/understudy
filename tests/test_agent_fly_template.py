"""Guards the `pre_warm` Jinja variable in `infra/fly/agent.fly.toml.tmpl`.

Devils-advocate §4 / §1 beat 2:00-2:15: per-agent Fly machines with
`min_machines_running=0` cold-start in 10-25s — too slow for the demo.
The template exposes `pre_warm` so demo agents render with
`min_machines_running=1` + `auto_stop_machines="off"`.
"""

from __future__ import annotations

from pathlib import Path

import pytest

jinja2 = pytest.importorskip("jinja2")


_TMPL_PATH = Path(__file__).resolve().parent.parent / "infra" / "fly" / "agent.fly.toml.tmpl"


def _render(**overrides: object) -> str:
    ctx = {
        "agent_id": "demo-agent",
        "image_digest": "sha256:abc",
        "graphql_port": 8080,
        "ams_namespace": "ams:agent:demo-agent",
        "insforge_slot": 0,
        "primary_region": "iad",
        "cosmo_endpoint": "http://router",
    }
    ctx.update(overrides)
    return jinja2.Template(_TMPL_PATH.read_text()).render(**ctx)


def test_default_is_cost_efficient_cold_start():
    rendered = _render()
    assert "auto_stop_machines = true" in rendered
    assert "min_machines_running = 0" in rendered


def test_pre_warm_true_keeps_one_machine_hot():
    rendered = _render(pre_warm=True)
    assert 'auto_stop_machines = "off"' in rendered
    assert "min_machines_running = 1" in rendered


def test_pre_warm_false_explicit_matches_default():
    assert _render(pre_warm=False) == _render()
