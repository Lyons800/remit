import { HederaEvidenceDetail } from '../../../components/hedera-evidence';
import { Badge } from '../../../components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { auditEvents } from '../../../lib/demo';
import { loadHederaEvidence } from '../../../lib/mirror-evidence.server';

const kindBadge = {
  allow: ['Allowed', 'default'],
  info: ['Recorded', 'outline'],
  refuse: ['Refused', 'destructive'],
} as const;

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const evidence = await loadHederaEvidence();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Evidence & audit
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Live public Hedera facts are kept separate from the illustrative
          control trace. The current browser scenario is not a durable audit
          export.
        </p>
      </div>

      <HederaEvidenceDetail result={evidence} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Synthetic control trace</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Product storytelling fixture · not sponsor evidence
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col">
            {auditEvents.map((event) => {
              const [label, variant] = kindBadge[event.kind];
              return (
                <li
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border py-3 text-sm last:border-b-0"
                  key={event.text}
                >
                  <span className="tabular w-28 shrink-0 text-xs text-muted-foreground">
                    {event.at}
                  </span>
                  <Badge variant={variant}>Scenario · {label}</Badge>
                  <span className="w-16 shrink-0 text-xs text-muted-foreground uppercase">
                    {event.actor}
                  </span>
                  <span className="min-w-0 flex-1 text-sm leading-relaxed">
                    {event.text}
                  </span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
