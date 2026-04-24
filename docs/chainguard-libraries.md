# Chainguard Libraries — Python + JavaScript setup

> **One-shot bootstrap:** `scripts/chainguard_init.sh` does everything below
> (both ecosystems) after you've created a Chainguard account + org in the
> browser. Run that if you want the 30-second path. The sections below are
> reference for what it does + how to do it manually.

## Python setup

Understudy already uses **Chainguard Containers** (`cgr.dev/chainguard/wolfi-base` in [`infra/chainguard/Dockerfile.wolfi`](../infra/chainguard/Dockerfile.wolfi)). This document covers adding **Chainguard Libraries** — malware-resistant, rebuilt-from-source Python packages served from `libraries.cgr.dev/python/simple`.

Containers are zero-auth; Libraries require a 30-day pull token tied to your Chainguard org. This is a one-time ~3-minute setup, then the token is piped into Docker builds (local + CI) and optional local dev via `pip.conf`.

Chainguard $1,000 bounty alignment — every Python dependency in Understudy's agent base image ends up coming from a rebuilt-from-source, malware-resistant mirror. Same ecosystem as our SLSA L2 + cosign keyless story.

---

## One-time account setup (~3 min)

Do these once per Chainguard org. If you already have an org + `chainctl` on your `$PATH`, skip to "Generate pull token".

### 1. Create the account + org

Open:
- Sign in: https://console.chainguard.dev/auth/login (Google or GitHub, 30 seconds)
- Create org: https://console.chainguard.dev/org/welcome/settings/organization/join → "Don't have an org to join? Create one"

