import { err, ok, type Result } from '@consulpro/calc-core';
import {
  BOQ_MAX_ITEMS,
  boqTotals,
  computedLines,
  formatDecimal,
  groupLines,
  isBoqPresentation,
  isCurrency,
  isPlanEmpty,
  lineAmount,
  materialBreakdown,
  orderTree,
  planPriceApplication,
  planSync,
  validateAmount,
  validateDesignation,
  validateOverride,
  validateTitle,
  type BoqUnit,
  type Currency,
  type Decimal,
  type ExistingComputedItem,
  type LineGroup,
  type MaterialRow,
  type Subtotal,
  type SyncPlan,
} from '@consulpro/domain';

import type { OrgContext } from '../context';
import { appError, fromDomain, notFound, reread, staleVersion, type AppError } from '../errors';
import type { ApplicationDeps, Repositories } from '../ports';
import type {
  BoqItemRecord,
  BoqRecord,
  ItemChanges,
  RevisionOutputs,
  TakeoffNodeRecord,
} from '../ports-quantities';
import { appendActivity, inProject } from '../projects/project-context';
import { auditBase } from '../scope';

const READ = { permission: 'project.read', write: false } as const;
const MANAGE = { permission: 'boq.manage', write: true } as const;

/** Devise d'un quantitatif enregistré (validée à la création). */
export function asCurrency(code: string): Currency {
  if (!isCurrency(code)) throw new Error(`Devise inconnue en base : ${code}`);
  return code;
}

/** Révision d'origine d'une ligne calculée : traçabilité et alertes. */
export interface ItemSource {
  readonly calculationTitle: string;
  readonly revisionNumber: number;
  readonly resultStatus: RevisionOutputs['resultStatus'];
  readonly workflowStatus: RevisionOutputs['workflowStatus'];
  /** Une révision plus récente existe : la ligne est à mettre à jour. */
  readonly superseded: boolean;
  readonly engineVerified: boolean;
}

export interface BoqItemView extends BoqItemRecord {
  readonly amount: Decimal | null;
  readonly source: ItemSource | null;
}

export interface BoqNodeView extends TakeoffNodeRecord {
  readonly depth: number;
  readonly subtotal: Subtotal;
}

export interface PendingChanges {
  readonly add: number;
  readonly update: number;
  readonly remove: number;
}

export interface BoqView {
  readonly boq: BoqRecord;
  readonly currency: Currency;
  readonly nodes: readonly BoqNodeView[];
  /** Lignes dans l'ordre du DQE : par nœud, lignes calculées puis saisies. */
  readonly items: readonly BoqItemView[];
  /** Regroupements des entrées ventilées (présentation agrégée), dans l'ordre du DQE. */
  readonly groups: readonly LineGroup[];
  readonly total: Subtotal;
  /** Écart avec l'avant-métré et les révisions courantes (mise à jour à faire). */
  readonly pending: PendingChanges;
}

export interface BoqSummary {
  readonly boq: BoqRecord;
  readonly total: Subtotal;
  readonly pending: PendingChanges;
}

const toExisting = (items: readonly BoqItemRecord[]): ExistingComputedItem[] =>
  items.flatMap((i) =>
    i.origin === 'CALCULATION' && i.calculationId && i.outputKey && i.sourceRevisionId
      ? [
          {
            id: i.id,
            nodeId: i.nodeId,
            calculationId: i.calculationId,
            outputKey: i.outputKey,
            outputPart: i.outputPart,
            groupDesignation: i.groupDesignation,
            sourceRevisionId: i.sourceRevisionId,
            workKey: i.workKey ?? '',
            designation: i.designation,
            unit: i.unit as BoqUnit,
            quantity: i.quantity,
          },
        ]
      : [],
  );

/** Plan de mise à jour d'un quantitatif d'après l'avant-métré courant. */
export async function syncPlanOf(
  repos: Repositories,
  organizationId: string,
  projectId: string,
  items: readonly BoqItemRecord[],
): Promise<SyncPlan> {
  const sources = await repos.takeoff.sources(organizationId, projectId);
  const target = computedLines(
    sources.map((s) => ({
      calculationId: s.calculationId,
      calculationTitle: s.calculationTitle,
      engineId: s.engineId,
      nodeId: s.nodeId,
      revision: s.current
        ? {
            id: s.current.revisionId,
            resultStatus: s.current.resultStatus,
            outputs: s.current.outputs,
            outputPresentations: s.current.outputPresentations,
          }
        : null,
    })),
  );
  return planSync(toExisting(items), target);
}

