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

/** Cheminement (polygonale) et sa fermeture (révision courante). */
export interface TopographyTraverseSummary {
  readonly calculationId: string;
  readonly title: string;
  readonly engineId: string;
  readonly revisionNumber: number;
  readonly workflowStatus: WorkflowStatus;
  readonly resultStatus: ResultStatus;
  /** Périmètre ΣD (m) ; null sans résultat. */
  readonly perimeter: number | null;
  /** Fermeture planimétrique f_L (m) ; null (polygonale ouverte ou sans résultat). */
  readonly closure: number | null;
  /** Précision relative f_L / ΣD ; null (polygonale ouverte ou sans résultat). */
  readonly relativePrecision: number | null;
  readonly obsolete: boolean;
}

export interface TopographyProjectSummary {
  readonly project: { readonly id: string; readonly code: string; readonly name: string };
  readonly calculations: CalculationStats;
  readonly traverses: readonly TopographyTraverseSummary[];
  /** Cheminements et calculs non conformes (fermeture hors tolérance, révision courante). */
  readonly nonCompliant: readonly NonCompliantCalculation[];
}

export interface TopographyDashboard {
  readonly projects: readonly TopographyProjectSummary[];
  readonly truncated: boolean;
  readonly engines: EngineVerification;
}

export function createTopographyDashboardService({
  uow,
  engines,
}: Pick<ApplicationDeps, 'uow' | 'engines'>) {
  return {
    /** Jeux de points, cheminements et fermetures hors tolérance. */
    async get(ctx: OrgContext): Promise<Result<TopographyDashboard, AppError>> {
      return guarded(ctx, 'project.read', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const { projects, truncated } = await disciplineProjects(repos, ctx, engines, 'TOPO', {
            engines: ['topo.traverse'],
            outputs: ['perimeter', 'fL', 'relativePrecision'],
          });
          return ok({
            projects: projects.map((p) => ({
              project: p.project,
              calculations: p.calculations,
              traverses: p.highlights.map((h) => ({
                calculationId: h.calculationId,
                title: h.title,
                engineId: h.engineId,
                revisionNumber: h.revisionNumber,
                workflowStatus: h.workflowStatus,
                resultStatus: h.resultStatus,
                perimeter: h.outputs.perimeter ?? null,
                closure: h.outputs.fL ?? null,
                relativePrecision: h.outputs.relativePrecision ?? null,
                obsolete: h.obsolete,
              })),
              nonCompliant: p.nonCompliant,
            })),
            truncated,
            engines: engineVerification(engines, 'TOPO'),
          });
        }),
      );
    },
  };
}

export type TopographyDashboardService = ReturnType<typeof createTopographyDashboardService>;
