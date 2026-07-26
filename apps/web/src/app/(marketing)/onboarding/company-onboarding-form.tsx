'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import { Button } from '../../../components/ui/button';
import { authClient } from '../../../lib/auth-client';
import { createCompanySlug } from '../../../lib/company-slug';

type CompanyOnboardingFormProperties = Readonly<{
  email: string;
  userName: string;
}>;

export function CompanyOnboardingForm({
  email,
  userName,
}: CompanyOnboardingFormProperties) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState<string>();
  const [isChecking, setIsChecking] = useState(true);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    async function selectExistingCompany() {
      const organizations = await authClient.organization.list();

      if (!isCurrent) {
        return;
      }

      const firstOrganization = organizations.data?.[0];

      if (firstOrganization !== undefined) {
        await authClient.organization.setActive({
          organizationId: firstOrganization.id,
        });
        router.replace('/invoices');
        router.refresh();
        return;
      }

      if (organizations.error !== null) {
        setError(
          organizations.error.message ??
            'Your company workspaces could not be loaded.',
        );
      }

      setIsChecking(false);
    }

    void selectExistingCompany();

    return () => {
      isCurrent = false;
    };
  }, [router]);

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = companyName.trim();

    if (name.length < 2) {
      setError('Enter the legal or trading name of your company.');
      return;
    }

    setError(undefined);
    setIsPending(true);

    const created = await authClient.organization.create({
      name,
      slug: createCompanySlug(name, crypto.randomUUID()),
    });

    if (created.error !== null || created.data === null) {
      setError(
        created.error?.message ??
          'Your company workspace could not be created.',
      );
      setIsPending(false);
      return;
    }

    const activated = await authClient.organization.setActive({
      organizationId: created.data.id,
    });

    if (activated.error !== null) {
      setError(
        activated.error.message ??
          'The company was created but could not be selected.',
      );
      setIsPending(false);
      return;
    }

    router.replace('/invoices');
    router.refresh();
  }

  if (isChecking) {
    return (
      <p className="text-sm text-muted-foreground">
        Checking your company workspace…
      </p>
    );
  }

  return (
    <form className="space-y-5" onSubmit={createCompany}>
      <div className="border border-border bg-muted/30 px-3 py-2">
        <p className="text-sm font-medium">{userName}</p>
        <p className="text-xs text-muted-foreground">{email}</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="company-name">
          Company name
        </label>
        <input
          autoComplete="organization"
          autoFocus
          className="h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          id="company-name"
          maxLength={120}
          onChange={(event) => setCompanyName(event.target.value)}
          placeholder="Padel Peru, Lda"
          required
          value={companyName}
        />
        <p className="text-xs text-muted-foreground">
          You will be the workspace owner. Financial approval roles are assigned
          separately.
        </p>
      </div>
      {error === undefined ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? 'Creating company…' : 'Create company workspace'}
      </Button>
    </form>
  );
}
