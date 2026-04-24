import { ShieldCheck, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SponsorBadge } from "@/components/brand/SponsorBadge";

export interface HeroVerdictProps {
  verified: boolean;
  imageRef: string;
  digest: string;
  signedAt: string;
  builderRef: string;
}

export function HeroVerdict({
  verified,
  imageRef,
  digest,
  signedAt,
  builderRef,
}: HeroVerdictProps) {
  return (
    <section
      aria-label="Supply chain verdict"
      className={cn(
        "relative overflow-hidden rounded-xl border p-6 sm:p-8",
        verified
          ? "border-success/30 bg-gradient-to-br from-success/10 via-surface to-surface"
          : "border-destructive/30 bg-gradient-to-br from-destructive/10 via-surface to-surface"
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-20 -top-20 size-64 rounded-full blur-3xl",
          verified ? "bg-success/10" : "bg-destructive/15"
        )}
      />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-5">
          <div
            className={cn(
              "flex size-16 shrink-0 items-center justify-center rounded-xl border",
              verified
                ? "border-success/40 bg-success/10 text-success"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            )}
          >
            {verified ? (
              <ShieldCheck className="size-8" strokeWidth={1.5} />
            ) : (
              <ShieldAlert className="size-8" strokeWidth={1.5} />
            )}
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                cosign verify
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-wider",
                  verified ? "text-success" : "text-destructive"
                )}
              >
                · {signedAt}
              </span>
            </div>
            <h2
              className={cn(
                "text-[40px] font-bold leading-none tracking-tight sm:text-[48px]",
                verified ? "text-success" : "text-destructive"
              )}
            >
              {verified ? "PASS" : "FAIL"}
            </h2>
            <p className="mt-2 max-w-[56ch] text-[13px] text-muted-foreground">
              {verified ? (
                <>
                  Keyless signature validated against the expected{" "}
                  <span className="font-mono text-foreground">certificate-identity</span> and{" "}
                  <span className="font-mono text-foreground">oidc-issuer</span>; Rekor inclusion
                  proof confirmed.
                </>
              ) : (
                <>
                  Signature absent, expired, or the certificate identity did not match the
                  expected GitHub Actions workflow. Do not deploy.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:w-[360px] lg:shrink-0">
          <Field label="image" value={imageRef} />
          <Field label="digest" value={digest} />
          <Field label="builder" value={builderRef} />
        </div>
      </div>

      <div className="relative mt-6 flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">
        <Badge variant={verified ? "success" : "destructive"}>
          {verified ? "SLSA · L2" : "unverified"}
        </Badge>
        <Badge variant="outline">Sigstore · Fulcio · Rekor</Badge>
        <Badge variant="outline">SPDX 2.3 SBOM</Badge>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SponsorBadge sponsor="chainguard" />
          <span className="font-mono text-[10px] text-faint">+</span>
          <SponsorBadge sponsor="wundergraph" />
        </div>
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/60 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-faint">
        {label}
      </div>
      <div className="mt-0.5 truncate font-mono text-[12px] text-foreground" title={value}>
        {value}
      </div>
    </div>
  );
}
