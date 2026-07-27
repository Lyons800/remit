import { Badge } from '../../../components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';

/**
 * The rules the pipeline actually enforces — this page documents the
 * implemented checks, not an aspiration.
 */

const CHECKS = [
  [
    'Arithmetic',
    'Line items must sum to the subtotal; VAT must equal rate × subtotal; subtotal + VAT must equal the total (±2 cents rounding).',
    'critical',
  ],
  [
    'IBAN checksum',
    'The payee IBAN must pass its ISO 13616 mod-97 checksum. A typo or fabricated account fails structurally.',
    'critical',
  ],
  [
    'Supplier baseline',
    'The first settled invoice establishes the supplier’s account. A later invoice naming a different IBAN is blocked — the classic redirection fraud.',
    'critical',
  ],
  [
    'Duplicates',
    'The identical document is refused outright; a re-used invoice number from the same supplier is blocked.',
    'critical',
  ],
  [
    'Readability',
    'Fields the AI could not read reliably are flagged for human eyes rather than silently trusted.',
    'warning',
  ],
  [
    'Amount anomaly',
    'A total more than 3× the supplier’s historical average is flagged.',
    'warning',
  ],
] as const;

export default function PoliciesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every uploaded invoice passes these deterministic checks. A clean
          invoice under €500 from an established supplier settles straight
          through; anything flagged — and every first invoice from a new
          supplier — waits for a World-verified human.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {CHECKS.map(([title, description, severity]) => (
          <Card key={title}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>{title}</CardTitle>
                <Badge variant={severity === 'critical' ? 'destructive' : 'warning'}>
                  {severity}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What approval means</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Approving a blocked invoice is a World proof-of-personhood bound to
          that exact payment’s digest — not a role, not a password. One
          approval settles at most one payment, and a deliberately approved
          account change becomes the supplier’s new baseline.
        </CardContent>
      </Card>
    </div>
  );
}
