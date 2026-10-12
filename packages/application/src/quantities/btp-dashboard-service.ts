import { ok, type Result } from '@consulpro/calc-core';
import {
  boqTotals,
  effectiveProjectRole,
  orderTree,
  type Currency,
  type ProjectRole,
  type Subtotal,
} from '@consulpro/domain';

import { guarded, type OrgContext } from '../context';
import type { AppError } from '../errors';
import type { ApplicationDeps } from '../ports';
import { isOrgManager } from '../projects/project-context';
import { contextOf } from '../scope';
import { asCurrency, syncPlanOf } from './boq-service';

/** Nombre de projets présentés (les plus récents d'abord). */
const MAX_PROJECTS = 50;

export interface BtpCalculationStats {
  readonly total: number;
  /** Rattachés à un nœud de l'avant-métré. */
  readonly assigned: number;
  readonly notComputed: number;
  readonly computed: number;
  readonly validated: number;
  readonly verified: number;
  readonly rejected: number;
  /** Résultats avec avertissements (paramètres « à vérifier », hypothèses…). */
  readonly withWarnings: number;
  readonly nonCompliant: number;
  readonly withoutResult: number;
  /** Reprennent une révision remplacée d'un autre calcul. */
  readonly obsolete: number;
}

export interface BtpBoqSummary {
  readonly id: string;
  readonly title: string;
  readonly currency: Currency;
  readonly total: Subtotal;
  /** Sous-totaux des lots (nœuds racines), dans l'ordre du DQE. */
  readonly lots: readonly {
    readonly id: string;
    readonly code: string;
    readonly title: string;
    readonly subtotal: Subtotal;
  }[];
  /** Le quantitatif ne reflète plus l'avant-métré ou les révisions courantes. */
  readonly outdated: boolean;
}

export interface BtpProjectSummary {
  readonly project: { readonly id: string; readonly code: string; readonly name: string };
  readonly calculations: BtpCalculationStats;
  readonly takeoff: { readonly lots: number; readonly nodes: number };
  readonly boqs: readonly BtpBoqSummary[];
}

export interface BtpDashboard {
  readonly projects: readonly BtpProjectSummary[];
  /** Projets BTP accessibles au-delà de ceux présentés. */
  readonly truncated: boolean;
  /** Moteurs BTP et cas de référence contre-vérifiés (06-strategie-de-tests §3.2). */
  readonly engines: {
    readonly total: number;
    readonly verified: number;
    readonly cases: number;
    readonly checkedCases: number;
  };
}

export function createBtpDashboardService({
  uow,
  engines,
}: Pick<ApplicationDeps, 'uow' | 'engines'>) {
  return {
    /** Avancement des métrés, totaux par lot et alertes des projets BTP accessibles. */
    async get(ctx: OrgContext): Promise<Result<BtpDashboard, AppError>> {
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
          const btp = projects.filter((p) => disciplines.get(p.id)?.includes('BTP'));
          const summaries: BtpProjectSummary[] = [];
          for (const project of btp.slice(0, MAX_PROJECTS)) {
            const studies = await repos.studies.list(orgId, project.id);
            const btpStudies = new Set(
              studies.filter((s) => s.discipline === 'BTP').map((s) => s.id),
            );
            const calculations = (await repos.calculations.listByProject(orgId, project.id)).filter(
              (c) => btpStudies.has(c.studyId),
            );
            const obsolete = await repos.calculations.obsolete(
              orgId,
              calculations.map((c) => c.id),
            );
            const assigned = new Set(
              (await repos.takeoff.listAssignments(orgId, project.id)).map((a) => a.calculationId),
            );
            const count = (predicate: (c: (typeof calculations)[number]) => boolean) =>
              calculations.filter(predicate).length;
            const nodes = orderTree(await repos.takeoff.listNodes(orgId, project.id));
            const lots = nodes.filter((n) => n.parentId === null);
            const boqs: BtpBoqSummary[] = [];
            for (const boq of await repos.boqs.list(orgId, project.id)) {
              const currency = asCurrency(boq.currency);
              const items = await repos.boqs.listItems(orgId, boq.id);
              const totals = boqTotals(nodes, items, currency);
              const plan = await syncPlanOf(repos, orgId, project.id, items);
              boqs.push({
                id: boq.id,
                title: boq.title,
                currency,
                total: totals.total,
                lots: lots.map((l) => ({
                  id: l.id,
                  code: l.code,
                  title: l.title,
                  subtotal: totals.byNode.get(l.id) ?? { amount: 0n, lines: 0, unpriced: 0 },
                })),
                outdated: plan.add.length + plan.update.length + plan.remove.length > 0,
              });
            }
            summaries.push({
              project: { id: project.id, code: project.code, name: project.name },
              calculations: {
                total: calculations.length,
                assigned: count((c) => assigned.has(c.id)),
                notComputed: count((c) => c.current === null),
                computed: count((c) => c.current?.workflowStatus === 'COMPUTED'),
                validated: count((c) => c.current?.workflowStatus === 'VALIDATED'),
                verified: count((c) => c.current?.workflowStatus === 'VERIFIED'),
                rejected: count((c) => c.current?.workflowStatus === 'REJECTED'),
                withWarnings: count((c) => c.current?.resultStatus === 'OK_WITH_WARNINGS'),
                nonCompliant: count((c) => c.current?.resultStatus === 'NON_COMPLIANT'),
                withoutResult: count(
                  (c) =>
                    c.current?.resultStatus === 'ERROR' || c.current?.resultStatus === 'INVALID',
                ),
                obsolete: obsolete.size,
              },
              takeoff: { lots: lots.length, nodes: nodes.length },
              boqs,
            });
          }
          const btpEngines = engines
            .list()
            .filter((e) => e.discipline === 'BTP' && e.referenceCases);
          return ok({
            projects: summaries,
            truncated: btp.length > MAX_PROJECTS,
            engines: {
              total: btpEngines.length,
              verified: btpEngines.filter(
                (e) =>
                  e.referenceCases &&
                  e.referenceCases.total > 0 &&
                  e.referenceCases.checked === e.referenceCases.total,
              ).length,
              cases: btpEngines.reduce((sum, e) => sum + (e.referenceCases?.total ?? 0), 0),
              checkedCases: btpEngines.reduce(
                (sum, e) => sum + (e.referenceCases?.checked ?? 0),
                0,
              ),
            },
          });
        }),
      );
    },
  };
}

export type BtpDashboardService = ReturnType<typeof createBtpDashboardService>;
