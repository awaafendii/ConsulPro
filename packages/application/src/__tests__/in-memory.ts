/**
 * Implémentation en mémoire des ports, pour les tests unitaires de l'application.
 * Elle reproduit l'annulation transactionnelle (aucune écriture si erreur).
 * L'isolation en base (RLS) est testée séparément, en intégration, sur PostgreSQL.
 */
import { err, ok } from '@consulpro/calc-core';

import type { UserContext } from '../context';
import type {
  ApplicationDeps,
  AuditEntry,
  AuditRecord,
  DbScope,
  InvitationRecord,
  MembershipRecord,
  OrganizationRecord,
  Repositories,
  UnitOfWork,
} from '../ports';
import { EngineRegistry } from '@consulpro/calc-core';
import { DEMO_ENGINES } from '@consulpro/calc-demo';

import { calculationRepositories, type CalculationState } from './in-memory-calculations';
import { projectRepositories, type ProjectState } from './in-memory-projects';

interface State extends ProjectState, CalculationState {
  users: CalculationState['users'];
  organizations: OrganizationRecord[];
  memberships: MembershipRecord[];
  invitations: InvitationRecord[];
  audit: AuditRecord[];
}

const emptyState = (): State => ({
  users: [],
  organizations: [],
  memberships: [],
  invitations: [],
  audit: [],
  projects: [],
  projectMembers: [],
  projectDisciplines: [],
  projectStandards: [],
  activity: [],
  standardVersions: [],
  overrides: [],
  studies: [],
  calculations: [],
  revisions: [],
  reviews: [],
  dependencies: [],
  datasets: [],
  datasetRevisions: [],
  notifications: [],
});

export class InMemoryStore {
  state: State = emptyState();
  sentMail: { to: string; subject: string; text: string }[] = [];
  failMail = false;
  private seq = 0;
  now = new Date('2026-10-08T08:00:00.000Z');
  /** Moteurs de démonstration, comme en développement et en test. */
  readonly engines = (() => {
    const registry = new EngineRegistry();
    for (const engine of DEMO_ENGINES) registry.register(engine);
    return registry;
  })();

  nextId(): string {
    this.seq += 1;
    return `00000000-0000-7000-8000-${this.seq.toString().padStart(12, '0')}`;
  }

  addUser(
    email: string,
    name = email.split('@')[0] ?? email,
    platformAdmin = false,
  ): { id: string; email: string; name: string; platformAdmin: boolean } {
    const user = { id: this.nextId(), email, name, platformAdmin };
    this.state.users.push(user);
    return user;
  }

