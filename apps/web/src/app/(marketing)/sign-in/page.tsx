import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { getAuth } from '../../../lib/auth.server';
import { GoogleSignInButton } from './google-sign-in-button';

export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (session !== null) {
    redirect('/onboarding');
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
      <Card className="w-full">
        <CardHeader>
          <p className="microlabel">Company workspace</p>
          <CardTitle>Sign in to Remit</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use your work Google account. Payment approval remains a separate,
            explicit authority check.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <GoogleSignInButton />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Signing in identifies you to this application. It does not grant
            permission to approve or settle supplier payments.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
