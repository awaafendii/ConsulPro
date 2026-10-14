import { ok, type Result } from '@consulpro/calc-core';
import type { ResultStatus, WorkflowStatus } from '@consulpro/domain';

import { guarded, type OrgContext } from '../context';
import type { AppError } from '../errors';
import type { ApplicationDeps } from '../ports';
import { contextOf } from '../scope';
import {
  disciplineProjects,
  type CalculationStats,
  type NonCompliantCalculation,
} from './discipline-dashboard';
import { engineVerification, type EngineVerification } from './engine-verification';

/** Débit de pointe d'un groupe d'appareils ou d'un réseau (révision courante). */
export interface PlumbingFlowSummary {
  readonly calculationId: string;
  readonly title: string;
  readonly engineId: string;
  readonly revisionNumber: number;
  readonly workflowStatus: WorkflowStatus;
  readonly resultStatus: ResultStatus;
  readonly fixtureCount: number | null;
  /** Débit probable (L/s). */
  readonly probableFlow: number | null;
  /** Réseau : pression disponible au point le plus défavorisé (kPa) ; null sinon. */
  readonly minPressure: number | null;
  readonly obsolete: boolean;
}

export interface PlumbingProjectSummary {
  readonly project: { readonly id: string; readonly code: string; readonly name: string };
  readonly calculations: CalculationStats;
  readonly flows: readonly PlumbingFlowSummary[];
  /** Réseaux et calculs non conformes (révision courante). */
  readonly nonCompliant: readonly NonCompliantCalculation[];
}

export interface PlumbingDashboard {
  readonly projects: readonly PlumbingProjectSummary[];
  readonly truncated: boolean;
  readonly engines: EngineVerification;
}

export function createPlumbingDashboardService({
  uow,
  engines,
}: Pick<ApplicationDeps, 'uow' | 'engines'>) {
  return {
    /** Débits de pointe, réseaux non conformes et calculs à vérifier. */
    async get(ctx: OrgContext): Promise<Result<PlumbingDashboard, AppError>> {
      return guarded(ctx, 'project.read', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const { projects, truncated } = await disciplineProjects(
            repos,
            ctx,
            engines,
            'PLUMBING',
            {
              engines: ['plumbing.flow-rates', 'plumbing.supply-network'],
              outputs: ['fixtureCount', 'probableFlow', 'minPressure'],
            },
          );
          return ok({
            projects: projects.map((p) => ({
              project: p.project,
              calculations: p.calculations,
              flows: p.highlights.map((h) => ({
                calculationId: h.calculationId,
                title: h.title,
                engineId: h.engineId,
                revisionNumber: h.revisionNumber,
                workflowStatus: h.workflowStatus,
                resultStatus: h.resultStatus,
                fixtureCount: h.outputs.fixtureCount ?? null,
                probableFlow: h.outputs.probableFlow ?? null,
                minPressure: h.outputs.minPressure ?? null,
                obsolete: h.obsolete,
              })),
              nonCompliant: p.nonCompliant,
            })),
            truncated,
            engines: engineVerification(engines, 'PLUMBING'),
          });
        }),
      );
    },
  };
}

export type PlumbingDashboardService = ReturnType<typeof createPlumbingDashboardService>;
