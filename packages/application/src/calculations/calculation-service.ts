import { canonicalJson, err, ok, run, type AnyEngine, type Result } from '@consulpro/calc-core';
import type { CalculationView } from '@consulpro/contracts';
import {
  can,
  checkReview,
  compareRevisions,
  effectiveProjectRole,
  isObsolete,
  validateTitle,
  type Difference,
  type ReviewDecision,
  type ReviewType,
} from '@consulpro/domain';
import { resolveParameters, type ParameterOverrideInput } from '@consulpro/standards';

import type { OrgContext } from '../context';
import {
  appError,
  forbidden,
  fromDomain,
  notFound,
  reread,
  staleVersion,
  type AppError,
} from '../errors';
import type { ApplicationDeps, Repositories } from '../ports';
import type {
  CalculationListItem,
  DependencyEntry,
  DependencyRecord,
  ReviewRecord,
  RevisionRecord,
  RevisionSummary,
  StoredPresentation,
} from '../ports-calculations';
import {
  appendActivity,
  inProject,
  projectDisciplines,
  type ProjectContext,
} from '../projects/project-context';
import { auditBase } from '../scope';
import { toCalculationView } from './presenter';

const READ = { permission: 'project.read', write: false } as const;
const RUN = { permission: 'calculation.run', write: true } as const;

/** Entrée reprise de la sortie d'un autre calcul du projet. */
interface InputLink {
  readonly fromCalculation: string;
  readonly output: string;
}
const isLink = (value: unknown): value is InputLink =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as InputLink).fromCalculation === 'string' &&
  typeof (value as InputLink).output === 'string';

export interface CalculationSummary extends CalculationListItem {
  readonly engineTitle: string;
  readonly engineAvailable: boolean;
  readonly obsolete: boolean;
}

export interface RevisionView {
  readonly revision: RevisionRecord;
  readonly isCurrent: boolean;
  readonly view: CalculationView;
  readonly reviews: readonly ReviewRecord[];
  readonly dependencies: readonly (DependencyRecord & { readonly obsolete: boolean })[];
  readonly can: { readonly validate: boolean; readonly verify: boolean };
}

export interface LinkableOutput {
  readonly calculationId: string;
  readonly calculationTitle: string;
  readonly revisionNumber: number;
  readonly output: string;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
}

const linkError = (message: string) => appError('VALIDATION', 'INPUT_LINK_INVALID', message);

