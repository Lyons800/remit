import { Badge } from '../../../components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { suppliers } from '../../../lib/demo';

const standingBadge = {
  flagged: ['Account change pending', 'destructive'],
  new: ['New — no baseline', 'warning'],
  trusted: ['Trusted', 'default'],
} as const;

export default function SuppliersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
        <p className="text-sm text-muted-foreground">
          Synthetic supplier snapshots used to explain deterministic routing.
          They are not connected vendor-master records.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Scenario baselines</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Illustrative records only
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Account on file</TableHead>
                <TableHead className="text-right">Scenario history</TableHead>
                <TableHead>Last scenario activity</TableHead>
                <TableHead className="text-right">Unattended limit</TableHead>
                <TableHead>Standing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => {
                const [label, variant] = standingBadge[supplier.standing];
                return (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <span className="font-medium">{supplier.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {supplier.id}
                      </span>
                    </TableCell>
                    <TableCell className="tabular text-xs">
                      {supplier.accountOnFile}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {supplier.scenarioInvoiceCount}
                    </TableCell>
                    <TableCell className="text-xs">
                      {supplier.lastScenarioActivity}
                    </TableCell>
                    <TableCell className="tabular text-right text-xs">
                      {supplier.unattendedCap}
                    </TableCell>
                    <TableCell>
                      <Badge variant={variant}>{label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
