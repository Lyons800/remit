'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  APPROVER_ROLES,
  distinctApprovingHumans,
  findHumanCollisions,
  type Person,
  type PersonRole,
} from '../../lib/people';

const REQUIRED_DISTINCT_HUMANS = 2;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

type HumanMap = ReadonlyMap<string, string | null>;

export default function PeoplePage() {
  const [people, setPeople] = useState<readonly Person[]>([]);
  const [humans, setHumans] = useState<HumanMap>(new Map());
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
      const response = await fetch('/api/agentbook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          addresses: roster.map((person) => person.agentAddress),
        }),
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        checkedAt: string;
        resolutions: { address: string; humanId: string | null }[];
      };
      setHumans(
        new Map(
          data.resolutions.map((r) => [r.address.toLowerCase(), r.humanId]),
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
        people: {
          personId: string;
          displayName: string;
          agentAddress: string;
          role: PersonRole;
        }[];
      };
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
    if (name.trim() === '') {
      setError('Give the person a name.');
      return;
    }
    if (!ADDRESS.test(address.trim())) {
      setError('Agent wallet must be a 0x-prefixed 20-byte address.');
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
    setPeople((current) =>
      current.map((person) =>
        person.id === id ? { ...person, role: next } : person,
      ),
    );
    await fetch('/api/people', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personId: id, role: next }),
    });
    await loadRoster();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <p className="text-sm text-muted-foreground">
          Two separate facts decide whether someone can approve a payment. World
          AgentBook says a unique human stands behind an agent wallet — we can
          only read that, never grant it. This organisation grants the role.
          Neither is authority on its own.
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
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Agent wallet</TableHead>
                <TableHead>Human backing</TableHead>
                <TableHead>Company role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => {
                const humanId = humans.get(person.agentAddress.toLowerCase());
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
                    <TableCell className="tabular text-xs">
                      {person.agentAddress}
                    </TableCell>
                    <TableCell>
                      {humanId === undefined ? (
                        <Badge variant="outline">Checking…</Badge>
                      ) : humanId === null ? (
                        <Badge variant="warning">Not registered</Badge>
                      ) : (
                        <div>
                          <Badge variant="default">Registered</Badge>
                          <span className="tabular mt-1 block text-[10px] text-muted-foreground">
                            {humanId.slice(0, 18)}…
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <select
                        className="border border-border bg-background px-2 py-1 text-xs"
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
              Agent wallet
              <input
                className="tabular border border-border bg-background px-2 py-1.5 text-sm"
                onChange={(event) => setAddress(event.target.value)}
                placeholder="0x…"
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
