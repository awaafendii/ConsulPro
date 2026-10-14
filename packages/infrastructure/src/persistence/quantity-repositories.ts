import { err, ok } from '@consulpro/calc-core';
import type {
  BoqItemRecord,
  BoqRecord,
  PriceItemRecord,
  PriceLibraryRecord,
  QuantityRepositories,
  RevisionOutputs,
  StoredPresentation,
  TakeoffNodeRecord,
} from '@consulpro/application';
import type { Prisma } from '@consulpro/db';
import { formatDecimal, type Decimal } from '@consulpro/domain';

type Tx = Prisma.TransactionClient;

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** NUMERIC(18,4) → décimale exacte (dix-millièmes) ; aucun passage par un flottant. */
const toDecimal = (value: Prisma.Decimal): Decimal => BigInt(value.times(10_000).toFixed(0));
const toDecimalOrNull = (value: Prisma.Decimal | null): Decimal | null =>
  value === null ? null : toDecimal(value);
/** Décimale → chaîne exacte, acceptée par Prisma pour une colonne NUMERIC. */
const dbDecimal = (value: Decimal): string => formatDecimal(value);

const toDate = (value: string | null) => (value === null ? null : new Date(`${value}T00:00:00Z`));
const fromDate = (value: Date | null) => (value === null ? null : value.toISOString().slice(0, 10));

const toNode = (n: TakeoffNodeRecord): TakeoffNodeRecord => ({
  id: n.id,
  organizationId: n.organizationId,
  projectId: n.projectId,
  parentId: n.parentId,
  kind: n.kind,
  code: n.code,
  title: n.title,
  version: n.version,
  createdAt: n.createdAt,
});

const revisionSelect = {
  id: true,
  number: true,
  calculationId: true,
  engineId: true,
  resultStatus: true,
  workflowStatus: true,
  outputs: true,
  presentation: true,
  calculation: { select: { title: true, currentRevisionId: true } },
} as const;

type RevisionRow = Prisma.CalculationRevisionGetPayload<{ select: typeof revisionSelect }>;

function toRevisionOutputs(r: RevisionRow): RevisionOutputs {
  const presentation = r.presentation as unknown as StoredPresentation;
  const cases = presentation.referenceCases;
  return {
    revisionId: r.id,
    revisionNumber: r.number,
    calculationId: r.calculationId,
    calculationTitle: r.calculation.title,
    engineId: r.engineId,
    resultStatus: r.resultStatus,
    workflowStatus: r.workflowStatus,
    outputs: r.outputs as Readonly<Record<string, unknown>> | null,
    outputPresentations: presentation.outputs,
    currentRevisionId: r.calculation.currentRevisionId,
    engineVerified: cases !== undefined && cases.total > 0 && cases.checked === cases.total,
  };
}

const boqInclude = { createdBy: { select: { name: true } } } as const;
type BoqRow = Prisma.BillOfQuantitiesGetPayload<{ include: typeof boqInclude }>;

const toBoq = (b: BoqRow): BoqRecord => ({
  id: b.id,
  organizationId: b.organizationId,
  projectId: b.projectId,
  title: b.title,
  currency: b.currency,
  presentation: b.presentation,
  version: b.version,
  createdById: b.createdById,
  createdByName: b.createdBy.name,
  syncedAt: b.syncedAt,
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});

type ItemRow = Prisma.BoqItemGetPayload<object>;

const toItem = (i: ItemRow): BoqItemRecord => ({
  id: i.id,
  boqId: i.boqId,
  nodeId: i.nodeId,
  origin: i.origin,
  calculationId: i.calculationId,
  outputKey: i.outputKey,
  outputPart: i.outputPart,
  groupDesignation: i.groupDesignation,
  sourceRevisionId: i.sourceRevisionId,
  workKey: i.workKey,
  designation: i.designation,
  unit: i.unit,
  quantity: toDecimal(i.quantity),
  overrideQuantity: toDecimalOrNull(i.overrideQuantity),
  overrideJustification: i.overrideJustification,
  unitPrice: toDecimalOrNull(i.unitPrice),
  priceItemId: i.priceItemId,
  version: i.version,
  createdAt: i.createdAt,
});

const libraryInclude = { _count: { select: { items: true } } } as const;
type LibraryRow = Prisma.PriceLibraryGetPayload<{ include: typeof libraryInclude }>;

