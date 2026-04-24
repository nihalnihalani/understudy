# infra/chainguard — Supply chain (SLSA L2, cosign, Fulcio, Rekor)

Every Understudy image is built on Chainguard `wolfi-base`, carries an **SLSA Build Level 2** provenance predicate, a **build-time SBOM** (emitted in-process by BuildKit/Syft, not a post-build scan), and a **keyless cosign signature** anchored in the Rekor transparency log (architecture.md §6, §12).

## Files

| File | Purpose |
|---|---|
| `Dockerfile.wolfi` | Base image for the synthesis API and the agent template. |
| `Dockerfile.agent.tmpl` | Jinja2-rendered per-agent Dockerfile with `{{AGENT_ID}}`, `{{RUNTIME_MANIFEST_JSON}}`, `{{TINYFISH_SKILLS_PINNED}}`, `{{SIGNED_SDL_HASH}}` placeholders. |
| `agent/verify-self.sh` | ENTRYPOINT verifier — `cosign verify` + `cosign verify-attestation` on the agent's own image digest before the core loop starts. Refuses to start on mismatch (§13 "cosign verify fails"). |
| `slsa-config.yaml` | Builder identity + OIDC issuer + Fulcio/Rekor endpoint pinning. |

## What SLSA L2 buys us

SLSA Build Level 2 requires four things, all of which the `release.yml` pipeline produces:

1. **Scripted build** — GitHub Actions runs `docker build` from a versioned Dockerfile, no local workstation pushes.
2. **Build service** — a hosted builder with an authenticated identity (the Fulcio certificate ties the signature to `https://github.com/nihalnihalani/understudy/.github/workflows/release.yml@refs/heads/main`).
3. **Provenance — authenticated** — the in-toto `slsaprovenance` predicate lists the builder, the source commit, and the materials (base image digest, SBOM digest). Signed by the same Fulcio-issued cert.
4. **Provenance — service-generated** — emitted by `slsa-framework/slsa-github-generator` running inside the same build job, not by a developer's laptop.

We deliberately stop at L2, not L3 — L3 requires a hermetic, isolated builder, which is a week of work (architecture.md §18 risk #5). L2 is demonstrable, legitimate, and ships the provenance claims judges can verify on stage.

## Why `wolfi-base` and not pure distroless

TinyFish drives a real headful Chromium. Pure distroless has no `apk`, no shared libs, and Chromium silently fails at launch (architecture.md §13 "Chromium deps on distroless"). `wolfi-base` keeps Chainguard's zero-CVE posture and gives us `apk add` for the Chromium shared-lib set:

- `nss`, `atk`, `libxkbcommon`, `libdrm`, `mesa-dri-drivers` — the hard-required floor.
- `glib`, `dbus-libs`, `cups-libs`, `alsa-lib`, `libxcomposite`, `libxrandr`, `libxdamage`, `libxfixes`, `pango`, `cairo`, `fontconfig`, `freetype`, `expat` — the "Chromium will actually render pages" floor.

See `Dockerfile.wolfi` for the full apk list.

## Verification on boot (non-negotiable)

Both runtime surfaces verify before launch:
- **Fly Machines** — `[processes]` init script runs `cosign verify`; non-zero exit marks the deploy unhealthy (infra/fly/fly.toml).
- **Mac Mini / launchd** — `macmini-start.sh` runs the same verify before launching TinyFish (infra/fly/macmini-start.sh).

The agent image's own ENTRYPOINT (`agent/verify-self.sh`) re-runs the verify against its own digest as belt-and-braces.

## Local dev vs prod signing

| Environment | Signing | Verifier command |
|---|---|---|
| **CI (GitHub Actions)** | Keyless Fulcio via OIDC — no key material anywhere on disk. | `cosign verify --certificate-identity ... --certificate-oidc-issuer ...` |
| **Local dev** | Key-based: `cosign generate-key-pair` then `cosign sign --key cosign.key $IMAGE`. | `cosign verify --key cosign.pub $IMAGE`. |

**Do not commit `cosign.key` or `cosign.pub` to git.** Add them to your local `.gitignore` if you generate them. Prod never uses local keys — everything flows through Fulcio + Rekor.

### Local rebuild + re-sign

```bash
# Build locally
docker build -f infra/chainguard/Dockerfile.wolfi \
  -t ghcr.io/nihalnihalani/understudy-agent-base:dev .

# Generate a dev-only keypair (one-time, never committed)
cosign generate-key-pair
echo cosign.key >>.gitignore
echo cosign.pub >>.gitignore

# Push + sign
docker push ghcr.io/nihalnihalani/understudy-agent-base:dev
cosign sign --key cosign.key ghcr.io/nihalnihalani/understudy-agent-base:dev
```

For production, **merge to `main`** — the `release.yml` workflow does the keyless path end-to-end.

## Stage demo (1:40-2:00)

`scripts/verify_release.sh` is the exact command the presenter types. It runs the two `cosign` commands from README Quickstart step 5 with colored output, and exits non-zero on verify fail. No live CI build during the pitch — we verify a pre-signed image against the public Rekor log.

Owner task: **#8 — Build Chainguard supply-chain CI**.
