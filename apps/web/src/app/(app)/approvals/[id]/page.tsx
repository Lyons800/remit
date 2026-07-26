import { notFound } from 'next/navigation';

import { ApprovalSimulation } from './approval-simulation';
import { findApprovalScenario } from './approval-scenarios';

type ApprovalPageProperties = Readonly<{
  params: Promise<{ id: string }>;
}>;

export default async function ApprovalPage({ params }: ApprovalPageProperties) {
  const { id } = await params;
  const scenario = findApprovalScenario(id);
  if (scenario === undefined) {
    notFound();
  }

  return <ApprovalSimulation key={scenario.invoiceId} scenario={scenario} />;
}
