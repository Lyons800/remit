import { notFound } from 'next/navigation';

import { ApprovalSimulation } from './approval-simulation';
import { findApprovalScenario } from './approval-scenarios';
import { WorldApproval } from './world-approval';

type ApprovalPageProperties = Readonly<{
  params: Promise<{ id: string }>;
}>;

export default async function ApprovalPage({ params }: ApprovalPageProperties) {
  const { id } = await params;
  const scenario = findApprovalScenario(id);
  if (scenario === undefined) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <ApprovalSimulation key={scenario.invoiceId} scenario={scenario} />
      <WorldApproval
        actionDigest={scenario.actionDigest}
        agentAddress="0xA03F5F37Dcb5A16c317dbf88941c2049B9B96f34"
        approverLabel="A1"
      />
    </div>
  );
}
