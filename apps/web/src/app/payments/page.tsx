import { HederaEvidenceDetail } from '../../components/hedera-evidence';
import { Badge } from '../../components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { loadHederaEvidence } from '../../lib/mirror-evidence.server';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const evidence = await loadHederaEvidence();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Payments & ledger evidence
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Public Hedera Testnet facts are live. Supplier invoice settlement is
          not: the x402 HBAR transfer paid a test verification service, and the
          HTS NFT is a no-value lifecycle marker experiment.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Claim boundary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-3">
          <div className="border border-border p-3">
            <Badge>Demonstrated</Badge>
            <p className="mt-2">Three-party x402 HBAR transfer on Testnet</p>
          </div>
          <div className="border border-border p-3">
            <Badge>Demonstrated</Badge>
            <p className="mt-2">Treasury-held HTS NFT create, mint, and burn</p>
          </div>
          <div className="border border-border p-3">
            <Badge variant="destructive">Not demonstrated</Badge>
            <p className="mt-2">Supplier payment or canonical AP execution</p>
          </div>
        </CardContent>
      </Card>

      <HederaEvidenceDetail result={evidence} />
    </div>
  );
}
