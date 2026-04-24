import { useRef } from "react";
import type { MouseEvent } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { motion, useMotionTemplate, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SponsorBadge } from "@/components/brand/SponsorBadge";
import { BorderBeam } from "@/components/ui/border-beam";
import { ShinyText } from "@/components/ui/shiny-text";

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
  const mouseX = useSpring(0, { stiffness: 500, damping: 100 });
  const mouseY = useSpring(0, { stiffness: 500, damping: 100 });

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <motion.section
      aria-label="Supply chain verdict"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      onMouseMove={handleMouseMove}
      className={cn(
        "group relative overflow-hidden rounded-xl border p-6 sm:p-8",
        verified
          ? "border-success/30 bg-gradient-to-br from-success/10 via-surface to-surface"
          : "border-destructive/30 bg-gradient-to-br from-destructive/10 via-surface to-surface"
      )}
    >
      <BorderBeam
        size={300}
        duration={12}
        colorFrom={verified ? "hsl(var(--success))" : "hsl(var(--destructive))"}
        colorTo={verified ? "hsl(var(--success) / 0.5)" : "hsl(var(--destructive) / 0.5)"}
      />

      <motion.div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              600px circle at ${mouseX}px ${mouseY}px,
              ${verified ? "hsl(var(--success) / 0.05)" : "hsl(var(--destructive) / 0.05)"},
              transparent 80%
            )
          `,
        }}
      />

      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-20 -top-20 size-64 rounded-full blur-3xl",
          verified ? "bg-success/10" : "bg-destructive/15"
        )}
      />
      
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-5">
          <div
            className={cn(
              "flex size-16 shrink-0 items-center justify-center rounded-xl border shadow-sm",
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
              <ShinyText duration={3}>{verified ? "PASS" : "FAIL"}</ShinyText>
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

      <div className="relative z-10 mt-6 flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">
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
    </motion.section>
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
