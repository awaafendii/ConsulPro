import { ok, type Result } from '@consulpro/calc-core';
import {
  effectiveProjectRole,
  type ProjectRole,
  type ResultStatus,
  type WorkflowStatus,
} from '@consulpro/domain';

import { guarded, type OrgContext } from '../context';
import type { AppError } from '../errors';
import type { ApplicationDeps } from '../ports';
import { isOrgManager } from '../projects/project-context';
import { contextOf } from '../scope';
import { engineVerification, type EngineVerification } from './engine-verification';

/** Nombre de projets présentés (les plus récents d'abord). */
const MAX_PROJECTS = 50;
/** Calculs non conformes listés par projet. */
const MAX_LISTED = 10;

export interface ElecPowerBalanceSummary {
  readonly calculationId: string;
  readonly title: string;
  readonly revisionNumber: number;
  readonly workflowStatus: WorkflowStatus;
  readonly resultStatus: ResultStatus;
  /** Sorties de la révision courante (kW, kVA, A) ; null sans résultat. */
  readonly absorbedPower: number | null;
  readonly apparentPower: number | null;
  readonly current: number | null;
  readonly obsolete: boolean;
}

export interface ElecProjectSummary {
  readonly project: { readonly id: string; readonly code: string; readonly name: string };
  readonly calculations: {
    readonly total: number;
    readonly notComputed: number;
    readonly verified: number;
    /** Calculés ou validés, pas encore vérifiés par un tiers. */
    readonly toVerify: number;
    readonly rejected: number;
    readonly nonCompliant: number;
    readonly obsolete: number;
  };
  readonly powerBalances: readonly ElecPowerBalanceSummary[];
  /** Départs et circuits non conformes (révision courante). */
  readonly nonCompliant: readonly {
    readonly calculationId: string;
    readonly title: string;
    readonly engineId: string;
    /** Intitulé du moteur (identifiant si le moteur n’est plus enregistré). */
    readonly engineTitle: string;
  }[];
}

export interface ElecDashboard {
  readonly projects: readonly ElecProjectSummary[];
  readonly truncated: boolean;
  readonly engines: EngineVerification;
}

const numberOf = (outputs: Readonly<Record<string, unknown>> | null, key: string) => {
  const value = outputs?.[key];
  return typeof value === 'number' ? value : null;
};

export function createElecDashboardService({
  uow,
  engines,
}: Pick<ApplicationDeps, 'uow' | 'engines'>) {
  return {
    /** Puissance des installations, départs non conformes et calculs à vérifier. */
    async get(ctx: OrgContext): Promise<Result<ElecDashboard, AppError>> {
      return guarded(ctx, 'project.read', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const orgId = ctx.organization.id;
          // Projets accessibles : la base filtre (RLS), l'application aussi (rôle effectif).
          const roles = isOrgManager(ctx.role)
            ? new Map<string, ProjectRole>()
            : await repos.projectMembers.rolesOfUser(orgId, ctx.actor.userId);
          const projects = (await repos.projects.list(orgId, 'ACTIVE')).filter(
            (p) => effectiveProjectRole(ctx.role, roles.get(p.id) ?? null) !== null,
          );
          const disciplines = await repos.projects.disciplines(projects.map((p) => p.id));
          const elec = projects.filter((p) => disciplines.get(p.id)?.includes('ELEC'));
          const summaries: ElecProjectSummary[] = [];
          for (const project of elec.slice(0, MAX_PROJECTS)) {
            const studies = await repos.studies.list(orgId, project.id);
            const elecStudies = new Set(
              studies.filter((s) => s.discipline === 'ELEC').map((s) => s.id),
            );
            const calculations = (await repos.calculations.listByProject(orgId, project.id)).filter(
              (c) => elecStudies.has(c.studyId),
            );
            const obsolete = await repos.calculations.obsolete(
              orgId,
              calculations.map((c) => c.id),
            );
            const balances = calculations.filter(
              (c) => c.engineId === 'elec.power-balance' && c.current,
            );
            const outputs = new Map(
              (
                await repos.boqs.revisionOutputs(
                  orgId,
                  balances.flatMap((c) => (c.current ? [c.current.id] : [])),
                )
              ).map((r) => [r.revisionId, r.outputs]),
            );
            const count = (predicate: (c: (typeof calculations)[number]) => boolean) =>
              calculations.filter(predicate).length;
            summaries.push({
              project: { id: project.id, code: project.code, name: project.name },
              calculations: {
                total: calculations.length,
                notComputed: count((c) => c.current === null),
                verified: count((c) => c.current?.workflowStatus === 'VERIFIED'),
                toVerify: count(
                  (c) =>
                    c.current?.workflowStatus === 'COMPUTED' ||
                    c.current?.workflowStatus === 'VALIDATED',
                ),
                rejected: count((c) => c.current?.workflowStatus === 'REJECTED'),
                nonCompliant: count((c) => c.current?.resultStatus === 'NON_COMPLIANT'),
                obsolete: obsolete.size,
              },
              powerBalances: balances.flatMap((c) =>
                c.current
                  ? [
                      {
                        calculationId: c.id,
                        title: c.title,
                        revisionNumber: c.current.number,
                        workflowStatus: c.current.workflowStatus,
                        resultStatus: c.current.resultStatus,
                        absorbedPower: numberOf(outputs.get(c.current.id) ?? null, 'absorbedPower'),
                        apparentPower: numberOf(outputs.get(c.current.id) ?? null, 'apparentPower'),
                        current: numberOf(outputs.get(c.current.id) ?? null, 'current'),
                        obsolete: obsolete.has(c.id),
                      },
                    ]
                  : [],
              ),
              nonCompliant: calculations
                .filter((c) => c.current?.resultStatus === 'NON_COMPLIANT')
                .slice(0, MAX_LISTED)
                .map((c) => ({
                  calculationId: c.id,
                  title: c.title,
                  engineId: c.engineId,
                  engineTitle: engines.get(c.engineId)?.title ?? c.engineId,
                })),
            });
          }
          return ok({
            projects: summaries,
            truncated: elec.length > MAX_PROJECTS,
            engines: engineVerification(engines, 'ELEC'),
          });
        }),
      );
    },
  };
}

export type ElecDashboardService = ReturnType<typeof createElecDashboardService>;
