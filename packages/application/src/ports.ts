import type { EngineRegistry, Result } from '@consulpro/calc-core';
import type { AuditAction, OrgRole } from '@consulpro/domain';

import type { CalculationRepositories } from './ports-calculations';
import type { QuantityRepositories } from './ports-quantities';
import type { ProjectRepositories } from './ports-projects';

/*
 * Ports : interfaces implémentées par l'infrastructure (ADR-0002).
 * Chaque méthode de repository reçoit explicitement l'organisation visée ;
 * la base applique en plus ses politiques RLS (ADR-0006).
 */

export interface OrganizationRecord {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly country: string | null;
  readonly currency: string;
  readonly createdAt: Date;
}

export interface MyOrganization extends OrganizationRecord {
  readonly role: OrgRole;
  readonly membershipId: string;
}

export interface MembershipRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly role: OrgRole;
  /** Verrouillage optimiste. */
  readonly version: number;
  readonly createdAt: Date;
}

export interface MemberView extends MembershipRecord {
  readonly name: string;
  readonly email: string;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

export interface InvitationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly email: string;
  readonly role: OrgRole;
  readonly tokenHash: string;
  readonly status: InvitationStatus;
  readonly expiresAt: Date;
  readonly invitedById: string;
  readonly createdAt: Date;
}

export interface AuditEntry {
  readonly organizationId: string | null;
  readonly actorUserId: string | null;
  readonly action: AuditAction;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly requestId?: string | null;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface AuditRecord {
  readonly id: string;
  readonly organizationId: string | null;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly requestId: string | null;
  readonly ip: string | null;
  readonly createdAt: Date;
}

export interface Repositories
  extends ProjectRepositories, CalculationRepositories, QuantityRepositories {
  readonly organizations: {
    create(input: {
      id: string;
      name: string;
      slug: string;
    }): Promise<Result<OrganizationRecord, 'SLUG_TAKEN'>>;
    findById(id: string): Promise<OrganizationRecord | null>;
  };
  readonly memberships: {
    listOrganizationsOfUser(userId: string): Promise<MyOrganization[]>;
    findOrganizationOfUserBySlug(userId: string, slug: string): Promise<MyOrganization | null>;
    listMembers(organizationId: string): Promise<MemberView[]>;
    findById(organizationId: string, membershipId: string): Promise<MembershipRecord | null>;
    findByUserId(organizationId: string, userId: string): Promise<MembershipRecord | null>;
    findByEmail(organizationId: string, email: string): Promise<MembershipRecord | null>;
    create(input: {
      id: string;
      organizationId: string;
      userId: string;
      role: OrgRole;
    }): Promise<MembershipRecord>;
    /** `false` si la version attendue ne correspond plus (modification concurrente). */
    updateRole(
      organizationId: string,
      membershipId: string,
      role: OrgRole,
      expectedVersion: number,
    ): Promise<boolean>;
    delete(organizationId: string, membershipId: string, expectedVersion: number): Promise<boolean>;
  };
  readonly invitations: {
    create(input: Omit<InvitationRecord, 'createdAt' | 'status'>): Promise<InvitationRecord>;
    listPending(organizationId: string, now: Date): Promise<InvitationRecord[]>;
    findById(organizationId: string, id: string): Promise<InvitationRecord | null>;
    findPendingByEmail(
      organizationId: string,
      email: string,
      now: Date,
    ): Promise<InvitationRecord | null>;
    /** Recherche par jeton haché, limitée aux invitations adressées à l'utilisateur courant. */
    findByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
    setStatus(
      organizationId: string,
      id: string,
      status: InvitationStatus,
      at: Date,
    ): Promise<void>;
  };
  readonly audit: {
    append(entry: AuditEntry): Promise<void>;
    list(
      organizationId: string,
      page: { cursor?: string | undefined; limit: number },
    ): Promise<AuditRecord[]>;
  };
}

/** Portée de la transaction : alimente l'isolation en base (RLS). */
export interface DbScope {
  readonly organizationId: string | null;
  readonly userId: string | null;
  readonly userEmail: string | null;
}

/**
 * Unité de travail transactionnelle. Si `work` renvoie une erreur (`ok: false`)
 * ou lève une exception, la transaction est annulée.
 */
export interface UnitOfWork {
  run<T, E>(
    scope: DbScope,
    work: (repos: Repositories) => Promise<Result<T, E>>,
  ): Promise<Result<T, E>>;
}

export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

export interface TokenService {
  /** Jeton aléatoire à transmettre, et son empreinte à stocker. */
  generate(): { token: string; hash: string };
  hash(token: string): string;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export interface Hasher {
  /** Empreinte SHA-256 (hexadécimal) d'un texte UTF-8. */
  sha256(text: string): string;
}

export interface ApplicationDeps {
  readonly uow: UnitOfWork;
  readonly mailer: Mailer;
  readonly tokens: TokenService;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly hasher: Hasher;
  /** Moteurs de calcul disponibles sur ce serveur. */
  readonly engines: EngineRegistry;
  /** Fuseau horaire par défaut de l'application (IANA). */
  readonly defaultTimeZone: string;
  /** URL publique de l'application (liens dans les e-mails). */
  readonly appUrl: string;
}