Use a domain-ish name for the org (doesn't need to resolve). e.g. `understudy-hack.dev`.

### 2. Install `chainctl`

```bash
# macOS
brew tap chainguard-dev/tap && brew install chainctl

# or: curl
curl -o chainctl "https://dl.enforce.dev/chainctl/latest/chainctl_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/aarch64/arm64/')"
sudo install -m 0755 chainctl /usr/local/bin/chainctl

# verify
chainctl version
chainctl auth login   # opens a browser
```

### 3. Enable the Python ecosystem entitlement

```bash
chainctl libraries entitlements create --ecosystems=PYTHON
# If it says "already exists" — that's fine, move on.
```

### 4. Generate pull token (30-day TTL)

```bash
chainctl auth pull-token --repository=python --ttl=720h
```

This prints a **Username** (contains a `/`) and a **Password**. **Save them — they're shown once.**

---

## Wire the token into Understudy

The project is already set up to accept Chainguard's PyPI mirror via a build arg. You just need to fill in credentials.

### Local dev — `pip.conf` (optional)

```bash
cp pip.conf.example pip.conf
# Edit pip.conf. In the index-url, replace the '/' in USERNAME with '_'.
# pip.conf is .gitignored — never commit the real file.

# Use it:
export PIP_CONFIG_FILE="$(pwd)/pip.conf"
pip install -e '.[dev]'
```

### Docker builds — `--build-arg`

The Dockerfile ([`infra/chainguard/Dockerfile.wolfi`](../infra/chainguard/Dockerfile.wolfi)) accepts a `PIP_INDEX_URL` arg with the public PyPI as the default, so unauthenticated local builds still work.

Use Chainguard Libraries in a build:

```bash
# USERNAME_URLSAFE is your chainctl username with '/' replaced by '_'
URL="https://${USERNAME_URLSAFE}:${PASSWORD}@libraries.cgr.dev/python/simple"

docker build \
  --build-arg PIP_INDEX_URL="${URL}" \
  --build-arg PIP_EXTRA_INDEX_URL="https://pypi.org/simple" \
  -f infra/chainguard/Dockerfile.wolfi \
  -t understudy-agent-base:cg-libs .
```

The `PIP_EXTRA_INDEX_URL` keeps public PyPI as a fallback for packages Chainguard doesn't mirror yet.

### CI — GitHub Actions

Add the credentials as two repo secrets:
- `CHAINGUARD_PYTHON_USERNAME` — the chainctl username with `/` → `_`
- `CHAINGUARD_PYTHON_PASSWORD` — the chainctl password

Then patch the `build-sign-push` job in `infra/github-actions/release.yml`:

```yaml
      - id: build
        name: Build image (Chainguard wolfi-base + Chainguard Libraries)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: infra/chainguard/Dockerfile.wolfi
          push: false
          load: true
          sbom: true
          provenance: mode=max
          build-args: |
            PIP_INDEX_URL=https://${{ secrets.CHAINGUARD_PYTHON_USERNAME }}:${{ secrets.CHAINGUARD_PYTHON_PASSWORD }}@libraries.cgr.dev/python/simple
            PIP_EXTRA_INDEX_URL=https://pypi.org/simple
          tags: |
            ${{ steps.meta.outputs.tag_sha }}
            ${{ steps.meta.outputs.tag_latest }}
```

The secrets never appear in build logs — `docker/build-push-action@v6` redacts `build-args` values that match a masked secret. The rebuilt image is byte-identical to a public-PyPI build except every installed wheel comes from Chainguard's reproducible rebuild.

### Token rotation

Tokens TTL at 30 days. Re-run `chainctl auth pull-token --repository=python --ttl=720h` before expiry and update:
- local `pip.conf`
- GitHub Actions secrets (`CHAINGUARD_PYTHON_USERNAME`, `CHAINGUARD_PYTHON_PASSWORD`)

---

## Verify the setup

After building with the Chainguard index URL:

```bash
# Confirm the built image resolved packages from Chainguard
docker run --rm understudy-agent-base:cg-libs pip config list
# → should show index-url = https://libraries.cgr.dev/python/simple

# Spot-check a dependency provenance
docker run --rm understudy-agent-base:cg-libs pip show fastapi | head -5
```

---

## JavaScript setup

Covers `apps/web/` (Vite dev build) and `apps/agent-template/` (generated agent
runtime). Both have committed `.npmrc.example` templates; the real `.npmrc`
files are `.gitignored`.

### Enable the ecosystem + mint the token

```bash
chainctl libraries entitlements create --ecosystems=JAVASCRIPT   # idempotent
chainctl auth pull-token --repository=javascript --ttl=720h
```

Save the Username + Password. Compute the `_auth` value:

```bash
echo -n 'USERNAME:PASSWORD' | base64
```

### Local dev — `.npmrc`

```bash
cp .npmrc.example .npmrc
# Edit: replace {BASE64_OF_USERNAME_PASSWORD} with the base64 value above.
# NOTE: understudy/ is an npm-workspaces monorepo — the .npmrc MUST live at
# repo root. Per-workspace .npmrc files are silently ignored by npm.
```

Then `npm install` in either directory pulls from Chainguard's mirror.

Quick check:

```bash
npm view react dist.tarball
# → https://libraries.cgr.dev/javascript/react/-/react-18.x.x.tgz
```

### Generated agents — `--build-arg`

[`infra/chainguard/Dockerfile.agent.tmpl`](../infra/chainguard/Dockerfile.agent.tmpl)
accepts an `NPM_CHAINGUARD_AUTH` build arg. When set, both the `@tinyfish/cli`
global install and pinned-skill installs pull from `libraries.cgr.dev/javascript/`.
When unset, generated agents fall back to the public npm registry (so local
development without a Chainguard account still works).

```bash
AUTH=$(echo -n "${JS_USERNAME}:${JS_PASSWORD}" | base64)
docker build \
  --build-arg BASE_DIGEST="${BASE_DIGEST}" \
  --build-arg NPM_CHAINGUARD_AUTH="${AUTH}" \
  -f infra/chainguard/Dockerfile.agent.tmpl \
  -t understudy-agent:cg-libs apps/agent-template/
```

### CI — GitHub Actions

Add two more secrets and feed the base64 auth into the build:

- `CHAINGUARD_JAVASCRIPT_USERNAME`
- `CHAINGUARD_JAVASCRIPT_PASSWORD`

```yaml
      - name: Build agent image (Chainguard npm mirror)
        env:
          JS_USER: ${{ secrets.CHAINGUARD_JAVASCRIPT_USERNAME }}
          JS_PASS: ${{ secrets.CHAINGUARD_JAVASCRIPT_PASSWORD }}
        run: |
          AUTH=$(printf '%s:%s' "$JS_USER" "$JS_PASS" | base64 | tr -d '\n')
          docker build \
            --build-arg NPM_CHAINGUARD_AUTH="$AUTH" \
            -f infra/chainguard/Dockerfile.agent.tmpl \
            apps/agent-template/
```

### Token rotation (JS)

Same 30-day TTL. Re-run `chainctl auth pull-token --repository=javascript` and
update:
- local `apps/*/.npmrc` files
- `CHAINGUARD_JAVASCRIPT_*` GitHub Actions secrets

Or just run `scripts/chainguard_init.sh` again — it rotates both ecosystems
atomically.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `403 Forbidden` from `libraries.cgr.dev` | Username contains a `/` — must be URL-encoded to `_` in the URL. |
| `401 Unauthorized` | Token expired (30-day TTL) or the username/password pair is stale. Re-run `chainctl auth pull-token --repository=python --ttl=720h`. |
| `Package not found` for a niche dep | Chainguard's mirror is not 100% of PyPI. Keep `PIP_EXTRA_INDEX_URL=https://pypi.org/simple` as a fallback. |
| `chainctl: command not found` after Homebrew install | `echo $PATH` — ensure `/opt/homebrew/bin` (Apple Silicon) or `/usr/local/bin` is on it. |

---

## References

- chainctl reference — https://edu.chainguard.dev/chainguard/chainctl/
- Chainguard Libraries (Python) — https://edu.chainguard.dev/chainguard/libraries/python/
- Containers catalog — https://images.chainguard.dev
- Libraries FAQ — https://edu.chainguard.dev/chainguard/libraries/faq/
