import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { auditEvents } from '../../lib/demo';

const kindBadge = {
  allow: ['Allowed', 'default'],
  info: ['Recorded', 'outline'],
  refuse: ['Refused', 'destructive'],
} as const;

export default function AuditPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every decision, including the refusals. This is what an auditor
          exports — approvals bound to exact identifiers, not screenshots.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Control decisions</CardTitle>
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
                  <Badge variant={variant}>{label}</Badge>
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
