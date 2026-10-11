import { err, ok, type Result } from '@consulpro/calc-core';

import { roleRank, type OrgRole } from '../access/roles';
import type { DomainError } from '../errors';

export const DISCIPLINES = ['BTP', 'ELEC', 'PLUMBING', 'TOPO'] as const;
export type Discipline = (typeof DISCIPLINES)[number];

/** Rôles attribuables sur un projet : jamais Owner/Admin (ils accèdent à tous les projets). */
export const PROJECT_ROLES = ['ENGINEER', 'TECHNICIAN', 'COLLABORATOR', 'VIEWER'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

export const PROJECT_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export interface NewProject {
  readonly code: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly client?: string | undefined;
  readonly location?: string | undefined;
  readonly startDate?: string | undefined;
  readonly endDate?: string | undefined;
  readonly disciplines: readonly Discipline[];
}

const optional = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Valide et normalise un projet (création ou modification). */
export function validateProject(input: NewProject): Result<NewProject, DomainError> {
  const code = input.code.trim().toUpperCase();
  if (code.length < 2 || code.length > 24 || !PROJECT_CODE_PATTERN.test(code)) {
    return err({
      code: 'PROJECT_CODE_INVALID',
      message:
        'Le code doit comporter 2 à 24 caractères : majuscules, chiffres et tirets (ex. IMM-R3-2026).',
    });
  }
  const name = input.name.trim();
  if (name.length < 2 || name.length > 160) {
    return err({
      code: 'PROJECT_NAME_INVALID',
      message: 'Le nom doit comporter entre 2 et 160 caractères.',
    });
  }
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    return err({
      code: 'PROJECT_DATES_INVALID',
      message: 'La date de fin précède la date de début.',
    });
  }
  const disciplines = [...new Set(input.disciplines)];
  if (disciplines.length === 0) {
    return err({ code: 'PROJECT_DISCIPLINES_INVALID', message: 'Activez au moins un métier.' });
  }
  return ok({
    code,
    name,
    description: optional(input.description),
    client: optional(input.client),
    location: optional(input.location),
    startDate: input.startDate,
    endDate: input.endDate,
    disciplines,
  });
}

/**
 * Rôle effectif sur un projet (docs/architecture/12-securite-rbac.md §2.2) :
 * Owner et Admin accèdent à tous les projets avec leur rôle ; les autres doivent être
 * membres, et leur rôle effectif est le plus restrictif des deux. `null` = aucun accès.
 */
export function effectiveProjectRole(
  orgRole: OrgRole,
  projectRole: ProjectRole | null,
): OrgRole | null {
  if (orgRole === 'OWNER' || orgRole === 'ADMIN') return orgRole;
  if (projectRole === null) return null;
  return roleRank(projectRole) > roleRank(orgRole) ? projectRole : orgRole;
}

/** Rôle de projet correspondant à un rôle d'organisation (null pour Owner et Admin). */
export function asProjectRole(orgRole: OrgRole): ProjectRole | null {
  return orgRole === 'OWNER' || orgRole === 'ADMIN' ? null : orgRole;
}

/**
 * Affectation à un projet : inutile pour Owner et Admin (accès à tous les projets) ;
 * pour les autres, le rôle de projet ne peut pas dépasser le rôle d'organisation.
 */
export function checkProjectRole(
  orgRole: OrgRole,
  projectRole: ProjectRole,
): Result<void, DomainError> {
  if (orgRole === 'OWNER' || orgRole === 'ADMIN') {
    return err({
      code: 'PROJECT_MEMBER_NOT_NEEDED',
      message: 'Les propriétaires et administrateurs accèdent déjà à tous les projets.',
    });
  }
  if (roleRank(projectRole) < roleRank(orgRole)) {
    return err({
      code: 'PROJECT_ROLE_ABOVE_ORG_ROLE',
      message: 'Le rôle sur le projet ne peut pas dépasser le rôle dans l’organisation.',
    });
  }
  return ok(undefined);
}

/** Un projet archivé est en lecture seule. */
export function checkProjectWritable(status: ProjectStatus): Result<void, DomainError> {
  return status === 'ARCHIVED'
    ? err({ code: 'PROJECT_ARCHIVED', message: 'Ce projet est archivé : il est en lecture seule.' })
    : ok(undefined);
}

/** Types d'événements du fil d'activité d'un projet. */
export const ACTIVITY_TYPES = [
  'project.created',
  'project.updated',
  'project.archived',
  'project.unarchived',
  'project.member_added',
  'project.member_role_changed',
  'project.member_removed',
  'project.disciplines_changed',
  'project.standards_changed',
  'project.parameter_overridden',
  'project.parameter_override_removed',
  'study.created',
  'study.updated',
  'calculation.created',
  'calculation.computed',
  'calculation.validated',
  'calculation.verified',
  'calculation.rejected',
  'dataset.created',
  'dataset.revised',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
