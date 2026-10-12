import { err, ok, type Result } from '@consulpro/calc-core';
import {
  checkNesting,
  orderTree,
  TAKEOFF_MAX_NODES,
  validateNodeCode,
  validateTitle,
  type TakeoffNodeKind,
} from '@consulpro/domain';

import type { OrgContext } from '../context';
import { appError, fromDomain, notFound, reread, staleVersion, type AppError } from '../errors';
import type { ApplicationDeps, Repositories } from '../ports';
import type { RevisionSummary } from '../ports-calculations';
import type { TakeoffNodeRecord } from '../ports-quantities';
import { appendActivity, inProject, projectDisciplines } from '../projects/project-context';

const READ = { permission: 'project.read', write: false } as const;
const MANAGE = { permission: 'boq.manage', write: true } as const;

/** Calcul BTP du projet et son rattachement éventuel à l'avant-métré. */
export interface TakeoffCalculation {
  readonly id: string;
  readonly title: string;
  readonly engineId: string;
  readonly studyId: string;
  readonly studyTitle: string;
  readonly nodeId: string | null;
  readonly current: RevisionSummary | null;
  /** Reprend une révision remplacée d'un autre calcul : à recalculer. */
  readonly obsolete: boolean;
}

export interface TakeoffView {
  /** Nœuds dans l'ordre du DQE (parcours en profondeur, ordre naturel des codes). */
  readonly nodes: readonly (TakeoffNodeRecord & { readonly depth: number })[];
  readonly calculations: readonly TakeoffCalculation[];
}

const KIND_LABEL: Readonly<Record<TakeoffNodeKind, string>> = {
  LOT: 'lot',
  LEVEL: 'niveau',
  ELEMENT: 'ouvrage',
};

const codeTaken = () =>
  appError(
    'CONFLICT',
    'TAKEOFF_CODE_TAKEN',
    'Ce code est déjà utilisé à ce niveau de l’avant-métré.',
  );

/** L'avant-métré est propre au BTP : le métier doit être activé sur le projet. */
async function requireBtp(repos: Repositories, projectId: string): Promise<AppError | null> {
  return (await projectDisciplines(repos, projectId)).includes('BTP')
    ? null
    : appError(
        'POLICY_VIOLATION',
        'BTP_DISCIPLINE_INACTIVE',
        'Le métier BTP n’est pas activé sur ce projet.',
      );
}

