import { Badge } from '../../../components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { POLICY_VERSION, policyRules } from '../../../lib/demo';

export default function PoliciesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
        <Badge variant="outline">version {POLICY_VERSION}</Badge>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Illustrative versioned routing rules. The committed protocol binds a
        policy decision into the canonical action digest; this page does not
        execute that protocol.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {policyRules.map((rule) => (
          <Card key={rule.trigger}>
            <CardHeader>
              <CardTitle className="text-sm">{rule.trigger}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Badge
                variant={
                  rule.outcome.startsWith('Eligible')
                    ? 'default'
                    : 'destructive'
                }
              >
                {rule.outcome}
              </Badge>
              <p className="text-sm text-muted-foreground">{rule.rationale}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Approval requirements once held</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            The product rule requires two independently admitted backing classes
            and action-time human decisions. The current World integration is an
            offline contract, not live authority.
          </p>
          <p>
            Each approval is designed to bind the canonical bare 64-hex action
            digest. Changing one request field creates a different action.
          </p>
          <p>
            Company roles come from the company&apos;s credential issuer. World
            human backing would remain an independent fact, never a job title or
            treasury grant.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