const pendingOf = (plan: SyncPlan): PendingChanges => ({
  add: plan.add.length,
  update: plan.update.length,
  remove: plan.remove.length,
});

const byDesignation = (a: BoqItemRecord, b: BoqItemRecord) =>
  (a.origin === b.origin ? 0 : a.origin === 'CALCULATION' ? -1 : 1) ||
  a.designation.localeCompare(b.designation, 'fr', { numeric: true }) ||
  a.createdAt.getTime() - b.createdAt.getTime();

const sourceOf = (revision: RevisionOutputs | undefined): ItemSource | null =>
  revision
    ? {
        calculationTitle: revision.calculationTitle,
        revisionNumber: revision.revisionNumber,
        resultStatus: revision.resultStatus,
        workflowStatus: revision.workflowStatus,
        superseded: revision.currentRevisionId !== revision.revisionId,
        engineVerified: revision.engineVerified,
      }
    : null;

/** Vue d'une ligne : montant dans la devise du quantitatif, révision d'origine. */
export async function itemViewOf(
  repos: Repositories,
  boq: BoqRecord,
  item: BoqItemRecord,
): Promise<BoqItemView> {
  const [revision] = item.sourceRevisionId
    ? await repos.boqs.revisionOutputs(boq.organizationId, [item.sourceRevisionId])
    : [];
  return {
    ...item,
    amount: lineAmount(item, asCurrency(boq.currency)),
    source: sourceOf(revision),
  };
}

/** Vue complète d'un quantitatif : lignes ordonnées, montants, sous-totaux, écarts. */
export async function boqViewOf(
  repos: Repositories,
  boq: BoqRecord,
  plan?: SyncPlan,
): Promise<BoqView> {
  const orgId = boq.organizationId;
  const currency = asCurrency(boq.currency);
  const nodes = orderTree(await repos.takeoff.listNodes(orgId, boq.projectId));
  const items = await repos.boqs.listItems(orgId, boq.id);
  const revisionIds = [
    ...new Set(items.flatMap((i) => (i.sourceRevisionId ? [i.sourceRevisionId] : []))),
  ];
  const revisions = new Map(
    (await repos.boqs.revisionOutputs(orgId, revisionIds)).map((r) => [r.revisionId, r]),
  );
  const totals = boqTotals(nodes, items, currency);
  const rank = new Map(nodes.map((n, i) => [n.id, i]));
  const ordered = [...items].sort(
    (a, b) => (rank.get(a.nodeId) ?? 0) - (rank.get(b.nodeId) ?? 0) || byDesignation(a, b),
  );
  const empty: Subtotal = { amount: 0n, lines: 0, unpriced: 0 };
  return {
    boq,
    currency,
    nodes: nodes.map((n) => ({ ...n, subtotal: totals.byNode.get(n.id) ?? empty })),
    items: ordered.map((item) => {
      const revision = item.sourceRevisionId ? revisions.get(item.sourceRevisionId) : undefined;
      return { ...item, amount: lineAmount(item, currency), source: sourceOf(revision) };
    }),
    groups: groupLines(ordered, currency),
    total: totals.total,
    pending: pendingOf(plan ?? (await syncPlanOf(repos, orgId, boq.projectId, items))),
  };
}

/** Applique un plan de mise à jour (champs calculés seulement). */
async function applyPlan(
  repos: Repositories,
  boq: BoqRecord,
  plan: SyncPlan,
  newId: () => string,
): Promise<void> {
  const orgId = boq.organizationId;
  await repos.boqs.deleteItems(orgId, plan.remove);
  await repos.boqs.updateComputedItems(orgId, plan.update);
  await repos.boqs.createComputedItems(
    plan.add.map((line) => ({
      ...line,
      id: newId(),
      organizationId: orgId,
      projectId: boq.projectId,
      boqId: boq.id,
    })),
  );
}

const tooManyItems = () =>
  appError(
    'POLICY_VIOLATION',
    'BOQ_TOO_MANY_ITEMS',
    `Un quantitatif compte au plus ${String(BOQ_MAX_ITEMS)} lignes.`,
  );