export function createTakeoffService({ uow, ids }: Pick<ApplicationDeps, 'uow' | 'ids'>) {
  return {
    /** Structure de l'avant-métré et calculs BTP du projet (rattachés ou non). */
    async get(ctx: OrgContext, projectId: string): Promise<Result<TakeoffView, AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const orgId = ctx.organization.id;
        // Requêtes successives : une transaction n'a qu'une connexion.
        const nodes = await repos.takeoff.listNodes(orgId, projectId);
        const assignments = await repos.takeoff.listAssignments(orgId, projectId);
        const studies = await repos.studies.list(orgId, projectId);
        const calculations = await repos.calculations.listByProject(orgId, projectId);
        const btpStudies = new Map(
          studies.filter((s) => s.discipline === 'BTP').map((s) => [s.id, s.title]),
        );
        const nodeOf = new Map(assignments.map((a) => [a.calculationId, a.nodeId]));
        const btp = calculations.filter((c) => btpStudies.has(c.studyId));
        const obsolete = await repos.calculations.obsolete(
          orgId,
          btp.map((c) => c.id),
        );
        return ok({
          nodes: orderTree(nodes),
          calculations: btp.map((c) => ({
            id: c.id,
            title: c.title,
            engineId: c.engineId,
            studyId: c.studyId,
            studyTitle: btpStudies.get(c.studyId) ?? '',
            nodeId: nodeOf.get(c.id) ?? null,
            current: c.current,
            obsolete: obsolete.has(c.id),
          })),
        });
      });
    },

    async createNode(
      ctx: OrgContext,
      projectId: string,
      input: { parentId: string | null; kind: TakeoffNodeKind; code: string; title: string },
    ): Promise<Result<TakeoffNodeRecord, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const inactive = await requireBtp(repos, projectId);
        if (inactive) return err(inactive);
        const nodes = await repos.takeoff.listNodes(orgId, projectId);
        if (nodes.length >= TAKEOFF_MAX_NODES) {
          return err(
            appError(
              'POLICY_VIOLATION',
              'TAKEOFF_TOO_MANY_NODES',
              `Un avant-métré compte au plus ${String(TAKEOFF_MAX_NODES)} nœuds.`,
            ),
          );
        }
        const parent = input.parentId ? nodes.find((n) => n.id === input.parentId) : null;
        if (input.parentId && !parent) {
          return err(
            appError('VALIDATION', 'TAKEOFF_PARENT_NOT_FOUND', 'Nœud parent introuvable.'),
          );
        }
        const nesting = checkNesting(parent?.kind ?? null, input.kind);
        if (!nesting.ok) return err(fromDomain(nesting.error));
        const code = validateNodeCode(input.code);
        if (!code.ok) return err(fromDomain(code.error));
        const title = validateTitle(input.title, 'TAKEOFF_TITLE_INVALID');
        if (!title.ok) return err(fromDomain(title.error));
        const id = ids.next();
        const created = await repos.takeoff.createNode({
          id,
          organizationId: orgId,
          projectId,
          parentId: parent?.id ?? null,
          kind: input.kind,
          code: code.value,
          title: title.value,
        });
        if (!created.ok) return err(codeTaken());
        await appendActivity(
          repos,
          pctx,
          'takeoff.node_created',
          { kind: KIND_LABEL[input.kind], code: code.value, title: title.value },
          { type: 'takeoff_node', id },
        );
        return ok(reread(await repos.takeoff.findNode(orgId, projectId, id), 'Nœud'));
      });
    },

    async updateNode(
      ctx: OrgContext,
      projectId: string,
      nodeId: string,
      input: { code?: string | undefined; title?: string | undefined },
      expectedVersion: number,
    ): Promise<Result<TakeoffNodeRecord, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const node = await repos.takeoff.findNode(orgId, projectId, nodeId);
        if (!node) return err(notFound('Nœud'));
        if (node.version !== expectedVersion) return err(staleVersion());
        const code = validateNodeCode(input.code ?? node.code);
        if (!code.ok) return err(fromDomain(code.error));
        const title = validateTitle(input.title ?? node.title, 'TAKEOFF_TITLE_INVALID');
        if (!title.ok) return err(fromDomain(title.error));
        const fields = { code: code.value, title: title.value };
        const updated = await repos.takeoff.updateNode(
          orgId,
          projectId,
          nodeId,
          fields,
          expectedVersion,
        );
        if (!updated.ok) return err(codeTaken());
        if (!updated.value) return err(staleVersion());
        await appendActivity(repos, pctx, 'takeoff.node_updated', fields, {
          type: 'takeoff_node',
          id: nodeId,
        });
        return ok({ ...node, ...fields, version: expectedVersion + 1 });
      });
    },

    /** Supprime un nœud vide : ni sous-nœud, ni calcul rattaché, ni ligne de quantitatif. */
    async deleteNode(
      ctx: OrgContext,
      projectId: string,
      nodeId: string,
      expectedVersion: number,
    ): Promise<Result<void, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const node = await repos.takeoff.findNode(orgId, projectId, nodeId);
        if (!node) return err(notFound('Nœud'));
        if (node.version !== expectedVersion) return err(staleVersion());
        const usage = await repos.takeoff.nodeUsage(orgId, nodeId);
        if (usage.children + usage.assignments + usage.boqItems > 0) {
          return err(
            appError(
              'CONFLICT',
              'TAKEOFF_NODE_NOT_EMPTY',
              `Ce nœud n’est pas vide (${String(usage.children)} sous-nœud(s), ${String(usage.assignments)} calcul(s) rattaché(s), ${String(usage.boqItems)} ligne(s) de quantitatif) : videz-le d’abord.`,
            ),
          );
        }
        if (!(await repos.takeoff.deleteNode(orgId, projectId, nodeId, expectedVersion))) {
          return err(staleVersion());
        }
        await appendActivity(
          repos,
          pctx,
          'takeoff.node_deleted',
          { kind: KIND_LABEL[node.kind], code: node.code, title: node.title },
          { type: 'takeoff_node', id: nodeId },
        );
        return ok(undefined);
      });
    },

    /** Rattache un calcul BTP à un nœud, le déplace, ou le détache (`nodeId` null). */
    async assign(
      ctx: OrgContext,
      projectId: string,
      calculationId: string,
      nodeId: string | null,
    ): Promise<Result<void, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const calculation = await repos.calculations.findById(orgId, projectId, calculationId);
        if (!calculation) return err(notFound('Calcul'));
        const study = await repos.studies.findById(orgId, projectId, calculation.studyId);
        if (study?.discipline !== 'BTP') {
          return err(
            appError(
              'VALIDATION',
              'TAKEOFF_CALCULATION_NOT_BTP',
              'Seuls les calculs d’une étude BTP se rattachent à l’avant-métré.',
            ),
          );
        }
        if (nodeId === null) {
          if (await repos.takeoff.unassign(orgId, projectId, calculationId)) {
            await appendActivity(
              repos,
              pctx,
              'takeoff.calculation_unassigned',
              { title: calculation.title },
              { type: 'calculation', id: calculationId },
            );
          }
          return ok(undefined);
        }
        const node = await repos.takeoff.findNode(orgId, projectId, nodeId);
        if (!node) {
          return err(appError('VALIDATION', 'TAKEOFF_NODE_NOT_FOUND', 'Nœud introuvable.'));
        }
        await repos.takeoff.assign({
          organizationId: orgId,
          projectId,
          calculationId,
          nodeId,
          assignedById: ctx.actor.userId,
        });
        await appendActivity(
          repos,
          pctx,
          'takeoff.calculation_assigned',
          { title: calculation.title, node: `${node.code} — ${node.title}` },
          { type: 'calculation', id: calculationId },
        );
        return ok(undefined);
      });
    },
  };
}

export type TakeoffService = ReturnType<typeof createTakeoffService>;
