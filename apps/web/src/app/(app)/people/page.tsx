'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
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
import {
  APPROVER_ROLES,
  distinctApprovingHumans,
  findHumanCollisions,
  type Person,
  type PersonRole,
} from '../../../lib/people';

const REQUIRED_DISTINCT_HUMANS = 2;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

interface Identity {
  readonly ensName: string | null;
  readonly humanClass: string | null;
}
type HumanMap = ReadonlyMap<string, string | null>;
type IdentityMap = ReadonlyMap<string, Identity>;

export default function PeoplePage() {
  const [people, setPeople] = useState<readonly Person[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [isDemo, setIsDemo] = useState(true);
  const [identities, setIdentities] = useState<IdentityMap>(new Map());
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [role, setRole] = useState<PersonRole>('TREASURY_APPROVER');
  const [error, setError] = useState<string | null>(null);

  const resolveHumans = useCallback(async (roster: readonly Person[]) => {
    if (roster.length === 0) return;
    setIsChecking(true);
    try {
      const response = await fetch('/api/identity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          addresses: roster.map((person) => person.agentAddress),
        }),
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        checkedAt: string;
        resolutions: {
          address: string;
          ensName: string | null;
          humanClass: string | null;
        }[];
      };
      setIdentities(
        new Map(
          data.resolutions.map((r) => [
            r.address.toLowerCase(),
            { humanClass: r.humanClass, ensName: r.ensName },
          ]),
        ),
      );
      setCheckedAt(data.checkedAt);
    } catch {
      /* keep the previous resolution rather than claiming anything new */
    } finally {
      setIsChecking(false);
    }
  }, []);

  const loadRoster = useCallback(async () => {
    try {
      const response = await fetch('/api/people', { cache: 'no-store' });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setLoadError(body.error ?? 'Roster unavailable.');
        return;
      }
      const data = (await response.json()) as {
        canManage: boolean;
        isDemo: boolean;
        people: {
          personId: string;
          displayName: string;
          agentAddress: string;
          role: PersonRole;
        }[];
      };
      setCanManage(data.canManage);
      setIsDemo(data.isDemo);
      const roster: Person[] = data.people.map((p) => ({
        id: p.personId,
        name: p.displayName,
        agentAddress: p.agentAddress,
        role: p.role,
      }));
      setLoadError(null);
      setPeople(roster);
      void resolveHumans(roster);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Roster failed');
    }
  }, [resolveHumans]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  // Only the human backing decides quorum. The ENS name is presentation.
  const humans: HumanMap = useMemo(
    () =>
      new Map(
        [...identities].map(([address, identity]) => [
          address,
          identity.humanClass,
        ]),
      ),
    [identities],
  );
  const collisions = useMemo(
    () => findHumanCollisions(people, humans),
    [people, humans],
  );
  const readyHumans = useMemo(
    () => distinctApprovingHumans(people, humans),
    [people, humans],
  );
  const nameById = useMemo(
    () => new Map(people.map((person) => [person.id, person.name])),
    [people],
  );

  async function addPerson(): Promise<void> {
    if (!canManage) {
      setError(
        'Sign in as a company owner or administrator to change the roster.',
      );
      return;
    }
    if (name.trim() === '') {
      setError('Give the person a name.');
      return;
    }
    const typed = address.trim();
    if (!ADDRESS.test(typed) && !typed.includes('.')) {
      setError('Enter a 0x address or an ENS name such as maria.eth.');
      return;
    }
    setError(null);
    const response = await fetch('/api/people', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: name.trim(),
        agentAddress: address.trim(),
        role,
      }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? 'Could not add that person.');
      return;
    }
    setName('');
    setAddress('');
    await loadRoster();
  }

  async function changeRole(id: string, next: PersonRole): Promise<void> {
    if (!canManage) return;
    setError(null);
    const response = await fetch('/api/people', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personId: id, role: next }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? 'Could not update that role.');
    }
    await loadRoster();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <p className="text-sm text-muted-foreground">
          Three separate facts, and only one of them is ours to grant. ENS says
          what an agent is called. World AgentKit says which unique human stands
          behind it — we can only read that, never grant it. This organisation
          grants the role. A name is not a human and a human is not a role, and
          only the human backing decides quorum.
        </p>
      </div>

      {loadError === null ? null : (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{loadError}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex w-full items-center justify-between">
            <div>
              <CardTitle>Quorum readiness</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {checkedAt === null
                  ? 'Resolving against World Chain…'
                  : `AgentBook checked ${new Date(checkedAt).toLocaleTimeString()}`}
              </p>
            </div>
            <Button
              disabled={isChecking}
              onClick={() => void resolveHumans(people)}
              variant="outline"
            >
              {isChecking ? 'Checking…' : 'Re-check'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            <span
              className={
                readyHumans >= REQUIRED_DISTINCT_HUMANS
                  ? 'font-semibold text-emerald-600'
                  : 'font-semibold text-amber-600'
              }
            >
              {readyHumans} distinct {readyHumans === 1 ? 'human' : 'humans'}
            </span>{' '}
            can currently approve, against {REQUIRED_DISTINCT_HUMANS} required
            for a beneficiary change.
          </p>
          {readyHumans < REQUIRED_DISTINCT_HUMANS ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Adding more agents does not help unless a different human backs
              them. That is the control working, not a configuration problem.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Workspace</CardTitle>
            {canManage ? null : (
              <p className="mt-1 text-xs text-muted-foreground">
                {isDemo
                  ? 'Public demo data is read-only. Sign in and create a company to manage a roster.'
                  : 'Only a company owner or administrator can change this roster.'}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Agent wallet (ENS)</TableHead>
                <TableHead>Human backing</TableHead>
                <TableHead>Company role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => {
                const identity = identities.get(
                  person.agentAddress.toLowerCase(),
                );
                const humanClass = identity?.humanClass;
                const ensName = identity?.ensName ?? null;
                const clash = collisions.get(person.id);
                return (
                  <TableRow key={person.id}>
                    <TableCell>
                      <span className="font-medium">{person.name}</span>
                      {clash === undefined ? null : (
                        <span className="mt-1 block text-xs text-destructive">
                          Same human as{' '}
                          {clash.map((id) => nameById.get(id) ?? id).join(', ')}{' '}
                          — cannot form a quorum together.
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {ensName === null ? (
                        <span className="tabular">{person.agentAddress}</span>
                      ) : (
                        <>
                          <span className="font-medium">{ensName}</span>
                          <span className="tabular block text-[10px] text-muted-foreground">
                            {person.agentAddress}
                          </span>
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      {humanClass === undefined ? (
                        <Badge variant="outline">Checking…</Badge>
                      ) : humanClass === null ? (
                        <Badge variant="warning">No live backing</Badge>
                      ) : (
                        <Badge variant="default">Backed by World</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <select
                        className="border border-border bg-background px-2 py-1 text-xs"
                        disabled={!canManage}
                        onChange={(event) => {
                          const value = event.target.value;
                          void changeRole(
                            person.id,
                            value === '' ? null : (value as PersonRole),
                          );
                        }}
                        value={person.role ?? ''}
                      >
                        <option value="">No approval rights</option>
                        {APPROVER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Add someone</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              They register their own agent in World App — that step is theirs,
              not ours. Paste the agent wallet here and grant the role.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <label className="flex flex-1 flex-col gap-1 text-xs">
                Name
                <input
                  className="border border-border bg-background px-2 py-1.5 text-sm"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Maria Santos"
                  value={name}
                />
              </label>
              <label className="flex flex-[2] flex-col gap-1 text-xs">
                Agent wallet or ENS name
                <input
                  className="tabular border border-border bg-background px-2 py-1.5 text-sm"
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="maria.eth or 0x…"
                  value={address}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Role
                <select
                  className="border border-border bg-background px-2 py-1.5 text-sm"
                  onChange={(event) => {
                    const value = event.target.value;
                    setRole(value === '' ? null : (value as PersonRole));
                  }}
                  value={role ?? ''}
                >
                  <option value="">No approval rights</option>
                  {APPROVER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <Button onClick={() => void addPerson()}>Add</Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sign in as a company owner or administrator to add people and
              assign company roles.
            </p>
          )}
          {error === null ? null : (
            <p className="mt-2 text-xs text-destructive">{error}</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            The roster is stored in Postgres, scoped to this organisation. Human
            backing is not stored anywhere, deliberately: a cached &ldquo;this
            agent is that human&rdquo; would let anyone who reached the database
            manufacture a quorum.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
