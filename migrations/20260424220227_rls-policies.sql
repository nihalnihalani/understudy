-- RLS policies for the Understudy InsForge 2.0 schema.
--
-- Threat model (see CLAUDE.md + README):
--   * `anon` — the JWT the frontend uses. Must read only tables that render
--     in the public UI (AgentWall, SynthesisHUD, SupplyChain, DreamQuery).
--   * Admin (server-side) uses `INSFORGE_API_KEY`; that path bypasses RLS.
--
-- Rules encoded below:
--   1. RLS is ENABLED on every table in the §8 ER diagram.
--   2. `anon` gets SELECT only — never INSERT/UPDATE/DELETE.
--   3. `anon` can read: agent, slsa_attestation, sbom, image,
--      tinyfish_skills_used, agent_runs, synthesis_run, recording,
--      dream_queries. These back the public governance/supply-chain and
--      synthesis HUD surfaces.
--   4. `anon` CANNOT read `agent_memories` — per-agent private state
--      (Redis-mirrored memory + 1536-dim embeddings). Admin only.
--
-- NOTE: no BEGIN/COMMIT wrapper — InsForge runs migrations inside a
-- backend-managed transaction.

-- 1. Enable RLS on every table -------------------------------------------
ALTER TABLE recording             ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthesis_run         ENABLE ROW LEVEL SECURITY;
ALTER TABLE dream_queries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE image                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE slsa_attestation      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sbom                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tinyfish_skills_used  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs            ENABLE ROW LEVEL SECURITY;

-- 2. anon SELECT policies (read-only, per-table) -------------------------
-- With RLS enabled and no policy for a role, that role gets zero rows.
-- We only add SELECT policies; INSERT/UPDATE/DELETE have none → denied.

DROP POLICY IF EXISTS anon_select_recording ON recording;
CREATE POLICY anon_select_recording
    ON recording FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_select_synthesis_run ON synthesis_run;
CREATE POLICY anon_select_synthesis_run
    ON synthesis_run FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_select_dream_queries ON dream_queries;
CREATE POLICY anon_select_dream_queries
    ON dream_queries FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_select_image ON image;
CREATE POLICY anon_select_image
    ON image FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_select_slsa_attestation ON slsa_attestation;
CREATE POLICY anon_select_slsa_attestation
    ON slsa_attestation FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_select_sbom ON sbom;
CREATE POLICY anon_select_sbom
    ON sbom FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_select_agent ON agent;
CREATE POLICY anon_select_agent
    ON agent FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_select_tinyfish_skills_used ON tinyfish_skills_used;
CREATE POLICY anon_select_tinyfish_skills_used
    ON tinyfish_skills_used FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_select_agent_runs ON agent_runs;
CREATE POLICY anon_select_agent_runs
    ON agent_runs FOR SELECT TO anon USING (true);

-- 3. agent_memories — intentionally NO anon policy -----------------------
-- Per-agent private Redis-mirrored state. Admin path (INSFORGE_API_KEY)
-- bypasses RLS and remains fully functional. Leaving this table with RLS
-- enabled + zero anon policies means anon SELECT returns zero rows even
-- though the table has data.

-- 4. Explicit write denial for anon --------------------------------------
-- Belt-and-braces: with no INSERT/UPDATE/DELETE policies for `anon`, those
-- ops are already blocked by default. We REVOKE at the grant level too so
-- a future permissive policy can't accidentally open a write surface.
REVOKE INSERT, UPDATE, DELETE ON recording             FROM anon;
REVOKE INSERT, UPDATE, DELETE ON synthesis_run         FROM anon;
REVOKE INSERT, UPDATE, DELETE ON dream_queries         FROM anon;
REVOKE INSERT, UPDATE, DELETE ON image                 FROM anon;
REVOKE INSERT, UPDATE, DELETE ON slsa_attestation      FROM anon;
REVOKE INSERT, UPDATE, DELETE ON sbom                  FROM anon;
REVOKE INSERT, UPDATE, DELETE ON agent                 FROM anon;
REVOKE INSERT, UPDATE, DELETE ON agent_memories        FROM anon;
REVOKE INSERT, UPDATE, DELETE ON tinyfish_skills_used  FROM anon;
REVOKE INSERT, UPDATE, DELETE ON agent_runs            FROM anon;
REVOKE SELECT ON agent_memories FROM anon;
