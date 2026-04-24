// Pre-start cosign verification gate. Architecture.md §6 + §13 "cosign verify fails" row:
// the agent MUST refuse to boot if the image signature or SLSA L2 attestation does not
// validate. This is the governance beat at demo 1:40-2:00.
//
// Two modes:
//   1. Delegate to scripts/verify_release.sh if found on disk (happy path — uses the
//      exact two commands the presenter types on stage).
//   2. Direct `cosign verify` + `cosign verify-attestation --type slsaprovenance` fallback
//      (inside the Chainguard agent image where the repo script is not bind-mounted).
//
// Callers pass `exit = true` for the production boot path; tests pass `exit = false` so
// they can assert on the return value instead of killing the worker.

import { execa } from "execa";
import { access, constants } from "node:fs/promises";

export interface VerifyOpts {
  imageRef: string;
  certIdentity?: string;
  certOidcIssuer?: string;
  scriptPath?: string;
  cosignBin?: string;
  exitOnFail?: boolean;
  onLog?: (line: string) => void;
}

export interface VerifyOutcome {
  verified: boolean;
  mode: "script" | "direct";
  failure?: { step: "signature" | "attestation" | "script"; detail: string };
}

const DEFAULT_CERT_IDENTITY =
  "https://github.com/nihalnihalani/understudy/.github/workflows/release.yml@refs/heads/main";
const DEFAULT_OIDC_ISSUER = "https://token.actions.githubusercontent.com";

export async function verifyImageOrExit(opts: VerifyOpts): Promise<VerifyOutcome> {
  const log = opts.onLog ?? ((l: string) => console.error(l));
  const certIdentity = opts.certIdentity ?? process.env.COSIGN_CERT_IDENTITY ?? DEFAULT_CERT_IDENTITY;
  const certOidcIssuer = opts.certOidcIssuer ?? process.env.COSIGN_CERT_OIDC_ISSUER ?? DEFAULT_OIDC_ISSUER;
  const cosignBin = opts.cosignBin ?? "cosign";

  let outcome: VerifyOutcome;
  if (opts.scriptPath && (await fileExists(opts.scriptPath))) {
    outcome = await runScript(opts.scriptPath, opts.imageRef, log);
  } else {
    outcome = await runDirect(cosignBin, opts.imageRef, certIdentity, certOidcIssuer, log);
  }

  if (!outcome.verified) {
    log(`[preboot] cosign verification FAILED — refusing to boot (${outcome.failure?.step}).`);
    if (opts.exitOnFail !== false) {
      process.exit(1);
    }
  } else {
    log(`[preboot] cosign verification OK (${outcome.mode}): ${opts.imageRef}`);
  }
  return outcome;
}

async function runScript(
  scriptPath: string,
  imageRef: string,
  log: (line: string) => void,
): Promise<VerifyOutcome> {
  try {
    const { stdout } = await execa("bash", [scriptPath, imageRef], { timeout: 30_000 });
    if (stdout) log(stdout);
    return { verified: true, mode: "script" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { verified: false, mode: "script", failure: { step: "script", detail } };
  }
}

async function runDirect(
  cosignBin: string,
  imageRef: string,
  certIdentity: string,
  certOidcIssuer: string,
  log: (line: string) => void,
): Promise<VerifyOutcome> {
  try {
    await execa(
      cosignBin,
      [
        "verify",
        "--certificate-identity",
        certIdentity,
        "--certificate-oidc-issuer",
        certOidcIssuer,
        imageRef,
      ],
      { timeout: 15_000 },
    );
    log(`[preboot] signature verified for ${imageRef}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { verified: false, mode: "direct", failure: { step: "signature", detail } };
  }

  try {
    await execa(
      cosignBin,
      [
        "verify-attestation",
        "--type",
        "slsaprovenance",
        "--certificate-identity",
        certIdentity,
        "--certificate-oidc-issuer",
        certOidcIssuer,
        imageRef,
      ],
      { timeout: 15_000 },
    );
    log(`[preboot] SLSA L2 attestation verified for ${imageRef}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { verified: false, mode: "direct", failure: { step: "attestation", detail } };
  }

  return { verified: true, mode: "direct" };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
