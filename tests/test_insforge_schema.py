"""Smoke tests for infra/insforge-pool/schema.sql.

The migration is seeded per tenant by `infra/insforge-pool/provision.sh`
(architecture.md §8). We don't spin up Postgres in CI; instead we parse the
DDL and assert the table + column set matches the §8 ER diagram as encoded
in `apps/api/schemas.py`.
"""

from __future__ import annotations

import re
from pathlib import Path

SCHEMA_SQL = Path(__file__).resolve().parents[1] / "infra" / "insforge-pool" / "schema.sql"


EXPECTED_TABLES = {
    "recording",
    "synthesis_run",
    "dream_queries",
    "image",
    "slsa_attestation",
    "sbom",
    "agent",
    "agent_memories",
    "tinyfish_skills_used",
    "agent_runs",
}

# Key columns the §8 ER diagram + apps/api/schemas.py require on each table.
EXPECTED_COLUMNS: dict[str, set[str]] = {
    "recording": {"id", "s3_uri", "duration_s", "created_at"},
    "synthesis_run": {
        "id", "recording_id", "status",
        "gemini_lite_trace", "gemini_pro_trace", "gemini_flash_trace",
        "intent_abstraction", "completed_at",
    },
    "dream_queries": {
        "id", "synthesis_run_id", "desired_operation",
        "sdl_delta", "validation_report", "subgraph_id",
    },
    "image": {"digest", "registry", "built_at"},
    "slsa_attestation": {"id", "image_digest", "predicate_type", "builder_id", "materials"},
    "sbom": {"id", "image_digest", "format", "generation_time", "components"},
    "agent": {"id", "image_digest", "cosign_sig", "graphql_endpoint", "ams_namespace"},
    "agent_memories": {
        "id", "agent_id", "ams_key", "memory_type", "topics", "entities", "embedding",
    },
    "tinyfish_skills_used": {
        "id", "agent_id", "skill_name", "skill_version", "invocation_count",
    },
    "agent_runs": {"id", "agent_id", "started_at", "ended_at", "status", "result"},
}


def _parse_tables(sql: str) -> dict[str, set[str]]:
    """Naive but sufficient parser — matches `CREATE TABLE IF NOT EXISTS <name> (...);`."""
    out: dict[str, set[str]] = {}
    for m in re.finditer(
        r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\((.*?)\)\s*;",
        sql,
        re.IGNORECASE | re.DOTALL,
    ):
        name = m.group(1).lower()
        body = m.group(2)
        cols: set[str] = set()
        for line in body.splitlines():
            line = line.strip().rstrip(",")
            if not line or line.startswith("--"):
                continue
            head = line.split(None, 1)[0].upper()
            if head in {
                "PRIMARY", "FOREIGN", "CONSTRAINT", "UNIQUE", "CHECK",
                "EXCLUDE", ")",
            }:
                continue
            ident = line.split(None, 1)[0].strip('"')
            if ident and re.match(r"^[a-z_][a-z0-9_]*$", ident):
                cols.add(ident.lower())
        out[name] = cols
    return out


def test_schema_sql_exists_and_nonempty() -> None:
    assert SCHEMA_SQL.exists(), f"missing schema file: {SCHEMA_SQL}"
    assert SCHEMA_SQL.stat().st_size > 0


def test_all_expected_tables_present() -> None:
    sql = SCHEMA_SQL.read_text()
    tables = _parse_tables(sql)
    missing = EXPECTED_TABLES - tables.keys()
    extra = tables.keys() - EXPECTED_TABLES
    assert not missing, f"schema.sql missing tables from §8 ER: {missing}"
    # Extras are OK (future evolution), just don't want typos.
    assert not extra, f"unexpected tables in schema.sql: {extra}"


def test_each_table_has_expected_columns() -> None:
    sql = SCHEMA_SQL.read_text()
    tables = _parse_tables(sql)
    for table, expected in EXPECTED_COLUMNS.items():
        got = tables.get(table, set())
        missing = expected - got
        assert not missing, f"table {table} missing columns: {missing} (got: {sorted(got)})"


def test_uuid_pks_use_gen_random_uuid() -> None:
    """Every uuid PK must have gen_random_uuid() default (pgcrypto)."""
    sql = SCHEMA_SQL.read_text()
    # Must enable pgcrypto (for gen_random_uuid()).
    assert "CREATE EXTENSION" in sql and "pgcrypto" in sql
    # Every `id  uuid PRIMARY KEY` line should come with a default.
    for m in re.finditer(r"^\s*id\s+uuid\s+PRIMARY\s+KEY([^,\n]*)", sql, re.MULTILINE | re.IGNORECASE):
        tail = m.group(1).lower()
        assert "gen_random_uuid()" in tail, f"uuid PK missing default: {m.group(0).strip()}"


def test_referential_integrity_fks_present() -> None:
    """FK relationships from the §8 ER diagram must exist."""
    sql = SCHEMA_SQL.read_text().lower()
    required_fks = [
        ("synthesis_run", "recording(id)"),
        ("dream_queries", "synthesis_run(id)"),
        ("agent", "image(digest)"),
        ("agent_memories", "agent(id)"),
        ("tinyfish_skills_used", "agent(id)"),
        ("agent_runs", "agent(id)"),
        ("slsa_attestation", "image(digest)"),
        ("sbom", "image(digest)"),
    ]
    for child, parent_ref in required_fks:
        # Look for "REFERENCES <parent_ref>" anywhere after the CREATE TABLE <child>.
        m = re.search(
            rf"create\s+table\s+if\s+not\s+exists\s+{child}\s*\((.*?)\);",
            sql,
            re.DOTALL,
        )
        assert m, f"could not find table {child}"
        body = m.group(1)
        assert f"references {parent_ref}" in body, (
            f"{child} missing FK to {parent_ref}"
        )
