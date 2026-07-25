import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { POLICY_VERSION, policyRules } from '../../lib/demo';

export default function PoliciesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
        <Badge variant="outline">version {POLICY_VERSION}</Badge>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">
        The routing rules, versioned. The policy version is part of every
        payment identifier, so a decision can never be re-judged under
        different rules after the fact.
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
                  rule.outcome.startsWith('Paid') ? 'default' : 'destructive'
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
            Two approvers who are <b className="text-foreground">provably
            distinct people</b> — established through World, not by counting
            logins or wallets.
          </p>
          <p>
            Each approval binds to the exact payment identifier. Change one
            character of the request and every approval is void.
          </p>
          <p>
            Company roles come from the company’s own credential issuer —
            World proves personhood, never job title.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
