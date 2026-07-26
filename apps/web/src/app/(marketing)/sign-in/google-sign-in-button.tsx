'use client';

import { useState } from 'react';

import { Button } from '../../../components/ui/button';
import { authClient } from '../../../lib/auth-client';

export function GoogleSignInButton() {
  const [error, setError] = useState<string>();
  const [isPending, setIsPending] = useState(false);

  async function signIn() {
    setError(undefined);
    setIsPending(true);

    const result = await authClient.signIn.social({
      callbackURL: '/onboarding',
      newUserCallbackURL: '/onboarding',
      provider: 'google',
    });

    if (result.error !== null) {
      setError(result.error.message ?? 'Google sign-in could not be started.');
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        className="w-full"
        disabled={isPending}
        onClick={signIn}
        type="button"
      >
        {isPending ? 'Opening Google…' : 'Continue with Google'}
      </Button>
      {error === undefined ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
