import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { settlements } from '../../lib/demo';

export default function PaymentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Every settlement happens exactly once. A consumed payment can never
          settle again — the payable token is burned on the ledger.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settlements</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Rail</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.map((settlement) => (
                <TableRow key={settlement.invoiceId}>
                  <TableCell className="font-medium">
                    {settlement.invoiceId}
                  </TableCell>
                  <TableCell>{settlement.supplier}</TableCell>
                  <TableCell className="tabular text-right">
                    {settlement.amount}
                  </TableCell>
                  <TableCell className="text-xs">{settlement.rail}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {settlement.txId}
                  </TableCell>
                  <TableCell>
                    <Badge>Consumed — payable burned</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