  repositories(
    scope: DbScope = { organizationId: null, userId: null, userEmail: null },
  ): Repositories {
    const s = this.state;
    const now = () => this.now;
    const userOf = (id: string) => s.users.find((u) => u.id === id);
    return {
      ...calculationRepositories(s, now, () => this.nextId()),
      ...projectRepositories(
        s,
        now,
        () => this.nextId(),
        () => scope.userId,
      ),
      organizations: {
        create: async ({ id, name, slug }) => {
          if (s.organizations.some((o) => o.slug === slug)) return err('SLUG_TAKEN');
          const record = { id, name, slug, country: null, currency: 'XOF', createdAt: now() };
          s.organizations.push(record);
          return ok(record);
        },
        findById: async (id) => s.organizations.find((o) => o.id === id) ?? null,
      },
      memberships: {
        listOrganizationsOfUser: async (userId) =>
          s.memberships
            .filter((m) => m.userId === userId)
            .flatMap((m) => {
              const o = s.organizations.find((x) => x.id === m.organizationId);
              return o ? [{ ...o, role: m.role, membershipId: m.id }] : [];
            }),
        findOrganizationOfUserBySlug: async (userId, slug) => {
          const o = s.organizations.find((x) => x.slug === slug);
          const m =
            o && s.memberships.find((x) => x.organizationId === o.id && x.userId === userId);
          return o && m ? { ...o, role: m.role, membershipId: m.id } : null;
        },
        listMembers: async (organizationId) =>
          s.memberships
            .filter((m) => m.organizationId === organizationId)
            .map((m) => ({
              ...m,
              name: userOf(m.userId)?.name ?? '',
              email: userOf(m.userId)?.email ?? '',
            })),
        findById: async (organizationId, id) =>
          s.memberships.find((m) => m.organizationId === organizationId && m.id === id) ?? null,
        findByUserId: async (organizationId, userId) =>
          s.memberships.find((m) => m.organizationId === organizationId && m.userId === userId) ??
          null,
        findByEmail: async (organizationId, email) =>
          s.memberships.find(
            (m) => m.organizationId === organizationId && userOf(m.userId)?.email === email,
          ) ?? null,
        create: async (input) => {
          const record = { ...input, version: 1, createdAt: now() };
          s.memberships.push(record);
          return record;
        },
        updateRole: async (organizationId, id, role, version) => {
          const match = (m: MembershipRecord) =>
            m.organizationId === organizationId && m.id === id && m.version === version;
          const found = s.memberships.some(match);
          s.memberships = s.memberships.map((m) =>
            match(m) ? { ...m, role, version: m.version + 1 } : m,
          );
          return found;
        },
        delete: async (organizationId, id, version) => {
          const target = s.memberships.find(
            (m) => m.organizationId === organizationId && m.id === id && m.version === version,
          );
          if (!target) return false;
          s.memberships = s.memberships.filter((m) => m !== target);
          // Comme le trigger en base : retirer de l'organisation retire de ses projets.
          s.projectMembers = s.projectMembers.filter(
            (m) => !(m.organizationId === organizationId && m.userId === target.userId),
          );
          return true;
        },
      },
      invitations: {
        create: async (input) => {
          const record: InvitationRecord = { ...input, status: 'PENDING', createdAt: now() };
          s.invitations.push(record);
          return record;
        },
        listPending: async (organizationId, at) =>
          s.invitations.filter(
            (i) =>
              i.organizationId === organizationId && i.status === 'PENDING' && i.expiresAt > at,
          ),
        findById: async (organizationId, id) =>
          s.invitations.find((i) => i.organizationId === organizationId && i.id === id) ?? null,
        findPendingByEmail: async (organizationId, email, at) =>
          s.invitations.find(
            (i) =>
              i.organizationId === organizationId &&
              i.email === email &&
              i.status === 'PENDING' &&
              i.expiresAt > at,
          ) ?? null,
        findByTokenHash: async (hash) => s.invitations.find((i) => i.tokenHash === hash) ?? null,
        setStatus: async (organizationId, id, status) => {
          s.invitations = s.invitations.map((i) =>
            i.organizationId === organizationId && i.id === id ? { ...i, status } : i,
          );
        },
      },
      audit: {
        append: async (entry: AuditEntry) => {
          s.audit.push({
            id: this.nextId(),
            organizationId: entry.organizationId,
            actorUserId: entry.actorUserId,
            action: entry.action,
            targetType: entry.targetType ?? null,
            targetId: entry.targetId ?? null,
            metadata: entry.metadata ?? {},
            requestId: entry.requestId ?? null,
            ip: entry.ip ?? null,
            createdAt: now(),
          });
        },
        list: async (organizationId, { cursor, limit }) =>
          s.audit
            .filter(
              (a) => a.organizationId === organizationId && (cursor === undefined || a.id < cursor),
            )
            .sort((a, b) => (a.id < b.id ? 1 : -1))
            .slice(0, limit),
      },
    };
  }

  unitOfWork(): UnitOfWork {
    return {
      run: async (scope, work) => {
        const snapshot = structuredClone(this.state);
        try {
          const result = await work(this.repositories(scope));
          if (!result.ok) this.state = snapshot;
          return result;
        } catch (error) {
          this.state = snapshot;
          throw error;
        }
      },
    };
  }

  deps(): ApplicationDeps {
    return {
      uow: this.unitOfWork(),
      mailer: {
        send: async (message) => {
          if (this.failMail) throw new Error('SMTP indisponible');
          this.sentMail.push(message);
        },
      },
      tokens: {
        generate: () => {
          const token = `token-${this.nextId()}`;
          return { token, hash: `hash:${token}` };
        },
        hash: (token) => `hash:${token}`,
      },
      clock: { now: () => this.now },
      ids: { next: () => this.nextId() },
      // Empreinte déterministe et lisible pour les tests (SHA-256 en exploitation).
      hasher: { sha256: (text) => `h${String(text.length)}:${text.slice(0, 24)}` },
      engines: this.engines,
      defaultTimeZone: 'Africa/Abidjan',
      appUrl: 'https://consulpro.test',
    };
  }
}

export function userContext(user: {
  id: string;
  email: string;
  name: string;
  platformAdmin?: boolean;
}): UserContext {
  return {
    actor: {
      userId: user.id,
      email: user.email,
      name: user.name,
      emailVerified: true,
      platformAdmin: user.platformAdmin === true,
    },
    meta: { requestId: 'req-test', ip: '127.0.0.1', userAgent: 'vitest' },
  };
}
