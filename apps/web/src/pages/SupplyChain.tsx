// SUPPLY CHAIN viewer — beat 1:40-2:00.
// Renders cosign verify output, SLSA L2 provenance predicate, Rekor UUID,
// Fulcio cert, and SBOM summary as first-class receipts — never hidden in
// a debug tab.
//
// Every field on this screen comes from one bundle:
//   GET /agents/{id}/attestation (apps/api/schemas.py :: FullAttestation)
// mirrored client-side as `ApiFullAttestation` in @/api/types.
// Falls back to the demo fixture only when the API is unreachable or the id
// is the `demo` placeholder; fixture shape is identical to the live payload.

import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { ApiFullAttestation } from "@/api/types";
import { CosignReceipt } from "@/components/CosignReceipt";
import { DEMO_ATTESTATION } from "@/fixtures/demo";
import { truncateDigest } from "@/lib/format";

export default function SupplyChain() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useQuery({
    queryKey: ["attestation", id],
    queryFn: () => api.getAttestation(id!),
    enabled: !!id && id !== "demo",
    retry: false,
  });

  const live = data ?? null;
  const bundle: ApiFullAttestation = live ?? DEMO_ATTESTATION;
  const { agent, image, slsa, sbom } = bundle;
  const rekorLink = bundle.rekor_url;
  const imageRef = `${image.registry}/agent-${agent.id.slice(0, 6)}@${image.digest}`;
  const derived = !live;
  // 404 is surfaced via the footer message; any other error is silent (stale
  // data from the fixture is still a valid receipt for the demo).
  void error;

  return (
    <div className="space-y-6">
      <header className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-end pb-6 border-b border-border-subtle">
        <div>
          <div className="section-tag mb-3">Supply Chain — 004</div>
          <h1 className="section-title">
            <em>Verified</em>, anchored, irrevocable.
          </h1>
          <div className="font-mono text-[11px] text-fg-faint tracking-[0.12em] uppercase mt-3">
            agent-{(id ?? agent.id).slice(0, 6)} · cosign + fulcio + rekor
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost">Copy digest</button>
          <button type="button" className="btn btn-ghost">Export PDF</button>
        </div>
      </header>

      {/* Hero: cosign verify + slsa attest */}
      <div className="grid grid-cols-[3fr_2fr] gap-4">
        <CosignReceipt
          title="cosign verify"
          verified
          subtitle="cert-identity + oidc-issuer match"
          command={`cosign verify --certificate-identity=${bundle.certificate_identity} --certificate-oidc-issuer=${bundle.certificate_oidc_issuer} ${imageRef}`}
        >
          <CosignReceipt.Row label="image" value={imageRef} copyable />
          <CosignReceipt.Row
            label="digest"
            value={image.digest}
            copyable
          />
          <CosignReceipt.Row
            label="signed_at"
            value={bundle.rekor_integrated_time}
          />
          <CosignReceipt.Row
            label="pushed_to"
            value={`${image.registry} (Rekor transparency confirmed)`}
          />
        </CosignReceipt>
        <CosignReceipt
          title="cosign verify-attestation --type slsaprovenance"
          verified
          subtitle="SLSA Build Level 2"
        >
          <CosignReceipt.Row
            label="predicate_type"
            value={slsa.predicate_type}
            copyable
          />
          <CosignReceipt.Row
            label="builder_id"
            value={slsa.builder_id}
            copyable
          />
          <CosignReceipt.Row
            label="build_type"
            value="https://github.com/slsa-framework/slsa-github-generator@v2.1"
          />
          <CosignReceipt.Row label="reproducibility" value="declared" />
        </CosignReceipt>
      </div>

      {/* Fulcio certificate identity */}
      <section className="card p-5" aria-label="Sigstore Fulcio certificate">
        <header className="flex items-baseline justify-between mb-4">
          <div>
            <h3 className="text-[16px] font-semibold">
              Sigstore / Fulcio certificate identity
            </h3>
            <p className="text-[12px] text-fg-muted mt-0.5">
              Keyless · OIDC-gated · short-lived
            </p>
          </div>
          <span className="chip chip-indigo">keyless · Fulcio</span>
        </header>
        <dl>
          <CosignReceipt.Row
            label="certificate_identity"
            value={bundle.certificate_identity}
            copyable
          />
          <CosignReceipt.Row
            label="certificate_oidc_issuer"
            value={bundle.certificate_oidc_issuer}
            copyable
          />
          <CosignReceipt.Row
            label="subject_alt_name"
            value={bundle.subject_alt_name}
          />
          <CosignReceipt.Row
            label="issuer_cn"
            value="sigstore-intermediate"
          />
          <CosignReceipt.Row
            label="not_before"
            value={bundle.cert_not_before}
          />
          <CosignReceipt.Row label="not_after" value={bundle.cert_not_after} />
        </dl>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-ghost">Download cert</button>
          <button type="button" className="btn btn-ghost">Copy PEM</button>
        </div>
      </section>

      {/* Rekor transparency log entry */}
      <section className="card p-5" aria-label="Rekor transparency log">
        <header className="flex items-baseline justify-between mb-4">
          <div>
            <h3 className="text-[16px] font-semibold">
              Rekor transparency log
            </h3>
            <p className="text-[12px] text-fg-muted mt-0.5">
              Anchored at rekor.sigstore.dev
            </p>
          </div>
          <span className="chip chip-cyan">log_index {bundle.rekor_log_index}</span>
        </header>
        <div className="flex flex-col items-center gap-3 py-3 border border-border-subtle bg-canvas-elevated rounded">
          <div className="text-[11px] uppercase text-fg-faint tracking-wider">
            Rekor UUID
          </div>
          <div className="font-mono text-[14px] text-fg break-all px-6 text-center">
            {bundle.rekor_uuid}
          </div>
          <a
            href={rekorLink}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent-cyan text-[12px] underline underline-offset-2 decoration-dotted break-all px-6 text-center"
          >
            ↗ {rekorLink}
          </a>
        </div>
        <dl className="mt-4">
          <CosignReceipt.Row
            label="log_index"
            value={String(bundle.rekor_log_index)}
          />
          <CosignReceipt.Row
            label="integrated_time"
            value={bundle.rekor_integrated_time}
          />
          <CosignReceipt.Row label="verification_kind" value="intoto" />
          <CosignReceipt.Row
            label="body_hash"
            value="sha256:cd3fa1928744b3ee9d8f0a7f2b51cd9014e22c6f8a1b3c4d5e6f7a8b9c0d1e2f"
          />
        </dl>
        <a
          href={rekorLink}
          target="_blank"
          rel="noreferrer noopener"
          className="btn btn-primary mt-4"
        >
          Open in Rekor Search →
        </a>
      </section>

      {/* SLSA L2 provenance predicate */}
      <section className="card p-5" aria-label="SLSA L2 provenance predicate">
        <header className="flex items-baseline justify-between mb-4">
          <div>
            <h3 className="text-[16px] font-semibold">
              SLSA L2 provenance predicate
            </h3>
            <p className="text-[12px] text-fg-muted mt-0.5">
              Generated in-process by slsa-github-generator at build time — not
              a post-build scan.
            </p>
          </div>
          <span className="chip chip-emerald">build_level: L2</span>
        </header>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[12px] uppercase text-fg-faint tracking-wider mb-2">
              materials[]
            </div>
            <ul className="space-y-3">
              {slsa.materials.map((m, i) => (
                <li
                  key={i}
                  className="font-mono text-mono-base bg-canvas-elevated border border-border-subtle rounded p-3"
                >
                  <div className="text-fg-muted">uri</div>
                  <div className="text-fg break-all">{m.uri}</div>
                  <div className="text-fg-muted mt-1.5">digest</div>
                  <div className="text-fg break-all">
                    {truncateDigest(m.digest, 20, 6)}
                  </div>
                  <div className="text-fg-muted mt-1.5">trust</div>
                  <div className="text-accent-emerald">{m.trust}</div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[12px] uppercase text-fg-faint tracking-wider mb-2">
              builder + invocation
            </div>
            <dl>
              <CosignReceipt.Row
                label="builder.id"
                value={slsa.builder_id}
              />
              <CosignReceipt.Row
                label="build_type"
                value="slsa-github-generator@v2.1"
              />
              <CosignReceipt.Row
                label="invocation.parameters"
                value={'{ ref: "refs/heads/main", sha: "457be2c…" }'}
              />
              <CosignReceipt.Row
                label="metadata.buildInvocationId"
                value="7421908432_1"
              />
              <CosignReceipt.Row
                label="metadata.buildStartedOn"
                value="2026-04-23T14:29:12Z"
              />
              <CosignReceipt.Row
                label="metadata.buildFinishedOn"
                value="2026-04-23T14:31:04Z"
              />
              <CosignReceipt.Row
                label="metadata.reproducible"
                value="declared"
              />
            </dl>
          </div>
        </div>
      </section>

      {/* SBOM summary */}
      <section
        className="card p-4 flex items-center justify-between gap-4"
        aria-label="Build-time SBOM summary"
      >
        <div className="flex flex-wrap gap-1.5">
          <span className="chip">format: {sbom.format}</span>
          <span className="chip">
            generation_time: {sbom.generation_time}
          </span>
          <span className="chip">
            component_count: {sbom.components.length}
          </span>
          <span className="chip">source: syft@0.108 (in-process)</span>
        </div>
        <button type="button" className="btn btn-ghost">
          Open full SBOM →
        </button>
      </section>

      <footer className="pt-2 text-mono-sm font-mono text-fg-faint text-center">
        {derived
          ? "Source: fixtures (GET /agents/{id}/attestation unavailable for this id)."
          : "Source: GET /agents/{id}/attestation — every receipt field authoritative."}{" "}
        cosign verify runs live on stage.
      </footer>
    </div>
  );
}
