import type { EngineRegistry } from '@consulpro/calc-core';
import {
  effectiveProjectRole,
  type Discipline,
  type ProjectRole,
  type ResultStatus,
  type WorkflowStatus,
} from '@consulpro/domain';

import type { OrgContext } from '../context';
import type { Repositories } from '../ports';
import type { CalculationListItem } from '../ports-calculations';
import { isOrgManager } from '../projects/project-context';

/*
 * Socle commun des tableaux de bord métier (Électricité, Plomberie) : projets actifs
 * accessibles où le métier est activé, calculs de ses études, décomptes et alertes.
 */

/** Nombre de projets présentés (les plus récents d'abord). */
export const MAX_PROJECTS = 50;
/** Calculs non conformes listés par projet. */
const MAX_LISTED = 10;

export interface CalculationStats {
  readonly total: number;
  readonly notComputed: number;
  readonly verified: number;
  /** Calculés ou validés, pas encore vérifiés par un tiers. */
  readonly toVerify: number;
  readonly rejected: number;
  readonly nonCompliant: number;
  readonly obsolete: number;
}

export interface NonCompliantCalculation {
  readonly calculationId: string;
  readonly title: string;
  readonly engineId: string;
  /** Intitulé du moteur (identifiant si le moteur n'est plus enregistré). */
  readonly engineTitle: string;
}

/** Calcul phare d'un tableau de bord (bilan de puissance, débit de pointe…). */
export interface HighlightedCalculation {
  readonly calculationId: string;
  readonly title: string;
  readonly engineId: string;
  readonly revisionNumber: number;
  readonly workflowStatus: WorkflowStatus;
  readonly resultStatus: ResultStatus;
  /** Sorties de la révision courante, dans l'unité de présentation du moteur ; null sans valeur. */
  readonly outputs: Readonly<Record<string, number | null>>;
  readonly obsolete: boolean;
}

export interface DisciplineProject {
  readonly project: { readonly id: string; readonly code: string; readonly name: string };
  readonly calculations: CalculationStats;
  readonly highlights: readonly HighlightedCalculation[];
  readonly nonCompliant: readonly NonCompliantCalculation[];
}

const numberOf = (outputs: Readonly<Record<string, unknown>> | null, key: string) => {
  const value = outputs?.[key];
  return typeof value === 'number' ? value : null;
};

/**
 * Projets du métier accessibles à l'utilisateur (la base filtre par RLS, l'application par
 * rôle effectif), avec leurs décomptes et les sorties des calculs phares.
 */
export async function disciplineProjects(
  repos: Repositories,
  ctx: OrgContext,
  engines: EngineRegistry,
  discipline: Discipline,
  highlight: { readonly engines: readonly string[]; readonly outputs: readonly string[] },
): Promise<{ projects: DisciplineProject[]; truncated: boolean }> {
  const orgId = ctx.organization.id;
  const roles = isOrgManager(ctx.role)
    ? new Map<string, ProjectRole>()
    : await repos.projectMembers.rolesOfUser(orgId, ctx.actor.userId);
  const projects = (await repos.projects.list(orgId, 'ACTIVE')).filter(
    (p) => effectiveProjectRole(ctx.role, roles.get(p.id) ?? null) !== null,
  );
  const disciplines = await repos.projects.disciplines(projects.map((p) => p.id));
  const selected = projects.filter((p) => disciplines.get(p.id)?.includes(discipline));
  const summaries: DisciplineProject[] = [];
  for (const project of selected.slice(0, MAX_PROJECTS)) {
    const studies = await repos.studies.list(orgId, project.id);
    const ownStudies = new Set(studies.filter((s) => s.discipline === discipline).map((s) => s.id));
    const calculations = (await repos.calculations.listByProject(orgId, project.id)).filter((c) =>
      ownStudies.has(c.studyId),
    );
    const obsolete = await repos.calculations.obsolete(
      orgId,
      calculations.map((c) => c.id),
    );
    const highlighted = calculations.filter(
      (c) => highlight.engines.includes(c.engineId) && c.current,
    );
    const outputs = new Map(
      (
        await repos.boqs.revisionOutputs(
          orgId,
          highlighted.flatMap((c) => (c.current ? [c.current.id] : [])),
        )
      ).map((r) => [r.revisionId, r.outputs]),
    );
    const count = (predicate: (c: CalculationListItem) => boolean) =>
      calculations.filter(predicate).length;
    summaries.push({
      project: { id: project.id, code: project.code, name: project.name },
      calculations: {
        total: calculations.length,
        notComputed: count((c) => c.current === null),
        verified: count((c) => c.current?.workflowStatus === 'VERIFIED'),
        toVerify: count(
          (c) =>
            c.current?.workflowStatus === 'COMPUTED' || c.current?.workflowStatus === 'VALIDATED',
        ),
        rejected: count((c) => c.current?.workflowStatus === 'REJECTED'),
        nonCompliant: count((c) => c.current?.resultStatus === 'NON_COMPLIANT'),
        obsolete: obsolete.size,
      },
      highlights: highlighted.flatMap((c) =>
        c.current
          ? [
              {
                calculationId: c.id,
                title: c.title,
                engineId: c.engineId,
                revisionNumber: c.current.number,
                workflowStatus: c.current.workflowStatus,
                resultStatus: c.current.resultStatus,
                outputs: Object.fromEntries(
                  highlight.outputs.map((key) => [
                    key,
                    numberOf(outputs.get(c.current?.id ?? '') ?? null, key),
                  ]),
                ),
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
  return { projects: summaries, truncated: selected.length > MAX_PROJECTS };
}
