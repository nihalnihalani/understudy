"""Pre-warm the demo the night before — seeds LangCache, AMS, Vector Sets, Dream Query cache.

Run against the production Redis so stage latency is entirely cache-hit. See architecture.md
§14 (Hermetic Demo Mode) — this script produces the `us:replay:{synth_id}` payloads consumed
by `DEMO_MODE=replay`.
"""


def main() -> None:
    # TODO(task #7/#11): seed Redis keys per architecture.md §9 table:
    #   - us:replay:{synth_id}  (pre-recorded full pipeline trace)
    #   - langcache:gemini:{hash}  (repeated-query hits < 50ms)
    #   - vset:agent:{id}:memory   (related-query recall demo)
    #   - dream:{run_id}           (Cosmo Dream Query cached result)
    raise NotImplementedError("see task #7 / task #11")


if __name__ == "__main__":
    main()
