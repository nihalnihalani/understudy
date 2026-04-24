-- Understudy InsForge 2.0 schema (architecture.md §8 ER diagram).
--
-- This migration is the InsForge-managed equivalent of
-- `infra/insforge-pool/schema.sql`. The bespoke provision.sh path applies
-- the latter to each warm-pool tenant; for the linked `understudy` project
-- the canonical path is this migration file.
--
-- Keep column types + FK directions in lock-step with `apps/api/schemas.py`
-- — the pydantic models are the wire contract that the API returns.
--
-- NOTE: no BEGIN/COMMIT wrapper — InsForge runs migrations inside a
-- backend-managed transaction.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "vector";     -- pgvector (architecture.md §8 AGENT_MEMORIES.embedding)

-- RECORDING — raw 60s mp4 uploads (§8).
CREATE TABLE IF NOT EXISTS recording (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    s3_uri      text        NOT NULL,
    duration_s  integer     NOT NULL CHECK (duration_s > 0),
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- SYNTHESIS_RUN — the three Gemini traces + intent abstraction.
CREATE TABLE IF NOT EXISTS synthesis_run (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_id        uuid NOT NULL REFERENCES recording(id) ON DELETE CASCADE,
    status              text NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    gemini_lite_trace   text,
    gemini_pro_trace    text,
    gemini_flash_trace  text,
    intent_abstraction  jsonb,
    completed_at        timestamptz
);
CREATE INDEX IF NOT EXISTS synthesis_run_recording_idx ON synthesis_run(recording_id);
CREATE INDEX IF NOT EXISTS synthesis_run_status_idx    ON synthesis_run(status);

-- DREAM_QUERIES — one row per Cosmo Dream Query call (§4, §8).
CREATE TABLE IF NOT EXISTS dream_queries (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    synthesis_run_id   uuid NOT NULL REFERENCES synthesis_run(id) ON DELETE CASCADE,
    desired_operation  text NOT NULL,
    sdl_delta          text NOT NULL,
    validation_report  text NOT NULL,
    subgraph_id        text NOT NULL
);
CREATE INDEX IF NOT EXISTS dream_queries_run_idx ON dream_queries(synthesis_run_id);

-- IMAGE — keyed by OCI digest (§8).
CREATE TABLE IF NOT EXISTS image (
    digest      text PRIMARY KEY,
    registry    text NOT NULL,
    built_at    timestamptz NOT NULL DEFAULT now()
);

-- SLSA_ATTESTATION — one row per signed image (§6, §8).
CREATE TABLE IF NOT EXISTS slsa_attestation (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    image_digest    text NOT NULL REFERENCES image(digest) ON DELETE CASCADE,
    predicate_type  text NOT NULL,
    builder_id      text NOT NULL,
    materials       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS slsa_attestation_image_idx ON slsa_attestation(image_digest);

-- SBOM — build-time component list (§8).
CREATE TABLE IF NOT EXISTS sbom (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    image_digest     text NOT NULL REFERENCES image(digest) ON DELETE CASCADE,
    format           text NOT NULL,
    generation_time  timestamptz NOT NULL DEFAULT now(),
    components       jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS sbom_image_idx ON sbom(image_digest);

-- AGENT — the emitted, signed, deployed agent (§8).
CREATE TABLE IF NOT EXISTS agent (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    image_digest      text NOT NULL REFERENCES image(digest) ON DELETE RESTRICT,
    cosign_sig        text NOT NULL,
    graphql_endpoint  text NOT NULL,
    ams_namespace     text NOT NULL UNIQUE,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_image_idx ON agent(image_digest);

-- AGENT_MEMORIES — Redis-backed memory surfaced to Postgres for queryability (§8, §9).
CREATE TABLE IF NOT EXISTS agent_memories (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id     uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    ams_key      text NOT NULL,
    memory_type  text NOT NULL,
    topics       jsonb NOT NULL DEFAULT '[]'::jsonb,
    entities     jsonb NOT NULL DEFAULT '{}'::jsonb,
    embedding    vector(1536)
);
CREATE INDEX IF NOT EXISTS agent_memories_agent_idx ON agent_memories(agent_id);
CREATE INDEX IF NOT EXISTS agent_memories_type_idx  ON agent_memories(memory_type);

-- TINYFISH_SKILLS_USED — pinned skill versions per agent (§5, §8).
CREATE TABLE IF NOT EXISTS tinyfish_skills_used (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    skill_name        text NOT NULL,
    skill_version     text NOT NULL,
    invocation_count  integer NOT NULL DEFAULT 0 CHECK (invocation_count >= 0),
    UNIQUE (agent_id, skill_name, skill_version)
);
CREATE INDEX IF NOT EXISTS tinyfish_skills_used_agent_idx ON tinyfish_skills_used(agent_id);

-- AGENT_RUNS — one row per agent invocation (§8).
CREATE TABLE IF NOT EXISTS agent_runs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    started_at  timestamptz NOT NULL DEFAULT now(),
    ended_at    timestamptz,
    status      text NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
    result      jsonb
);
CREATE INDEX IF NOT EXISTS agent_runs_agent_idx  ON agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON agent_runs(status);