const toLibrary = (l: LibraryRow): PriceLibraryRecord => ({
  id: l.id,
  organizationId: l.organizationId,
  name: l.name,
  currency: l.currency,
  validFrom: fromDate(l.validFrom),
  version: l.version,
  itemCount: l._count.items,
  createdAt: l.createdAt,
});

const toPriceItem = (i: Prisma.PriceItemGetPayload<object>): PriceItemRecord => ({
  id: i.id,
  libraryId: i.libraryId,
  code: i.code,
  designation: i.designation,
  unit: i.unit,
  price: toDecimal(i.price),
  workKey: i.workKey,
  version: i.version,
});

/**
 * Repositories de l'avant-métré, des quantitatifs et des bibliothèques de prix. La base
 * contrôle en plus l'imbrication des nœuds, la cohérence des lignes et l'accès (RLS).
 */
export function createQuantityRepositories(tx: Tx): QuantityRepositories {
  /** Conflit d'unicité d'un article (code ou ouvrage), vérifié avant l'écriture. */
  async function priceConflict(
    libraryId: string,
    fields: { code: string; workKey: string | null },
    exceptId?: string,
  ) {
    const others = await tx.priceItem.findMany({
      where: {
        libraryId,
        ...(exceptId ? { id: { not: exceptId } } : {}),
        OR: [{ code: fields.code }, ...(fields.workKey ? [{ workKey: fields.workKey }] : [])],
      },
      select: { code: true },
    });
    if (others.some((o) => o.code === fields.code)) return 'CODE_TAKEN' as const;
    return others.length > 0 ? ('WORK_KEY_TAKEN' as const) : null;
  }

  return {
    takeoff: {
      async listNodes(organizationId, projectId) {
        const rows = await tx.takeoffNode.findMany({ where: { organizationId, projectId } });
        return rows.map(toNode);
      },
      async findNode(organizationId, projectId, id) {
        const n = await tx.takeoffNode.findFirst({ where: { organizationId, projectId, id } });
        return n ? toNode(n) : null;
      },
      async createNode(input) {
        try {
          await tx.takeoffNode.createMany({ data: [input] });
          return ok(undefined);
        } catch (error) {
          if (isUniqueViolation(error)) return err('CODE_TAKEN' as const);
          throw error;
        }
      },
      async updateNode(organizationId, projectId, id, fields, version) {
        try {
          const { count } = await tx.takeoffNode.updateMany({
            where: { organizationId, projectId, id, version },
            data: { ...fields, version: { increment: 1 } },
          });
          return ok(count === 1);
        } catch (error) {
          if (isUniqueViolation(error)) return err('CODE_TAKEN' as const);
          throw error;
        }
      },
      async deleteNode(organizationId, projectId, id, version) {
        const { count } = await tx.takeoffNode.deleteMany({
          where: { organizationId, projectId, id, version },
        });
        return count === 1;
      },
      async nodeUsage(organizationId, id) {
        return {
          children: await tx.takeoffNode.count({ where: { organizationId, parentId: id } }),
          assignments: await tx.takeoffAssignment.count({ where: { organizationId, nodeId: id } }),
          boqItems: await tx.boqItem.count({ where: { organizationId, nodeId: id } }),
        };
      },
      async listAssignments(organizationId, projectId) {
        return tx.takeoffAssignment.findMany({
          where: { organizationId, projectId },
          select: { calculationId: true, nodeId: true },
        });
      },
      async assign(input) {
        await tx.takeoffAssignment.upsert({
          where: { calculationId: input.calculationId },
          create: input,
          update: { nodeId: input.nodeId, assignedById: input.assignedById },
        });
      },
      async unassign(organizationId, projectId, calculationId) {
        const { count } = await tx.takeoffAssignment.deleteMany({
          where: { organizationId, projectId, calculationId },
        });
        return count === 1;
      },
      async sources(organizationId, projectId) {
        const rows = await tx.takeoffAssignment.findMany({
          where: { organizationId, projectId },
          select: {
            nodeId: true,
            calculation: {
              select: {
                id: true,
                title: true,
                engineId: true,
                currentRevision: { select: revisionSelect },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        });
        return rows.map((a) => ({
          calculationId: a.calculation.id,
          calculationTitle: a.calculation.title,
          engineId: a.calculation.engineId,
          nodeId: a.nodeId,
          current: a.calculation.currentRevision
            ? toRevisionOutputs(a.calculation.currentRevision)
            : null,
        }));
      },
    },

    boqs: {
      async list(organizationId, projectId) {
        const rows = await tx.billOfQuantities.findMany({
          where: { organizationId, projectId },
          include: boqInclude,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        return rows.map(toBoq);
      },
      async findById(organizationId, projectId, id) {
        const b = await tx.billOfQuantities.findFirst({
          where: { organizationId, projectId, id },
          include: boqInclude,
        });
        return b ? toBoq(b) : null;
      },
      async lock(organizationId, projectId, id) {
        if (!UUID.test(id)) return null;
        await tx.$queryRaw`
          SELECT id FROM bills_of_quantities
           WHERE organization_id = ${organizationId}::uuid AND project_id = ${projectId}::uuid
             AND id = ${id}::uuid
             FOR UPDATE`;
        const b = await tx.billOfQuantities.findFirst({
          where: { organizationId, projectId, id },
          include: boqInclude,
        });
        return b ? toBoq(b) : null;
      },
      async create(input) {
        await tx.billOfQuantities.createMany({ data: [input] });
      },
      async update(organizationId, projectId, id, fields, version) {
        const { count } = await tx.billOfQuantities.updateMany({
          where: { organizationId, projectId, id, version },
          data: { ...fields, version: { increment: 1 } },
        });
        return count === 1;
      },
      async bump(organizationId, id, syncedAt) {
        await tx.billOfQuantities.updateMany({
          where: { organizationId, id },
          data: { version: { increment: 1 }, ...(syncedAt ? { syncedAt } : {}) },
        });
      },
      async delete(organizationId, projectId, id, version) {
        const { count } = await tx.billOfQuantities.deleteMany({
          where: { organizationId, projectId, id, version },
        });
        return count === 1;
      },
      async listItems(organizationId, boqId) {
        const rows = await tx.boqItem.findMany({
          where: { organizationId, boqId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        return rows.map(toItem);
      },
      async findItem(organizationId, boqId, id) {
        const i = await tx.boqItem.findFirst({ where: { organizationId, boqId, id } });
        return i ? toItem(i) : null;
      },
      async createManualItem(item) {
        await tx.boqItem.createMany({
          data: [
            {
              ...item,
              origin: 'MANUAL',
              quantity: dbDecimal(item.quantity),
              unitPrice: item.unitPrice === null ? null : dbDecimal(item.unitPrice),
            },
          ],
        });
      },
      async createComputedItems(items) {
        if (items.length === 0) return;
        await tx.boqItem.createMany({
          data: items.map((item) => ({
            id: item.id,
            organizationId: item.organizationId,
            projectId: item.projectId,
            boqId: item.boqId,
            nodeId: item.nodeId,
            origin: 'CALCULATION' as const,
            calculationId: item.calculationId,
            outputKey: item.outputKey,
            outputPart: item.outputPart,
            groupDesignation: item.groupDesignation,
            sourceRevisionId: item.sourceRevisionId,
            workKey: item.workKey,
            designation: item.designation,
            unit: item.unit,
            quantity: dbDecimal(item.quantity),
          })),
        });
      },
      async updateComputedItems(organizationId, updates) {
        for (const { id, line } of updates) {
          await tx.boqItem.updateMany({
            where: { organizationId, id, origin: 'CALCULATION' },
            data: {
              nodeId: line.nodeId,
              sourceRevisionId: line.sourceRevisionId,
              workKey: line.workKey,
              designation: line.designation,
              groupDesignation: line.groupDesignation,
              unit: line.unit,
              quantity: dbDecimal(line.quantity),
              version: { increment: 1 },
            },
          });
        }
      },
      async deleteItems(organizationId, ids) {
        if (ids.length === 0) return;
        await tx.boqItem.deleteMany({ where: { organizationId, id: { in: [...ids] } } });
      },
      async updateItem(organizationId, boqId, id, changes, version) {
        const data: Prisma.BoqItemUncheckedUpdateManyInput = { version: { increment: 1 } };
        if (changes.designation !== undefined) data.designation = changes.designation;
        if (changes.unit !== undefined) data.unit = changes.unit;
        if (changes.quantity !== undefined) data.quantity = dbDecimal(changes.quantity);
        if (changes.override !== undefined) {
          data.overrideQuantity = changes.override ? dbDecimal(changes.override.quantity) : null;
          data.overrideJustification = changes.override?.justification ?? null;
        }
        if (changes.unitPrice !== undefined) {
          // Un prix saisi remplace le prix de bibliothèque : le lien disparaît.
          data.unitPrice = changes.unitPrice === null ? null : dbDecimal(changes.unitPrice);
          data.priceItemId = null;
        }
        const { count } = await tx.boqItem.updateMany({
          where: { organizationId, boqId, id, version },
          data,
        });
        return count === 1;
      },
      async setPrices(organizationId, entries) {
        for (const entry of entries) {
          await tx.boqItem.updateMany({
            where: { organizationId, id: entry.id },
            data: {
              unitPrice: dbDecimal(entry.unitPrice),
              priceItemId: entry.priceItemId,
              version: { increment: 1 },
            },
          });
        }
      },
      async deleteItem(organizationId, boqId, id, version) {
        const { count } = await tx.boqItem.deleteMany({
          where: { organizationId, boqId, id, version },
        });
        return count === 1;
      },
      async revisionOutputs(organizationId, revisionIds) {
        if (revisionIds.length === 0) return [];
        const rows = await tx.calculationRevision.findMany({
          where: { organizationId, id: { in: [...revisionIds] } },
          select: revisionSelect,
        });
        return rows.map(toRevisionOutputs);
      },
      async breakdownWorks(organizationId) {
        const rows = await tx.boqItem.findMany({
          where: { organizationId, origin: 'CALCULATION', outputPart: { not: '' } },
          select: { workKey: true, unit: true, designation: true },
          distinct: ['workKey'],
          orderBy: [{ workKey: 'asc' }],
        });
        return rows.flatMap((r) =>
          r.workKey ? [{ workKey: r.workKey, unit: r.unit, designation: r.designation }] : [],
        );
      },
    },

    prices: {
      async listLibraries(organizationId) {
        const rows = await tx.priceLibrary.findMany({
          where: { organizationId },
          include: libraryInclude,
          orderBy: { name: 'asc' },
        });
        return rows.map(toLibrary);
      },
      async findLibrary(organizationId, id) {
        const l = await tx.priceLibrary.findFirst({
          where: { organizationId, id },
          include: libraryInclude,
        });
        return l ? toLibrary(l) : null;
      },
      async createLibrary(input) {
        try {
          await tx.priceLibrary.createMany({
            data: [{ ...input, validFrom: toDate(input.validFrom) }],
          });
          return ok(undefined);
        } catch (error) {
          if (isUniqueViolation(error)) return err('NAME_TAKEN' as const);
          throw error;
        }
      },
      async updateLibrary(organizationId, id, fields, version) {
        try {
          const { count } = await tx.priceLibrary.updateMany({
            where: { organizationId, id, version },
            data: { ...fields, validFrom: toDate(fields.validFrom), version: { increment: 1 } },
          });
          return ok(count === 1);
        } catch (error) {
          if (isUniqueViolation(error)) return err('NAME_TAKEN' as const);
          throw error;
        }
      },
      async deleteLibrary(organizationId, id, version) {
        const { count } = await tx.priceLibrary.deleteMany({
          where: { organizationId, id, version },
        });
        return count === 1;
      },
      async listItems(organizationId, libraryId) {
        const rows = await tx.priceItem.findMany({
          where: { organizationId, libraryId },
          orderBy: { code: 'asc' },
        });
        return rows.map(toPriceItem);
      },
      async findItem(organizationId, libraryId, id) {
        const i = await tx.priceItem.findFirst({ where: { organizationId, libraryId, id } });
        return i ? toPriceItem(i) : null;
      },
      async createItem(input) {
        const conflict = await priceConflict(input.libraryId, input);
        if (conflict) return err(conflict);
        try {
          await tx.priceItem.createMany({ data: [{ ...input, price: dbDecimal(input.price) }] });
          return ok(undefined);
        } catch (error) {
          if (isUniqueViolation(error)) return err('CODE_TAKEN' as const);
          throw error;
        }
      },
      async updateItem(organizationId, libraryId, id, fields, version) {
        const conflict = await priceConflict(libraryId, fields, id);
        if (conflict) return err(conflict);
        try {
          const { count } = await tx.priceItem.updateMany({
            where: { organizationId, libraryId, id, version },
            data: { ...fields, price: dbDecimal(fields.price), version: { increment: 1 } },
          });
          return ok(count === 1);
        } catch (error) {
          if (isUniqueViolation(error)) return err('CODE_TAKEN' as const);
          throw error;
        }
      },
      async deleteItem(organizationId, libraryId, id, version) {
        const { count } = await tx.priceItem.deleteMany({
          where: { organizationId, libraryId, id, version },
        });
        return count === 1;
      },
    },
  };
}
