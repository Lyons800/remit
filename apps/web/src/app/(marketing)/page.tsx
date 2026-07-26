import Link from 'next/link';

export const metadata = {
  title: 'Remit · Let agents pay the invoices',
  description:
    'Let agents pay the invoices, and prove they paid the right thing.',
};

const REFUSALS = [
  {
    code: 'ACTION_DIGEST_MISMATCH',
    title: 'Change the account after approval',
    body: 'The digest is the payment. Change one character and every approval collected against it is void.',
  },
  {
    code: 'ACTION_HUMAN_NOT_DISTINCT',
    title: 'Approve twice from one person',
    body: 'Two company logins, two agent wallets, one human. World AgentKit resolves both. Quorum stays at one.',
  },
  {
    code: 'REPLAY_DETECTED',
    title: 'Reuse an approval to reach quorum',
    body: 'An approval is single-use and bound to one action. Reusing it is refused, not counted.',
  },
];

export default function WelcomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[880px] flex-col justify-center gap-14 px-6 py-20">
      <header className="flex flex-col gap-5">
        <span className="flex h-7 w-7 items-center justify-center bg-primary font-mono text-xs font-semibold text-primary-foreground">
          R
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Let agents pay the invoices.
          <br />
          Prove they paid the right thing.
        </h1>
        <p className="max-w-[62ch] text-base text-muted-foreground">
          Every company says it has a control: two people must approve. That
          only ever verified that two <em>accounts</em> clicked a button. Point
          an agent at it and a second independent approver costs one{' '}
          <code className="font-mono text-sm">new Wallet()</code>.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="border border-border p-5">
          <p className="microlabel">The 990</p>
          <p className="mt-2 text-sm">
            Known supplier, unchanged bank account, within tolerance. The agent
            settles it on Hedera unattended. Nobody is asked anything.
          </p>
        </div>
        <div className="border border-border p-5">
          <p className="microlabel">The 10</p>
          <p className="mt-2 text-sm">
            Anything that changes where money can go escalates and demands two{' '}
            <strong>provably distinct humans</strong> — established through
            World AgentKit, not through two logins.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold">
          The demo is not the happy path. It is watching it refuse.
        </h2>
        <div className="flex flex-col divide-y divide-border border border-border">
          {REFUSALS.map((refusal) => (
            <div className="flex flex-col gap-1 p-5" key={refusal.code}>
              <p className="font-mono text-xs text-destructive">
                {refusal.code}
              </p>
              <p className="text-sm font-medium">{refusal.title}</p>
              <p className="text-sm text-muted-foreground">{refusal.body}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Each refusal is returned by the shipped domain package, not asserted
          by a script.
        </p>
      </section>

      <section className="flex flex-col gap-4 border border-border p-6">
        <div>
          <h2 className="text-sm font-semibold">Have a look around</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            There is no account system yet. The demo organisation is a shared,
            read-mostly workspace holding synthetic AP records — the Hedera
            evidence in it is real and public, the invoices are not.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className="border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
            href="/dashboard"
          >
            Open the demo organisation
          </Link>
          <Link
            className="border border-border px-4 py-2 text-sm font-medium"
            href="/people"
          >
            See who can approve
          </Link>
          <a
            className="border border-border px-4 py-2 text-sm font-medium"
            href="https://github.com/Lyons800/remit"
            rel="noreferrer"
            target="_blank"
          >
            Read the code
          </a>
        </div>
      </section>

      <footer className="flex flex-col gap-2 text-xs text-muted-foreground">
        <p>
          Remit proves the integrity of the authorisation path. It does not
          prove that a supplier owns a bank account, that an invoice is genuine,
          or that a verification service is truthful.
        </p>
        <p>ETHGlobal Lisbon 2026 · Hedera Testnet · World Chain · ENS</p>
      </footer>
    </main>
  );
}
