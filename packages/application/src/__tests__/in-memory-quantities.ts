/**
 * Implémentation en mémoire des ports Avant-métré / Quantitatifs / Prix (tests unitaires).
 * Elle reproduit les contraintes d'unicité et la mise à jour optimiste de la base.
 */
import { err, ok } from '@consulpro/calc-core';

import type { RevisionRecord } from '../ports-calculations';
import type {
  BoqItemRecord,
  BoqRecord,
  PriceItemRecord,
  PriceLibraryRecord,
  QuantityRepositories,
  RevisionOutputs,
  TakeoffAssignmentRecord,
  TakeoffNodeRecord,
} from '../ports-quantities';
import type { CalculationState } from './in-memory-calculations';

export interface QuantityState {
  takeoffNodes: TakeoffNodeRecord[];
  takeoffAssignments: (TakeoffAssignmentRecord & {
    organizationId: string;
    projectId: string;
    assignedById: string;
  })[];
  boqs: Omit<BoqRecord, 'createdByName'>[];
  boqItems: (BoqItemRecord & { organizationId: string; projectId: string })[];
  priceLibraries: Omit<PriceLibraryRecord, 'itemCount'>[];
  priceItems: (PriceItemRecord & { organizationId: string })[];
}

/** Copie sans certaines propriétés. */
function without<T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !(keys as readonly PropertyKey[]).includes(key)),
  ) as Omit<T, K>;
}

export const emptyQuantityState = (): QuantityState => ({
  takeoffNodes: [],
  takeoffAssignments: [],
  boqs: [],
  boqItems: [],
  priceLibraries: [],
  priceItems: [],
});

