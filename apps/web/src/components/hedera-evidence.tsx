import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

import type { HederaEvidenceResult } from '../lib/mirror-evidence.server';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

type EvidenceProperties = Readonly<{ result: HederaEvidenceResult }>;

function formatCheckTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(isoTimestamp));
}

function EvidenceLink({
  children,
  href,
}: Readonly<{ children: ReactNode; href: string }>) {
  return (
    <a
      className="inline-flex items-center gap-1 text-xs text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
      <ExternalLink aria-hidden size={12} strokeWidth={1.5} />
    </a>
  );
}

function FailedEvidence({
  checkedAt,
  status,
}: Readonly<{
  checkedAt: string;
  status: 'mismatch' | 'unavailable';
}>) {
  const mismatch = status === 'mismatch';
  return (
    <Card className="border-destructive/40">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Live Hedera Testnet evidence</CardTitle>
        <Badge variant="destructive">
          {mismatch ? 'Evidence mismatch' : 'Mirror unavailable'}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm">
          {mismatch
            ? 'Mirror Node responded, but at least one expected immutable fact did not match. Live proof is withheld.'
            : 'Remit could not read every required public Mirror Node endpoint.'}{' '}
          No cached or synthetic value has been substituted.
        </p>
        <p className="microlabel">
          Last attempt {formatCheckTime(checkedAt)} UTC
        </p>
      </CardContent>
    </Card>
  );
}

export function HederaEvidenceSummary({ result }: EvidenceProperties) {
  if (result.status !== 'verified') {
    return (
      <FailedEvidence checkedAt={result.checkedAt} status={result.status} />
    );
  }

  const { hts, x402 } = result.evidence;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Live Hedera Testnet evidence</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Fetched server-side from the public Mirror Node and checked against
            exact expected fields.
          </p>
        </div>
        <Badge>Mirror verified</Badge>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 border-l-2 border-primary pl-3">
          <p className="microlabel">x402 payment spike</p>
          <p className="text-sm">
            <span className="tabular">1,000,000 tinybar</span> moved from{' '}
            <span className="tabular">{x402.payerAccountId}</span> to the
            verification service. The facilitator paid the network fee.
          </p>
          <EvidenceLink href={x402.hashScanUrl}>Open transaction</EvidenceLink>
        </div>
        <div className="flex flex-col gap-2 border-l-2 border-primary pl-3">
          <p className="microlabel">HTS marker experiment</p>
          <p className="text-sm">
            Token <span className="tabular">{hts.tokenId}</span>, serial 1, was
            minted to and burned from the same treasury. Current supply is zero.
          </p>
          <EvidenceLink
            href={`https://hashscan.io/testnet/token/${hts.tokenId}`}
          >
            Open token
          </EvidenceLink>
        </div>
        <p className="microlabel md:col-span-2">
          Checked {formatCheckTime(result.checkedAt)} UTC · public facts only
        </p>
      </CardContent>
    </Card>
  );
}

interface FactProperties {
  readonly label: string;
  readonly value: ReactNode;
}

