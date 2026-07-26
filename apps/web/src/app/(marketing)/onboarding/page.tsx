import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { getAuth } from '../../../lib/auth.server';
import { CompanyOnboardingForm } from './company-onboarding-form';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (session === null) {
    redirect('/sign-in');
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg items-center">
      <Card className="w-full">
        <CardHeader>
          <p className="microlabel">One last step</p>
          <CardTitle>Create your company workspace</CardTitle>
          <p className="text-sm text-muted-foreground">
            This keeps invoices, suppliers, policies, and audit evidence scoped
            to the correct company.
          </p>
        </CardHeader>
        <CardContent>
          <CompanyOnboardingForm
            email={session.user.email}
            userName={session.user.name}
          />
        </CardContent>
      </Card>
    </div>
  );
}