export function createCalculationService({
  uow,
  ids,
  hasher,
  engines,
}: Pick<ApplicationDeps, 'uow' | 'ids' | 'hasher' | 'engines'>) {
  /** Moteurs disponibles pour un métier. */
  const enginesFor = (discipline: string) =>
    engines.list().filter((e) => e.discipline === discipline);

  async function summaries(
    repos: Repositories,
    organizationId: string,
    items: readonly CalculationListItem[],
  ): Promise<CalculationSummary[]> {
    const obsolete = await repos.calculations.obsolete(
      organizationId,
      items.map((c) => c.id),
    );
    return items.map((c) => {
      const engine = engines.get(c.engineId);
      return {
        ...c,
        engineTitle: engine?.title ?? c.engineId,
        engineAvailable: engine !== undefined,
        obsolete: obsolete.has(c.id),
      };
    });
  }

  /**
   * Remplace les entrées liées par la sortie de la révision courante de leur calcul source
   * (même projet, résultat disponible). Renvoie les entrées résolues et les dépendances.
   */
  async function resolveLinks(
    repos: Repositories,
    pctx: ProjectContext,
    calculationId: string,
    rawInputs: Readonly<Record<string, unknown>>,
  ): Promise<
    Result<
      { inputs: Record<string, unknown>; links: Omit<DependencyEntry, 'revisionId'>[] },
      AppError
    >
  > {
    const orgId = pctx.organization.id;
    const inputs: Record<string, unknown> = {};
    const links: Omit<DependencyEntry, 'revisionId'>[] = [];
    for (const [key, value] of Object.entries(rawInputs)) {
      if (!isLink(value)) {
        inputs[key] = value;
        continue;
      }
      if (value.fromCalculation === calculationId) {
        return err(linkError('Un calcul ne peut pas reprendre sa propre sortie.'));
      }
      const source = await repos.calculations.findById(
        orgId,
        pctx.project.id,
        value.fromCalculation,
      );
      const revision =
        source?.currentRevisionId &&
        (await repos.revisions.findById(orgId, pctx.project.id, source.currentRevisionId));
      if (!source || !revision) {
        return err(linkError('Le calcul repris n’existe pas ou n’a pas encore de résultat.'));
      }
      const output = revision.presentation.outputs.find((o) => o.key === value.output);
      const number = revision.outputs?.[value.output];
      if (!output || typeof number !== 'number') {
        return err(linkError(`Sortie « ${value.output} » absente du calcul « ${source.title} ».`));
      }
      inputs[key] = { value: number, unit: output.unit };
      links.push({
        organizationId: orgId,
        projectId: pctx.project.id,
        input: key,
        sourceCalculationId: source.id,
        sourceRevisionId: revision.id,
        output: value.output,
      });
    }
    return ok({ inputs, links });
  }

  /** Paramètres du moteur : référentiels retenus pour le métier, surcharges org > projet. */
  async function parametersFor(
    repos: Repositories,
    pctx: ProjectContext,
    engine: AnyEngine,
    discipline: string,
  ) {
    const orgId = pctx.organization.id;
    const selected = (await repos.projectStandards.list(pctx.project.id)).filter(
      (v) => v.discipline === discipline,
    );
    const versions = [];
    for (const v of selected) {
      const detail = await repos.standards.findVersion(v.id);
      if (detail) {
        versions.push({
          ref: { standardVersionId: detail.id, code: detail.standard.code, version: detail.label },
          parameters: detail.parameters,
        });
      }
    }
    const overrides: ParameterOverrideInput[] = [
      ...(await repos.overrides.list(orgId, null)).map((o) => ({
        ...o,
        scope: 'ORGANIZATION' as const,
      })),
      ...(await repos.overrides.list(orgId, pctx.project.id)).map((o) => ({
        ...o,
        scope: 'PROJECT' as const,
      })),
    ];
    return resolveParameters(versions, overrides, engine.parameters);
  }

  async function revisionView(
    repos: Repositories,
    pctx: ProjectContext,
    revision: RevisionRecord,
  ): Promise<RevisionView> {
    const orgId = pctx.organization.id;
    const calculation = await repos.calculations.findById(
      orgId,
      pctx.project.id,
      revision.calculationId,
    );
    const isCurrent = calculation?.currentRevisionId === revision.id;
    const reviews = await repos.reviews.list(orgId, revision.id);
    const dependencies = (await repos.dependencies.listForRevision(orgId, revision.id)).map(
      (d) => ({ ...d, obsolete: isObsolete([d]) }),
    );
    const writable = pctx.project.status === 'ACTIVE';
    const author = revision.authorId === pctx.actor.userId;
    const review = (type: ReviewType) =>
      checkReview({
        revision: { ...revision, isCurrent },
        reviewerId: pctx.actor.userId,
        type,
        decision: 'APPROVED',
        comment: '',
      }).ok;
    return {
      revision,
      isCurrent,
      view: toCalculationView(revision),
      reviews,
      dependencies,
      can: {
        validate:
          writable &&
          can(pctx.projectRole, 'calculation.validate', { isOwnResource: author }) &&
          review('VALIDATION'),
        verify: writable && can(pctx.projectRole, 'calculation.verify') && review('VERIFICATION'),
      },
    };
  }

  /** Destinataires des demandes de vérification : vérificateurs possibles, sauf l'auteur. */
  async function verifiers(repos: Repositories, pctx: ProjectContext, authorId: string) {
    const orgId = pctx.organization.id;
    const projectRoles = new Map(
      (await repos.projectMembers.list(orgId, pctx.project.id)).map((m) => [m.userId, m.role]),
    );
    return (await repos.memberships.listMembers(orgId))
      .filter((m) => m.userId !== authorId)
      .filter((m) => {
        const role = effectiveProjectRole(m.role, projectRoles.get(m.userId) ?? null);
        return role !== null && can(role, 'calculation.verify');
      })
      .map((m) => m.userId);
  }

  async function review(
    ctx: OrgContext,
    projectId: string,
    revisionId: string,
    type: ReviewType,
    decision: ReviewDecision,
    comment: string | undefined,
  ): Promise<Result<RevisionView, AppError>> {
    const permission = type === 'VALIDATION' ? 'calculation.validate' : 'calculation.verify';
    return inProject(uow, ctx, projectId, { permission, write: true }, async (pctx, repos) => {
      const orgId = ctx.organization.id;
      const revision = await repos.revisions.findById(orgId, projectId, revisionId);
      if (!revision) return err(notFound('Révision'));
      const author = revision.authorId === ctx.actor.userId;
      if (!can(pctx.projectRole, permission, { isOwnResource: author })) return err(forbidden());
      const calculation = await repos.calculations.findById(
        orgId,
        projectId,
        revision.calculationId,
      );
      if (!calculation) return err(notFound('Calcul'));
      const decided = checkReview({
        revision: { ...revision, isCurrent: calculation.currentRevisionId === revision.id },
        reviewerId: ctx.actor.userId,
        type,
        decision,
        comment: comment ?? '',
      });
      if (!decided.ok) return err(fromDomain(decided.error));
      await repos.reviews.create({
        organizationId: orgId,
        projectId,
        revisionId,
        type,
        decision,
        comment: comment?.trim() ? comment.trim() : null,
        reviewerId: ctx.actor.userId,
      });

      const next = decided.value;
      const action =
        next === 'VALIDATED'
          ? 'calculation.validated'
          : next === 'VERIFIED'
            ? 'calculation.verified'
            : 'calculation.rejected';
      const summary = {
        title: calculation.title,
        number: revision.number,
        comment: comment ?? null,
      };
      await appendActivity(repos, pctx, action, summary, {
        type: 'calculation',
        id: calculation.id,
      });
      await repos.audit.append({
        ...auditBase(ctx, orgId),
        action,
        targetType: 'calculation_revision',
        targetId: revisionId,
        metadata: { ...summary, calculationId: calculation.id, projectId },
      });

      const link = `/${ctx.organization.slug}/projets/${projectId}/calculs/${calculation.id}`;
      const label = `${calculation.title} (révision ${String(revision.number)})`;
      if (next === 'VALIDATED') {
        const recipients = await verifiers(repos, pctx, revision.authorId);
        await repos.notifications.create(
          recipients.map((userId) => ({
            userId,
            organizationId: orgId,
            type: 'calculation.to_verify',
            title: `Calcul à vérifier : ${label}`,
            body: `${pctx.project.code} — validé par ${ctx.actor.name}.`,
            link,
          })),
        );
      } else {
        await repos.notifications.create([
          {
            userId: revision.authorId,
            organizationId: orgId,
            type: next === 'VERIFIED' ? 'calculation.verified' : 'calculation.rejected',
            title: `${next === 'VERIFIED' ? 'Calcul vérifié' : 'Calcul rejeté'} : ${label}`,
            ...(comment?.trim() ? { body: comment.trim() } : {}),
            link,
          },
        ]);
      }
      const saved = reread(
        await repos.revisions.findById(orgId, projectId, revisionId),
        'Révision',
      );
      return ok(await revisionView(repos, pctx, saved));
    });
  }

  return {
    /** Moteurs proposés pour les métiers activés du projet. */
    async engines(ctx: OrgContext, projectId: string): Promise<Result<AnyEngine[], AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        return ok((await projectDisciplines(repos, projectId)).flatMap(enginesFor));
      });
    },

    async listByStudy(
      ctx: OrgContext,
      projectId: string,
      studyId: string,
    ): Promise<Result<CalculationSummary[], AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const study = await repos.studies.findById(ctx.organization.id, projectId, studyId);
        if (!study) return err(notFound('Étude'));
        const items = await repos.calculations.listByStudy(ctx.organization.id, studyId);
        return ok(await summaries(repos, ctx.organization.id, items));
      });
    },

    async get(
      ctx: OrgContext,
      projectId: string,
      calculationId: string,
    ): Promise<Result<CalculationSummary, AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const items = await repos.calculations.listByProject(ctx.organization.id, projectId);
        const item = items.find((c) => c.id === calculationId);
        if (!item) return err(notFound('Calcul'));
        const [summary] = await summaries(repos, ctx.organization.id, [item]);
        return ok(reread(summary, 'Calcul'));
      });
    },

    async create(
      ctx: OrgContext,
      projectId: string,
      studyId: string,
      input: { title: string; engineId: string },
    ): Promise<Result<CalculationSummary, AppError>> {
      return inProject(uow, ctx, projectId, RUN, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const study = await repos.studies.findById(orgId, projectId, studyId);
        if (!study) return err(notFound('Étude'));
        const title = validateTitle(input.title, 'CALCULATION_TITLE_INVALID');
        if (!title.ok) return err(fromDomain(title.error));
        const engine = engines.get(input.engineId);
        if (engine?.discipline !== study.discipline) {
          return err(
            appError(
              'VALIDATION',
              'ENGINE_UNAVAILABLE',
              'Ce moteur de calcul n’est pas disponible pour le métier de l’étude.',
            ),
          );
        }
        const id = ids.next();
        await repos.calculations.create({
          id,
          organizationId: orgId,
          projectId,
          studyId,
          engineId: engine.id,
          title: title.value,
          createdById: ctx.actor.userId,
        });
        await appendActivity(
          repos,
          pctx,
          'calculation.created',
          { title: title.value, engine: engine.title, study: study.title },
          { type: 'calculation', id },
        );
        await repos.audit.append({
          ...auditBase(ctx, orgId),
          action: 'calculation.created',
          targetType: 'calculation',
          targetId: id,
          metadata: { projectId, studyId, engineId: engine.id, title: title.value },
        });
        const items = await repos.calculations.listByStudy(orgId, studyId);
        const created = reread(
          items.find((c) => c.id === id),
          'Calcul',
        );
        const [summary] = await summaries(repos, orgId, [created]);
        return ok(reread(summary, 'Calcul'));
      });
    },

    /**
     * Exécute le moteur côté serveur et enregistre une révision immuable (pipeline HISTORY) :
     * entrées liées résolues, paramètres résolus et figés (snapshot + empreinte SHA-256),
     * audit, révision courante mise à jour. Des entrées refusées ne créent pas de révision.
     */
    async run(
      ctx: OrgContext,
      projectId: string,
      calculationId: string,
      rawInputs: Readonly<Record<string, unknown>>,
    ): Promise<Result<RevisionView, AppError>> {
      return inProject(uow, ctx, projectId, RUN, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const calculation = await repos.calculations.findById(orgId, projectId, calculationId);
        if (!calculation) return err(notFound('Calcul'));
        const study = await repos.studies.findById(orgId, projectId, calculation.studyId);
        if (!study) return err(notFound('Étude'));
        const engine = engines.get(calculation.engineId);
        if (!engine) {
          return err(
            appError(
              'POLICY_VIOLATION',
              'ENGINE_UNAVAILABLE',
              'Le moteur de ce calcul n’est pas disponible sur ce serveur.',
            ),
          );
        }

        const linked = await resolveLinks(repos, pctx, calculationId, rawInputs);
        if (!linked.ok) return linked;
        const params = await parametersFor(repos, pctx, engine, study.discipline);
        if (!params.ok) {
          return err(
            appError(
              'POLICY_VIOLATION',
              'PARAMETERS_UNRESOLVABLE',
              'Les paramètres du calcul ne peuvent pas être déterminés à partir des référentiels retenus.',
              params.error.map((e) => ({
                path: `parameters.${e.key}`,
                code: e.code,
                message: e.message,
              })),
            ),
          );
        }

        const result = run(engine, linked.value.inputs, params.value);
        if (result.status === 'INVALID') {
          return err(
            appError(
              'VALIDATION',
              'CALCULATION_INPUT_INVALID',
              'Entrées ou paramètres refusés : aucune révision n’a été enregistrée.',
              result.errors,
            ),
          );
        }

        const presentation: StoredPresentation = {
          ...engine.presentation,
          title: engine.title,
          referenceCases: engine.referenceCases ?? { total: 0, checked: 0 },
          parameters: engine.parameters.map((p) => ({ key: p.key, label: p.description })),
        };
        const id = ids.next();
        const number = await repos.revisions.nextNumber(calculationId);
        const parameterSnapshotHash = hasher.sha256(canonicalJson(result.parameters));
        const created = await repos.revisions.create({
          id,
          organizationId: orgId,
          projectId,
          calculationId,
          number,
          engineId: engine.id,
          engineVersion: engine.version,
          standards: result.standards,
          parameterSnapshot: result.parameters,
          parameterSnapshotHash,
          rawInputs,
          inputs: result.inputs,
          outputs: result.outputs as Record<string, unknown> | null,
          checks: result.checks,
          warnings: result.warnings,
          hypotheses: result.hypotheses,
          trace: result.trace,
          errors: result.errors,
          failure: result.failure,
          presentation,
          resultStatus: result.status,
          authorId: ctx.actor.userId,
        });
        if (!created.ok) return err(staleVersion());
        await repos.dependencies.create(linked.value.links.map((l) => ({ ...l, revisionId: id })));
        if (
          !(await repos.calculations.setCurrentRevision(
            orgId,
            calculationId,
            id,
            calculation.version,
          ))
        ) {
          return err(staleVersion());
        }
        const summary = { title: calculation.title, number, status: result.status };
        await appendActivity(repos, pctx, 'calculation.computed', summary, {
          type: 'calculation',
          id: calculationId,
        });
        await repos.audit.append({
          ...auditBase(ctx, orgId),
          action: 'calculation.revision_created',
          targetType: 'calculation_revision',
          targetId: id,
          metadata: {
            ...summary,
            calculationId,
            projectId,
            engine: `${engine.id}@${engine.version}`,
            parameterSnapshotHash,
          },
        });
        const saved = reread(await repos.revisions.findById(orgId, projectId, id), 'Révision');
        return ok(await revisionView(repos, pctx, saved));
      });
    },

    async revisions(
      ctx: OrgContext,
      projectId: string,
      calculationId: string,
    ): Promise<Result<RevisionSummary[], AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const calculation = await repos.calculations.findById(
          ctx.organization.id,
          projectId,
          calculationId,
        );
        if (!calculation) return err(notFound('Calcul'));
        return ok(await repos.revisions.list(ctx.organization.id, calculationId));
      });
    },

    async revision(
      ctx: OrgContext,
      projectId: string,
      revisionId: string,
    ): Promise<Result<RevisionView, AppError>> {
      return inProject(uow, ctx, projectId, READ, async (pctx, repos) => {
        const revision = await repos.revisions.findById(ctx.organization.id, projectId, revisionId);
        return revision ? ok(await revisionView(repos, pctx, revision)) : err(notFound('Révision'));
      });
    },

    validate(ctx: OrgContext, projectId: string, revisionId: string, comment?: string) {
      return review(ctx, projectId, revisionId, 'VALIDATION', 'APPROVED', comment);
    },

    verify(
      ctx: OrgContext,
      projectId: string,
      revisionId: string,
      decision: ReviewDecision,
      comment?: string,
    ) {
      return review(ctx, projectId, revisionId, 'VERIFICATION', decision, comment);
    },

    /** Différences entre deux révisions d'un même calcul. */
    async compare(
      ctx: OrgContext,
      projectId: string,
      beforeId: string,
      afterId: string,
    ): Promise<
      Result<
        { before: RevisionSummary; after: RevisionSummary; differences: Difference[] },
        AppError
      >
    > {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const before = await repos.revisions.findById(ctx.organization.id, projectId, beforeId);
        const after = await repos.revisions.findById(ctx.organization.id, projectId, afterId);
        if (!before || !after) return err(notFound('Révision'));
        if (before.calculationId !== after.calculationId) {
          return err(
            appError(
              'VALIDATION',
              'REVISIONS_UNRELATED',
              'Seules deux révisions d’un même calcul se comparent.',
            ),
          );
        }
        const comparable = (r: RevisionRecord) => ({
          inputs: r.rawInputs,
          parameters: r.parameterSnapshot,
          outputs: r.outputs,
          checks: r.checks,
          resultStatus: r.resultStatus,
          engineVersion: r.engineVersion,
        });
        return ok({
          before,
          after,
          differences: compareRevisions(comparable(before), comparable(after)),
        });
      });
    },

    /** Sorties numériques des révisions courantes des autres calculs (liaison d'entrées). */
    async linkableOutputs(
      ctx: OrgContext,
      projectId: string,
      calculationId: string,
    ): Promise<Result<LinkableOutput[], AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const orgId = ctx.organization.id;
        const items = await repos.calculations.listByProject(orgId, projectId);
        const out: LinkableOutput[] = [];
        for (const item of items) {
          if (item.id === calculationId || !item.currentRevisionId) continue;
          const revision = await repos.revisions.findById(orgId, projectId, item.currentRevisionId);
          if (!revision?.outputs) continue;
          for (const o of revision.presentation.outputs) {
            const value = revision.outputs[o.key];
            if (typeof value !== 'number') continue;
            out.push({
              calculationId: item.id,
              calculationTitle: item.title,
              revisionNumber: revision.number,
              output: o.key,
              label: o.label,
              value,
              unit: o.unit,
            });
          }
        }
        return ok(out);
      });
    },
  };
}

export type CalculationService = ReturnType<typeof createCalculationService>;
