import { Terminal, FileKey2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyRow } from "@/components/common/CopyRow";
import { truncateDigest } from "@/lib/format";

export interface CosignReceiptProps {
  signatureDigest: string;
  certificateIdentity: string;
  oidcIssuer: string;
  subjectAltName: string;
  notBefore: string;
  notAfter: string;
  verifyCommand: string;
  fixture?: boolean;
}

export function CosignReceipt({
  signatureDigest,
  certificateIdentity,
  oidcIssuer,
  subjectAltName,
  notBefore,
  notAfter,
  verifyCommand,
  fixture,
}: CosignReceiptProps) {
  return (
    <Card data-demo={fixture ? "fixture" : undefined} className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <FileKey2 className="size-3.5 text-accent" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                cosign signature
              </span>
            </div>
            <CardTitle>Keyless · Fulcio-issued</CardTitle>
            <CardDescription>
              Signed by the OIDC-gated short-lived cert above. Verify with the command below.
            </CardDescription>
          </div>
          <Badge variant="success">signed</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="rounded-md border border-border bg-background/60 px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
              signature (sha256)
            </span>
            <span className="font-mono text-[10px] text-faint">truncated · full copy</span>
          </div>
          <CopyRow value={signatureDigest} tone="mono" dense />
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {truncateDigest(signatureDigest, 24, 8)}
          </div>
        </div>

        <dl className="space-y-0.5 rounded-md border border-border bg-surface/60 px-3 py-2">
          <CopyRow label="cert identity" value={certificateIdentity} />
          <CopyRow label="oidc issuer" value={oidcIssuer} />
          <CopyRow label="san" value={subjectAltName} truncate />
          <CopyRow label="not before" value={notBefore} dense />
          <CopyRow label="not after" value={notAfter} dense />
        </dl>

        <div className="mt-auto space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Terminal className="size-3 text-faint" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
              verify locally · scripts/verify_release.sh
            </span>
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <CopyRow value={verifyCommand} tone="mono" dense />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