export function quantityRepositories(
  s: QuantityState & CalculationState,
  now: () => Date,
): QuantityRepositories {
  const nameOf = (id: string) => s.users.find((u) => u.id === id)?.name ?? '';
  const outputsOf = (r: Omit<RevisionRecord, 'authorName'>): RevisionOutputs => {
    const calculation = s.calculations.find((c) => c.id === r.calculationId);
    const cases = r.presentation.referenceCases;
    return {
      revisionId: r.id,
      revisionNumber: r.number,
      calculationId: r.calculationId,
      calculationTitle: calculation?.title ?? '',
      engineId: r.engineId,
      resultStatus: r.resultStatus,
      workflowStatus: r.workflowStatus,
      outputs: r.outputs,
      outputPresentations: r.presentation.outputs,
      currentRevisionId: calculation?.currentRevisionId ?? null,
      engineVerified: cases !== undefined && cases.total > 0 && cases.checked === cases.total,
    };
  };
  const boqView = (b: QuantityState['boqs'][number]): BoqRecord => ({
    ...b,
    createdByName: nameOf(b.createdById),
  });
  const libraryView = (l: QuantityState['priceLibraries'][number]): PriceLibraryRecord => ({
    ...l,
    itemCount: s.priceItems.filter((i) => i.libraryId === l.id).length,
  });
  const item = (i: QuantityState['boqItems'][number]): BoqItemRecord =>
    without(i, 'organizationId', 'projectId');
  const priceItem = (i: QuantityState['priceItems'][number]): PriceItemRecord =>
    without(i, 'organizationId');

  return {
    takeoff: {
      listNodes: async (organizationId, projectId) =>
        s.takeoffNodes.filter(
          (n) => n.organizationId === organizationId && n.projectId === projectId,
        ),
      findNode: async (organizationId, projectId, id) =>
        s.takeoffNodes.find(
          (n) => n.organizationId === organizationId && n.projectId === projectId && n.id === id,
        ) ?? null,
      createNode: async (input) => {
        if (
          s.takeoffNodes.some(
            (n) =>
              n.projectId === input.projectId &&
              n.parentId === input.parentId &&
              n.code === input.code,
          )
        ) {
          return err('CODE_TAKEN');
        }
        s.takeoffNodes.push({ ...input, version: 1, createdAt: now() });
        return ok(undefined);
      },
      updateNode: async (organizationId, projectId, id, fields, version) => {
        const node = s.takeoffNodes.find(
          (n) => n.organizationId === organizationId && n.projectId === projectId && n.id === id,
        );
        if (!node || node.version !== version) return ok(false);
        if (
          s.takeoffNodes.some(
            (n) =>
              n.id !== id &&
              n.projectId === projectId &&
              n.parentId === node.parentId &&
              n.code === fields.code,
          )
        ) {
          return err('CODE_TAKEN');
        }
        s.takeoffNodes = s.takeoffNodes.map((n) =>
          n.id === id ? { ...n, ...fields, version: n.version + 1 } : n,
        );
        return ok(true);
      },
      deleteNode: async (organizationId, projectId, id, version) => {
        const before = s.takeoffNodes.length;
        s.takeoffNodes = s.takeoffNodes.filter(
          (n) =>
            !(
              n.organizationId === organizationId &&
              n.projectId === projectId &&
              n.id === id &&
              n.version === version
            ),
        );
        return s.takeoffNodes.length < before;
      },
      nodeUsage: async (_organizationId, id) => ({
        children: s.takeoffNodes.filter((n) => n.parentId === id).length,
        assignments: s.takeoffAssignments.filter((a) => a.nodeId === id).length,
        boqItems: s.boqItems.filter((i) => i.nodeId === id).length,
      }),
      listAssignments: async (organizationId, projectId) =>
        s.takeoffAssignments
          .filter((a) => a.organizationId === organizationId && a.projectId === projectId)
          .map((a) => ({ calculationId: a.calculationId, nodeId: a.nodeId })),
      assign: async (input) => {
        s.takeoffAssignments = [
          ...s.takeoffAssignments.filter((a) => a.calculationId !== input.calculationId),
          {
            calculationId: input.calculationId,
            nodeId: input.nodeId,
            organizationId: input.organizationId,
            projectId: input.projectId,
            assignedById: input.assignedById,
          },
        ];
      },
      unassign: async (organizationId, projectId, calculationId) => {
        const before = s.takeoffAssignments.length;
        s.takeoffAssignments = s.takeoffAssignments.filter(
          (a) =>
            !(
              a.organizationId === organizationId &&
              a.projectId === projectId &&
              a.calculationId === calculationId
            ),
        );
        return s.takeoffAssignments.length < before;
      },
      sources: async (organizationId, projectId) =>
        s.takeoffAssignments
          .filter((a) => a.organizationId === organizationId && a.projectId === projectId)
          .flatMap((a) => {
            const calculation = s.calculations.find((c) => c.id === a.calculationId);
            if (!calculation) return [];
            const current = s.revisions.find((r) => r.id === calculation.currentRevisionId);
            return [
              {
                calculationId: calculation.id,
                calculationTitle: calculation.title,
                engineId: calculation.engineId,
                nodeId: a.nodeId,
                current: current ? outputsOf(current) : null,
              },
            ];
          }),
    },

    boqs: {
      list: async (organizationId, projectId) =>
        s.boqs
          .filter((b) => b.organizationId === organizationId && b.projectId === projectId)
          .map(boqView),
      findById: async (organizationId, projectId, id) => {
        const boq = s.boqs.find(
          (b) => b.organizationId === organizationId && b.projectId === projectId && b.id === id,
        );
        return boq ? boqView(boq) : null;
      },
      lock: async (organizationId, projectId, id) => {
        const boq = s.boqs.find(
          (b) => b.organizationId === organizationId && b.projectId === projectId && b.id === id,
        );
        return boq ? boqView(boq) : null;
      },
      create: async (input) => {
        s.boqs.push({
          ...input,
          presentation: 'DETAILED',
          version: 1,
          syncedAt: null,
          createdAt: now(),
          updatedAt: now(),
        });
      },
      update: async (organizationId, projectId, id, fields, version) => {
        const found = s.boqs.some(
          (b) =>
            b.organizationId === organizationId &&
            b.projectId === projectId &&
            b.id === id &&
            b.version === version,
        );
        if (found) {
          s.boqs = s.boqs.map((b) =>
            b.id === id ? { ...b, ...fields, version: b.version + 1, updatedAt: now() } : b,
          );
        }
        return found;
      },
      bump: async (organizationId, id, syncedAt) => {
        s.boqs = s.boqs.map((b) =>
          b.organizationId === organizationId && b.id === id
            ? {
                ...b,
                version: b.version + 1,
                updatedAt: now(),
                syncedAt: syncedAt ?? b.syncedAt,
              }
            : b,
        );
      },
      delete: async (organizationId, projectId, id, version) => {
        const target = s.boqs.find(
          (b) =>
            b.organizationId === organizationId &&
            b.projectId === projectId &&
            b.id === id &&
            b.version === version,
        );
        if (!target) return false;
        s.boqs = s.boqs.filter((b) => b !== target);
        s.boqItems = s.boqItems.filter((i) => i.boqId !== id);
        return true;
      },
      listItems: async (organizationId, boqId) =>
        s.boqItems
          .filter((i) => i.organizationId === organizationId && i.boqId === boqId)
          .map(item),
      findItem: async (organizationId, boqId, id) => {
        const found = s.boqItems.find(
          (i) => i.organizationId === organizationId && i.boqId === boqId && i.id === id,
        );
        return found ? item(found) : null;
      },
      createManualItem: async (input) => {
        s.boqItems.push({
          ...input,
          origin: 'MANUAL',
          calculationId: null,
          outputKey: null,
          outputPart: '',
          groupDesignation: null,
          sourceRevisionId: null,
          workKey: null,
          overrideQuantity: null,
          overrideJustification: null,
          priceItemId: null,
          version: 1,
          createdAt: now(),
        });
      },
      createComputedItems: async (items) => {
        for (const input of items) {
          if (
            s.boqItems.some(
              (i) =>
                i.boqId === input.boqId &&
                i.calculationId === input.calculationId &&
                i.outputKey === input.outputKey &&
                i.outputPart === input.outputPart,
            )
          ) {
            throw new Error('Contrainte d’unicité (boq, calcul, sortie, entrée) violée');
          }
          s.boqItems.push({
            ...input,
            origin: 'CALCULATION',
            overrideQuantity: null,
            overrideJustification: null,
            unitPrice: null,
            priceItemId: null,
            version: 1,
            createdAt: now(),
          });
        }
      },
      updateComputedItems: async (organizationId, updates) => {
        const byId = new Map(updates.map((u) => [u.id, u.line]));
        s.boqItems = s.boqItems.map((i) => {
          const line = i.organizationId === organizationId ? byId.get(i.id) : undefined;
          return line
            ? {
                ...i,
                nodeId: line.nodeId,
                sourceRevisionId: line.sourceRevisionId,
                workKey: line.workKey,
                designation: line.designation,
                groupDesignation: line.groupDesignation,
                unit: line.unit,
                quantity: line.quantity,
                version: i.version + 1,
              }
            : i;
        });
      },
      deleteItems: async (organizationId, ids) => {
        s.boqItems = s.boqItems.filter(
          (i) => !(i.organizationId === organizationId && ids.includes(i.id)),
        );
      },
      updateItem: async (organizationId, boqId, id, changes, version) => {
        const found = s.boqItems.some(
          (i) =>
            i.organizationId === organizationId &&
            i.boqId === boqId &&
            i.id === id &&
            i.version === version,
        );
        if (!found) return false;
        s.boqItems = s.boqItems.map((i) => {
          if (i.id !== id) return i;
          const next = { ...i, version: i.version + 1 };
          if (changes.designation !== undefined) next.designation = changes.designation;
          if (changes.unit !== undefined) next.unit = changes.unit;
          if (changes.quantity !== undefined) next.quantity = changes.quantity;
          if (changes.override !== undefined) {
            next.overrideQuantity = changes.override?.quantity ?? null;
            next.overrideJustification = changes.override?.justification ?? null;
          }
          if (changes.unitPrice !== undefined) {
            next.unitPrice = changes.unitPrice;
            next.priceItemId = null;
          }
          return next;
        });
        return true;
      },
      setPrices: async (organizationId, entries) => {
        const byId = new Map(entries.map((e) => [e.id, e]));
        s.boqItems = s.boqItems.map((i) => {
          const entry = i.organizationId === organizationId ? byId.get(i.id) : undefined;
          return entry
            ? {
                ...i,
                unitPrice: entry.unitPrice,
                priceItemId: entry.priceItemId,
                version: i.version + 1,
              }
            : i;
        });
      },
      deleteItem: async (organizationId, boqId, id, version) => {
        const before = s.boqItems.length;
        s.boqItems = s.boqItems.filter(
          (i) =>
            !(
              i.organizationId === organizationId &&
              i.boqId === boqId &&
              i.id === id &&
              i.version === version
            ),
        );
        return s.boqItems.length < before;
      },
      revisionOutputs: async (organizationId, revisionIds) =>
        s.revisions
          .filter((r) => r.organizationId === organizationId && revisionIds.includes(r.id))
          .map(outputsOf),
      breakdownWorks: async (organizationId) => {
        const works = new Map<string, { workKey: string; unit: string; designation: string }>();
        for (const i of s.boqItems) {
          if (i.organizationId !== organizationId || i.outputPart === '' || !i.workKey) continue;
          if (!works.has(i.workKey)) {
            works.set(i.workKey, { workKey: i.workKey, unit: i.unit, designation: i.designation });
          }
        }
        return [...works.values()].sort((a, b) => a.workKey.localeCompare(b.workKey));
      },
    },

    prices: {
      listLibraries: async (organizationId) =>
        s.priceLibraries.filter((l) => l.organizationId === organizationId).map(libraryView),
      findLibrary: async (organizationId, id) => {
        const library = s.priceLibraries.find(
          (l) => l.organizationId === organizationId && l.id === id,
        );
        return library ? libraryView(library) : null;
      },
      createLibrary: async (input) => {
        if (
          s.priceLibraries.some(
            (l) => l.organizationId === input.organizationId && l.name === input.name,
          )
        ) {
          return err('NAME_TAKEN');
        }
        s.priceLibraries.push({ ...without(input, 'createdById'), version: 1, createdAt: now() });
        return ok(undefined);
      },
      updateLibrary: async (organizationId, id, fields, version) => {
        const library = s.priceLibraries.find(
          (l) => l.organizationId === organizationId && l.id === id,
        );
        if (!library || library.version !== version) return ok(false);
        if (
          s.priceLibraries.some(
            (l) => l.id !== id && l.organizationId === organizationId && l.name === fields.name,
          )
        ) {
          return err('NAME_TAKEN');
        }
        s.priceLibraries = s.priceLibraries.map((l) =>
          l.id === id ? { ...l, ...fields, version: l.version + 1 } : l,
        );
        return ok(true);
      },
      deleteLibrary: async (organizationId, id, version) => {
        const target = s.priceLibraries.find(
          (l) => l.organizationId === organizationId && l.id === id && l.version === version,
        );
        if (!target) return false;
        s.priceLibraries = s.priceLibraries.filter((l) => l !== target);
        const removed = new Set(s.priceItems.filter((i) => i.libraryId === id).map((i) => i.id));
        s.priceItems = s.priceItems.filter((i) => i.libraryId !== id);
        // Comme ON DELETE SET NULL : le prix reporté reste sur la ligne de quantitatif.
        s.boqItems = s.boqItems.map((i) =>
          i.priceItemId && removed.has(i.priceItemId) ? { ...i, priceItemId: null } : i,
        );
        return true;
      },
      listItems: async (organizationId, libraryId) =>
        s.priceItems
          .filter((i) => i.organizationId === organizationId && i.libraryId === libraryId)
          .map(priceItem),
      findItem: async (organizationId, libraryId, id) => {
        const found = s.priceItems.find(
          (i) => i.organizationId === organizationId && i.libraryId === libraryId && i.id === id,
        );
        return found ? priceItem(found) : null;
      },
      createItem: async (input) => {
        const siblings = s.priceItems.filter((i) => i.libraryId === input.libraryId);
        if (siblings.some((i) => i.code === input.code)) return err('CODE_TAKEN');
        if (input.workKey && siblings.some((i) => i.workKey === input.workKey)) {
          return err('WORK_KEY_TAKEN');
        }
        s.priceItems.push({ ...input, version: 1 });
        return ok(undefined);
      },
      updateItem: async (organizationId, libraryId, id, fields, version) => {
        const current = s.priceItems.find(
          (i) => i.organizationId === organizationId && i.libraryId === libraryId && i.id === id,
        );
        if (!current || current.version !== version) return ok(false);
        const siblings = s.priceItems.filter((i) => i.libraryId === libraryId && i.id !== id);
        if (siblings.some((i) => i.code === fields.code)) return err('CODE_TAKEN');
        if (fields.workKey && siblings.some((i) => i.workKey === fields.workKey)) {
          return err('WORK_KEY_TAKEN');
        }
        s.priceItems = s.priceItems.map((i) =>
          i.id === id ? { ...i, ...fields, version: i.version + 1 } : i,
        );
        return ok(true);
      },
      deleteItem: async (organizationId, libraryId, id, version) => {
        const before = s.priceItems.length;
        s.priceItems = s.priceItems.filter(
          (i) =>
            !(
              i.organizationId === organizationId &&
              i.libraryId === libraryId &&
              i.id === id &&
              i.version === version
            ),
        );
        if (s.priceItems.length < before) {
          s.boqItems = s.boqItems.map((i) =>
            i.priceItemId === id ? { ...i, priceItemId: null } : i,
          );
        }
        return s.priceItems.length < before;
      },
    },
  };
}