export function createBoqService({
  uow,
  ids,
  clock,
}: Pick<ApplicationDeps, 'uow' | 'ids' | 'clock'>) {
  /** Charge un quantitatif du projet, verrouillé pour les écritures. */
  async function load(
    repos: Repositories,
    ctx: OrgContext,
    projectId: string,
    boqId: string,
    options: { lock?: boolean } = {},
  ): Promise<Result<BoqRecord, AppError>> {
    const boq = options.lock
      ? await repos.boqs.lock(ctx.organization.id, projectId, boqId)
      : await repos.boqs.findById(ctx.organization.id, projectId, boqId);
    return boq ? ok(boq) : err(notFound('Quantitatif'));
  }

  return {
    async list(ctx: OrgContext, projectId: string): Promise<Result<BoqSummary[], AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const orgId = ctx.organization.id;
        const boqs = await repos.boqs.list(orgId, projectId);
        const summaries: BoqSummary[] = [];
        for (const boq of boqs) {
          const items = await repos.boqs.listItems(orgId, boq.id);
          summaries.push({
            boq,
            total: boqTotals([], items, asCurrency(boq.currency)).total,
            pending: pendingOf(await syncPlanOf(repos, orgId, projectId, items)),
          });
        }
        return ok(summaries);
      });
    },

    async get(
      ctx: OrgContext,
      projectId: string,
      boqId: string,
    ): Promise<Result<BoqView, AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const boq = await load(repos, ctx, projectId, boqId);
        return boq.ok ? ok(await boqViewOf(repos, boq.value)) : boq;
      });
    },

    /** Crée un quantitatif et y reporte aussitôt les quantités de l'avant-métré. */
    async create(
      ctx: OrgContext,
      projectId: string,
      input: { title: string; currency?: string | undefined },
    ): Promise<Result<BoqView, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const title = validateTitle(input.title, 'BOQ_TITLE_INVALID');
        if (!title.ok) return err(fromDomain(title.error));
        const currency =
          input.currency ?? (await repos.organizations.findById(orgId))?.currency ?? 'XOF';
        if (!isCurrency(currency)) {
          return err(appError('VALIDATION', 'CURRENCY_INVALID', 'Devise non prise en charge.'));
        }
        const id = ids.next();
        await repos.boqs.create({
          id,
          organizationId: orgId,
          projectId,
          title: title.value,
          currency,
          createdById: ctx.actor.userId,
        });
        const boq = reread(await repos.boqs.findById(orgId, projectId, id), 'Quantitatif');
        const plan = await syncPlanOf(repos, orgId, projectId, []);
        if (plan.add.length > BOQ_MAX_ITEMS) return err(tooManyItems());
        await applyPlan(repos, boq, plan, () => ids.next());
        await repos.boqs.bump(orgId, id, clock.now());
        await appendActivity(
          repos,
          pctx,
          'boq.created',
          { title: title.value, lines: plan.add.length },
          { type: 'boq', id },
        );
        const fresh = reread(await repos.boqs.findById(orgId, projectId, id), 'Quantitatif');
        return ok(await boqViewOf(repos, fresh));
      });
    },

    async update(
      ctx: OrgContext,
      projectId: string,
      boqId: string,
      input: {
        title?: string | undefined;
        currency?: string | undefined;
        presentation?: string | undefined;
      },
      expectedVersion: number,
    ): Promise<Result<BoqView, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const loaded = await load(repos, ctx, projectId, boqId, { lock: true });
        if (!loaded.ok) return loaded;
        const boq = loaded.value;
        if (boq.version !== expectedVersion) return err(staleVersion());
        const title = validateTitle(input.title ?? boq.title, 'BOQ_TITLE_INVALID');
        if (!title.ok) return err(fromDomain(title.error));
        const currency = input.currency ?? boq.currency;
        if (!isCurrency(currency)) {
          return err(appError('VALIDATION', 'CURRENCY_INVALID', 'Devise non prise en charge.'));
        }
        const presentation = input.presentation ?? boq.presentation;
        if (!isBoqPresentation(presentation)) {
          return err(
            appError('VALIDATION', 'BOQ_PRESENTATION_INVALID', 'Présentation non prise en charge.'),
          );
        }
        if (currency !== boq.currency) {
          const items = await repos.boqs.listItems(orgId, boqId);
          if (items.some((i) => i.unitPrice !== null)) {
            return err(
              appError(
                'CONFLICT',
                'BOQ_CURRENCY_LOCKED',
                'Des lignes sont chiffrées : retirez leurs prix avant de changer de devise (aucune conversion automatique).',
              ),
            );
          }
        }
        if (
          !(await repos.boqs.update(
            orgId,
            projectId,
            boqId,
            { title: title.value, currency, presentation },
            expectedVersion,
          ))
        ) {
          return err(staleVersion());
        }
        await appendActivity(
          repos,
          pctx,
          'boq.updated',
          { title: title.value, currency, presentation },
          { type: 'boq', id: boqId },
        );
        const fresh = reread(await repos.boqs.findById(orgId, projectId, boqId), 'Quantitatif');
        return ok(await boqViewOf(repos, fresh));
      });
    },

    async remove(
      ctx: OrgContext,
      projectId: string,
      boqId: string,
      expectedVersion: number,
    ): Promise<Result<void, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const loaded = await load(repos, ctx, projectId, boqId, { lock: true });
        if (!loaded.ok) return loaded;
        if (loaded.value.version !== expectedVersion) return err(staleVersion());
        if (!(await repos.boqs.delete(orgId, projectId, boqId, expectedVersion))) {
          return err(staleVersion());
        }
        await appendActivity(
          repos,
          pctx,
          'boq.deleted',
          { title: loaded.value.title },
          { type: 'boq', id: boqId },
        );
        await repos.audit.append({
          ...auditBase(ctx, orgId),
          action: 'boq.deleted',
          targetType: 'boq',
          targetId: boqId,
          metadata: { projectId, title: loaded.value.title },
        });
        return ok(undefined);
      });
    },

    /**
     * Met à jour les lignes calculées depuis l'avant-métré et les révisions courantes.
     * Les prix, quantités retenues et lignes saisies sont conservés.
     */
    async sync(
      ctx: OrgContext,
      projectId: string,
      boqId: string,
    ): Promise<
      Result<{ view: BoqView; added: number; updated: number; removed: number }, AppError>
    > {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const loaded = await load(repos, ctx, projectId, boqId, { lock: true });
        if (!loaded.ok) return loaded;
        const items = await repos.boqs.listItems(orgId, boqId);
        const plan = await syncPlanOf(repos, orgId, projectId, items);
        if (items.length + plan.add.length - plan.remove.length > BOQ_MAX_ITEMS) {
          return err(tooManyItems());
        }
        if (!isPlanEmpty(plan)) {
          await applyPlan(repos, loaded.value, plan, () => ids.next());
          await appendActivity(
            repos,
            pctx,
            'boq.synced',
            {
              title: loaded.value.title,
              added: plan.add.length,
              updated: plan.update.length,
              removed: plan.remove.length,
            },
            { type: 'boq', id: boqId },
          );
        }
        await repos.boqs.bump(orgId, boqId, clock.now());
        const fresh = reread(await repos.boqs.findById(orgId, projectId, boqId), 'Quantitatif');
        return ok({
          view: await boqViewOf(repos, fresh),
          added: plan.add.length,
          updated: plan.update.length,
          removed: plan.remove.length,
        });
      });
    },

    /** Ligne saisie (installation de chantier, forfait…), rattachée à un nœud. */
    async addItem(
      ctx: OrgContext,
      projectId: string,
      boqId: string,
      input: {
        nodeId: string;
        designation: string;
        unit: BoqUnit;
        quantity: string;
        unitPrice?: string | null | undefined;
      },
    ): Promise<Result<BoqItemView, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const loaded = await load(repos, ctx, projectId, boqId, { lock: true });
        if (!loaded.ok) return loaded;
        if ((await repos.boqs.listItems(orgId, boqId)).length >= BOQ_MAX_ITEMS) {
          return err(tooManyItems());
        }
        const node = await repos.takeoff.findNode(orgId, projectId, input.nodeId);
        if (!node) {
          return err(appError('VALIDATION', 'TAKEOFF_NODE_NOT_FOUND', 'Nœud introuvable.'));
        }
        const designation = validateDesignation(input.designation);
        if (!designation.ok) return err(fromDomain(designation.error));
        const quantity = validateAmount(input.quantity, 'BOQ_QUANTITY_INVALID', { positive: true });
        if (!quantity.ok) return err(fromDomain(quantity.error));
        let unitPrice: Decimal | null = null;
        if (input.unitPrice !== undefined && input.unitPrice !== null) {
          const price = validateAmount(input.unitPrice, 'BOQ_PRICE_INVALID');
          if (!price.ok) return err(fromDomain(price.error));
          unitPrice = price.value;
        }
        const id = ids.next();
        await repos.boqs.createManualItem({
          id,
          organizationId: orgId,
          projectId,
          boqId,
          nodeId: node.id,
          designation: designation.value,
          unit: input.unit,
          quantity: quantity.value,
          unitPrice,
        });
        await repos.boqs.bump(orgId, boqId);
        await appendActivity(
          repos,
          pctx,
          'boq.item_added',
          { title: loaded.value.title, designation: designation.value },
          { type: 'boq', id: boqId },
        );
        return ok(
          await itemViewOf(
            repos,
            loaded.value,
            reread(await repos.boqs.findItem(orgId, boqId, id), 'Ligne'),
          ),
        );
      });
    },

    /**
     * Modifie une ligne. Ligne saisie : désignation, unité, quantité, prix. Ligne calculée :
     * prix et quantité retenue (justifiée, journalisée) ; sa quantité ne change qu'en recalculant.
     */
    async updateItem(
      ctx: OrgContext,
      projectId: string,
      boqId: string,
      itemId: string,
      input: {
        designation?: string | undefined;
        unit?: BoqUnit | undefined;
        quantity?: string | undefined;
        unitPrice?: string | null | undefined;
        override?: { quantity: string; justification: string } | null | undefined;
      },
      expectedVersion: number,
    ): Promise<Result<BoqItemView, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const loaded = await load(repos, ctx, projectId, boqId, { lock: true });
        if (!loaded.ok) return loaded;
        const item = await repos.boqs.findItem(orgId, boqId, itemId);
        if (!item) return err(notFound('Ligne'));
        if (item.version !== expectedVersion) return err(staleVersion());
        const computed = item.origin === 'CALCULATION';
        const changes: {
          -readonly [K in keyof ItemChanges]: ItemChanges[K];
        } = {};
        if (computed) {
          if (
            input.designation !== undefined ||
            input.unit !== undefined ||
            input.quantity !== undefined
          ) {
            return err(
              appError(
                'VALIDATION',
                'BOQ_COMPUTED_READONLY',
                'Une ligne calculée suit son calcul : recalculez, ou indiquez une quantité retenue justifiée.',
              ),
            );
          }
        } else {
          if (input.override !== undefined) {
            return err(
              appError(
                'VALIDATION',
                'BOQ_OVERRIDE_MANUAL',
                'Une ligne saisie se corrige directement : la quantité retenue concerne les lignes calculées.',
              ),
            );
          }
          if (input.designation !== undefined) {
            const designation = validateDesignation(input.designation);
            if (!designation.ok) return err(fromDomain(designation.error));
            changes.designation = designation.value;
          }
          if (input.unit !== undefined) changes.unit = input.unit;
          if (input.quantity !== undefined) {
            const quantity = validateAmount(input.quantity, 'BOQ_QUANTITY_INVALID', {
              positive: true,
            });
            if (!quantity.ok) return err(fromDomain(quantity.error));
            changes.quantity = quantity.value;
          }
        }
        if (input.override !== undefined) {
          if (input.override === null) changes.override = null;
          else {
            const override = validateOverride(
              input.override.quantity,
              input.override.justification,
            );
            if (!override.ok) return err(fromDomain(override.error));
            changes.override = override.value;
          }
        }
        if (input.unitPrice !== undefined) {
          if (input.unitPrice === null) changes.unitPrice = null;
          else {
            const price = validateAmount(input.unitPrice, 'BOQ_PRICE_INVALID');
            if (!price.ok) return err(fromDomain(price.error));
            changes.unitPrice = price.value;
          }
        }
        if (!(await repos.boqs.updateItem(orgId, boqId, itemId, changes, expectedVersion))) {
          return err(staleVersion());
        }
        await repos.boqs.bump(orgId, boqId);
        if (changes.override !== undefined || !computed) {
          await appendActivity(
            repos,
            pctx,
            'boq.item_updated',
            { title: loaded.value.title, designation: changes.designation ?? item.designation },
            { type: 'boq', id: boqId },
          );
        }
        if (changes.override !== undefined) {
          await repos.audit.append({
            ...auditBase(ctx, orgId),
            action: 'boq.quantity_overridden',
            targetType: 'boq_item',
            targetId: itemId,
            metadata: {
              projectId,
              boqId,
              designation: item.designation,
              computed: formatDecimal(item.quantity),
              retained: changes.override ? formatDecimal(changes.override.quantity) : null,
              justification: changes.override?.justification ?? null,
            },
          });
        }
        return ok(
          await itemViewOf(
            repos,
            loaded.value,
            reread(await repos.boqs.findItem(orgId, boqId, itemId), 'Ligne'),
          ),
        );
      });
    },

    /** Supprime une ligne saisie (une ligne calculée suit l'avant-métré). */
    async deleteItem(
      ctx: OrgContext,
      projectId: string,
      boqId: string,
      itemId: string,
      expectedVersion: number,
    ): Promise<Result<void, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const loaded = await load(repos, ctx, projectId, boqId, { lock: true });
        if (!loaded.ok) return loaded;
        const item = await repos.boqs.findItem(orgId, boqId, itemId);
        if (!item) return err(notFound('Ligne'));
        if (item.version !== expectedVersion) return err(staleVersion());
        if (item.origin === 'CALCULATION') {
          return err(
            appError(
              'VALIDATION',
              'BOQ_COMPUTED_DELETE',
              'Une ligne calculée disparaît en détachant son calcul de l’avant-métré, puis en mettant à jour le quantitatif.',
            ),
          );
        }
        if (!(await repos.boqs.deleteItem(orgId, boqId, itemId, expectedVersion))) {
          return err(staleVersion());
        }
        await repos.boqs.bump(orgId, boqId);
        await appendActivity(
          repos,
          pctx,
          'boq.item_deleted',
          { title: loaded.value.title, designation: item.designation },
          { type: 'boq', id: boqId },
        );
        return ok(undefined);
      });
    },

    /**
     * Chiffre les lignes avec une bibliothèque de prix de même devise : même ouvrage et même
     * unité. Sans `overwrite`, les lignes déjà chiffrées gardent leur prix.
     */
    async applyPrices(
      ctx: OrgContext,
      projectId: string,
      boqId: string,
      input: { libraryId: string; overwrite: boolean },
    ): Promise<
      Result<{ view: BoqView; applied: number; unmatched: number; kept: number }, AppError>
    > {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const loaded = await load(repos, ctx, projectId, boqId, { lock: true });
        if (!loaded.ok) return loaded;
        const library = await repos.prices.findLibrary(orgId, input.libraryId);
        if (!library) {
          return err(
            appError('VALIDATION', 'PRICE_LIBRARY_NOT_FOUND', 'Bibliothèque de prix introuvable.'),
          );
        }
        if (library.currency !== loaded.value.currency) {
          return err(
            appError(
              'POLICY_VIOLATION',
              'PRICE_CURRENCY_MISMATCH',
              `La bibliothèque est en ${library.currency}, le quantitatif en ${loaded.value.currency} : aucune conversion n’est faite.`,
            ),
          );
        }
        const items = await repos.boqs.listItems(orgId, boqId);
        const candidates = await repos.prices.listItems(orgId, library.id);
        const plan = planPriceApplication(
          items,
          candidates.map((c) => ({ id: c.id, workKey: c.workKey, unit: c.unit, price: c.price })),
          input.overwrite,
        );
        await repos.boqs.setPrices(orgId, plan.apply);
        await repos.boqs.bump(orgId, boqId);
        await appendActivity(
          repos,
          pctx,
          'boq.prices_applied',
          {
            title: loaded.value.title,
            library: library.name,
            applied: plan.apply.length,
            unmatched: plan.unmatched,
          },
          { type: 'boq', id: boqId },
        );
        const fresh = reread(await repos.boqs.findById(orgId, projectId, boqId), 'Quantitatif');
        return ok({
          view: await boqViewOf(repos, fresh),
          applied: plan.apply.length,
          unmatched: plan.unmatched,
          kept: plan.kept,
        });
      });
    },

    /** Décomposition en matériaux des révisions reprises au quantitatif. */
    async materials(
      ctx: OrgContext,
      projectId: string,
      boqId: string,
    ): Promise<Result<MaterialRow[], AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const orgId = ctx.organization.id;
        const loaded = await load(repos, ctx, projectId, boqId);
        if (!loaded.ok) return loaded;
        const items = await repos.boqs.listItems(orgId, boqId);
        const revisionIds = [
          ...new Set(items.flatMap((i) => (i.sourceRevisionId ? [i.sourceRevisionId] : []))),
        ];
        const revisions = await repos.boqs.revisionOutputs(orgId, revisionIds);
        return ok(
          materialBreakdown(
            [...revisions]
              .sort((a, b) => a.calculationTitle.localeCompare(b.calculationTitle, 'fr'))
              .map((r) => ({
                calculationId: r.calculationId,
                calculationTitle: r.calculationTitle,
                revisionId: r.revisionId,
                outputs: r.outputs,
                outputPresentations: r.outputPresentations,
              })),
          ),
        );
      });
    },
  };
}

export type BoqService = ReturnType<typeof createBoqService>;
