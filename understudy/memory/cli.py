"""CLI for inspecting an agent's memory.

Usage:
    python -m understudy.memory.cli dump --agent <id>
    python -m understudy.memory.cli topics --agent <id>
    python -m understudy.memory.cli wipe --agent <id>

Useful for the demo (showing judges what the agent remembers) and for the
tester-debugger teammate when memory writes go sideways.
"""

from __future__ import annotations

import argparse
import json
import sys

from understudy.memory.client import MemoryClient


def _pretty(obj: object) -> str:
    return json.dumps(obj, indent=2, default=str, sort_keys=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="understudy.memory.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_dump = sub.add_parser("dump", help="Pretty-print an agent's entire memory.")
    p_dump.add_argument("--agent", required=True)

    p_topics = sub.add_parser("topics", help="List auto-extracted topics for an agent.")
    p_topics.add_argument("--agent", required=True)

    p_ent = sub.add_parser("entities", help="List auto-extracted entities for an agent.")
    p_ent.add_argument("--agent", required=True)

    p_wipe = sub.add_parser("wipe", help="Delete all AMS keys for an agent (NOT vectors).")
    p_wipe.add_argument("--agent", required=True)
    p_wipe.add_argument("--yes", action="store_true", help="Skip confirmation prompt.")

    args = parser.parse_args(argv)
    mem = MemoryClient(agent_id=args.agent)

    if args.cmd == "dump":
        print(_pretty(mem.dump()))
        return 0
    if args.cmd == "topics":
        print(_pretty(mem.ams.get_topics().model_dump(mode="json")))
        return 0
    if args.cmd == "entities":
        print(_pretty([e.model_dump(mode="json") for e in mem.ams.list_entities()]))
        return 0
    if args.cmd == "wipe":
        if not args.yes:
            confirm = input(f"Wipe AMS keys for agent {args.agent!r}? [y/N] ").strip().lower()
            if confirm != "y":
                print("aborted")
                return 1
        mem.ams.wipe()
        print(f"wiped AMS keys for {args.agent!r}")
        return 0

    parser.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