function Fact({ label, value }: FactProperties) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0">
      <dt className="microlabel">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export function HederaEvidenceDetail({ result }: EvidenceProperties) {
  if (result.status !== 'verified') {
    return (
      <FailedEvidence checkedAt={result.checkedAt} status={result.status} />
    );
  }

  const { hts, x402 } = result.evidence;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Live x402 transport/payment spike</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Exact public ledger facts, independently read from Mirror Node.
            </p>
          </div>
          <Badge>Consensus success</Badge>
        </CardHeader>
        <CardContent className="grid gap-x-8 lg:grid-cols-2">
          <dl>
            <Fact
              label="Transaction"
              value={
                <EvidenceLink href={x402.hashScanUrl}>
                  {x402.transactionId}
                </EvidenceLink>
              }
            />
            <Fact
              label="Service payment"
              value={
                <>
                  <span className="tabular">{x402.amountTinybar}</span> tinybar
                  (0.01 HBAR)
                </>
              }
            />
            <Fact
              label="Route"
              value={
                <span className="tabular">
                  {x402.payerAccountId} → {x402.serviceAccountId}
                </span>
              }
            />
          </dl>
          <dl>
            <Fact
              label="Facilitator / transaction payer"
              value={
                <span className="tabular">{x402.facilitatorAccountId}</span>
              }
            />
            <Fact
              label="Facilitator network fee"
              value={
                <span className="tabular">
                  {x402.networkFeeTinybar} tinybar
                </span>
              }
            />
            <Fact
              label="Consensus timestamp"
              value={<span className="tabular">{x402.consensusTimestamp}</span>}
            />
          </dl>
          <div className="mt-4 border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground lg:col-span-2">
            <b className="text-foreground">Evidence boundary:</b> this proves a
            three-party HBAR transfer used by the live x402 spike. The
            transaction has an empty memo, its run note uses a{' '}
            <span className="tabular">0x</span>-prefixed digest, and the gate
            script is absent from this repository. It does not prove that the
            committed hardened adapter executed a canonical Remit AP action.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Live HTS lifecycle marker experiment</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              One no-value NFT serial, held only by the treasury.
            </p>
          </div>
          <Badge>Lifecycle verified</Badge>
        </CardHeader>
        <CardContent className="grid gap-x-8 lg:grid-cols-2">
          <dl>
            <Fact
              label="Token"
              value={
                <EvidenceLink
                  href={`https://hashscan.io/testnet/token/${hts.tokenId}`}
                >
                  {hts.tokenId} · {hts.symbol}
                </EvidenceLink>
              }
            />
            <Fact label="Type" value={hts.type} />
            <Fact
              label="Treasury / only holder before burn"
              value={<span className="tabular">{hts.treasuryAccountId}</span>}
            />
            <Fact
              label="Current state"
              value="Serial 1 deleted · total supply 0 · supply key remains"
            />
          </dl>
          <dl>
            <Fact
              label="Create"
              value={
                <EvidenceLink href={hts.create.hashScanUrl}>
                  {hts.create.transactionId}
                </EvidenceLink>
              }
            />
            <Fact
              label="Mint serial 1 to treasury"
              value={
                <EvidenceLink href={hts.mint.hashScanUrl}>
                  {hts.mint.transactionId}
                </EvidenceLink>
              }
            />
            <Fact
              label="Burn serial 1 from treasury"
              value={
                <EvidenceLink href={hts.burn.hashScanUrl}>
                  {hts.burn.transactionId}
                </EvidenceLink>
              }
            />
            <Fact
              label="Deleted NFT Mirror record"
              value={
                <EvidenceLink href={hts.nftMirrorUrl}>
                  exact marker metadata
                </EvidenceLink>
              }
            />
          </dl>
          <div className="mt-4 flex flex-col gap-2 border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground lg:col-span-2">
            <p>
              <b className="text-foreground">Experimental marker digest:</b>{' '}
              <span className="tabular break-all">
                {hts.experimentalDigest}
              </span>
            </p>
            <p>
              <b className="text-foreground">Evidence boundary:</b> Mirror
              proves create, treasury mint, treasury burn, deleted serial
              metadata, and zero current supply. It does not prove a supplier
              payment, supplier-held authority, replay prevention, or atomic
              settlement. The supply key can mint another serial.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sponsor integration status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-3">
          <div className="border border-border p-3">
            <Badge>Live evidence</Badge>
            <p className="mt-2 font-medium">Hedera x402 spike</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Public transfer verified; canonical AP execution not yet proven.
            </p>
          </div>
          <div className="border border-border p-3">
            <Badge>Live evidence</Badge>
            <p className="mt-2 font-medium">Hedera HTS marker</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Public lifecycle verified; not an invoice settlement.
            </p>
          </div>
          <div className="border border-border p-3">
            <Badge variant="outline">Offline contract</Badge>
            <p className="mt-2 font-medium">World authority</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Adapter and tests only. No live World authority is claimed.
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="microlabel">
        Mirror checked {formatCheckTime(result.checkedAt)} UTC · validation is
        fail closed
      </p>
    </div>
  );
}
