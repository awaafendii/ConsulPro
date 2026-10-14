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
  readonly calculations: CalculationStats;
  readonly powerBalances: readonly ElecPowerBalanceSummary[];
  /** Départs et circuits non conformes (révision courante). */
  readonly nonCompliant: readonly NonCompliantCalculation[];
}

export interface ElecDashboard {
  readonly projects: readonly ElecProjectSummary[];
  readonly truncated: boolean;
  readonly engines: EngineVerification;
}

export function createElecDashboardService({
  uow,
  engines,
}: Pick<ApplicationDeps, 'uow' | 'engines'>) {
  return {
    /** Puissance des installations, départs non conformes et calculs à vérifier. */
    async get(ctx: OrgContext): Promise<Result<ElecDashboard, AppError>> {
      return guarded(ctx, 'project.read', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const { projects, truncated } = await disciplineProjects(repos, ctx, engines, 'ELEC', {
            engines: ['elec.power-balance'],
            outputs: ['absorbedPower', 'apparentPower', 'current'],
          });
          return ok({
            projects: projects.map((p) => ({
              project: p.project,
              calculations: p.calculations,
              powerBalances: p.highlights.map((h) => ({
                calculationId: h.calculationId,
                title: h.title,
                revisionNumber: h.revisionNumber,
                workflowStatus: h.workflowStatus,
                resultStatus: h.resultStatus,
                absorbedPower: h.outputs.absorbedPower ?? null,
                apparentPower: h.outputs.apparentPower ?? null,
                current: h.outputs.current ?? null,
                obsolete: h.obsolete,
              })),
              nonCompliant: p.nonCompliant,
            })),
            truncated,
            engines: engineVerification(engines, 'ELEC'),
          });
        }),
      );
    },
  };
}

export type ElecDashboardService = ReturnType<typeof createElecDashboardService>;
