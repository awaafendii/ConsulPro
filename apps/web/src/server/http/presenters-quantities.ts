import type {
  BoqItemView,
  BoqNodeView,
  BoqSummary,
  BoqView,
  BtpDashboard,
  PriceItemRecord,
  PriceLibraryRecord,
  PriceLibraryView,
  TakeoffNodeRecord,
  TakeoffView,
  WorkItem,
} from '@consulpro/application';
import { findUnit } from '@consulpro/calc-core';
import type {
  BoqDto,
  BoqItemDto,
  BoqSummaryDto,
  BoqUnitDto,
  BtpDashboardDto,
  CurrencyDto,
  MaterialRowDto,
  PriceItemDto,
  PriceLibraryDetailDto,
  PriceLibraryDto,
  SubtotalDto,
  TakeoffDto,
  TakeoffNodeDto,
} from '@consulpro/contracts';
import {
  effectiveQuantity,
  formatDecimal,
  type MaterialRow,
  type Subtotal,
} from '@consulpro/domain';

/*
 * DTO de l'avant-métré, des quantitatifs et des prix. Les décimales (BigInt en dix-millièmes)
 * deviennent des chaînes exactes ; aucun montant ne transite en flottant.
 */

const decimalOrNull = (value: bigint | null) => (value === null ? null : formatDecimal(value));

const subtotalDto = (s: Subtotal): SubtotalDto => ({
  amount: formatDecimal(s.amount),
  lines: s.lines,
  unpriced: s.unpriced,
});

export const takeoffNodeDto = (n: TakeoffNodeRecord & { depth?: number }): TakeoffNodeDto => ({
  id: n.id,
  parentId: n.parentId,
  kind: n.kind,
  code: n.code,
  title: n.title,
  depth: n.depth ?? 0,
  version: n.version,
});

export const takeoffDto = (t: TakeoffView): TakeoffDto => ({
  nodes: t.nodes.map(takeoffNodeDto),
  calculations: t.calculations.map((c) => ({
    id: c.id,
    title: c.title,
    engineId: c.engineId,
    studyId: c.studyId,
    studyTitle: c.studyTitle,
    nodeId: c.nodeId,
    current: c.current
      ? {
          number: c.current.number,
          resultStatus: c.current.resultStatus,
          workflowStatus: c.current.workflowStatus,
          createdAt: c.current.createdAt.toISOString(),
        }
      : null,
    obsolete: c.obsolete,
  })),
});

export const boqItemDto = (i: BoqItemView): BoqItemDto => ({
  id: i.id,
  nodeId: i.nodeId,
  origin: i.origin,
  calculationId: i.calculationId,
  outputKey: i.outputKey,
  outputPart: i.outputPart,
  groupDesignation: i.groupDesignation,
  sourceRevisionId: i.sourceRevisionId,
  workKey: i.workKey,
  designation: i.designation,
  unit: i.unit as BoqUnitDto,
  quantity: formatDecimal(i.quantity),
  overrideQuantity: decimalOrNull(i.overrideQuantity),
  overrideJustification: i.overrideJustification,
  effectiveQuantity: formatDecimal(effectiveQuantity(i)),
  unitPrice: decimalOrNull(i.unitPrice),
  priceItemId: i.priceItemId,
  amount: decimalOrNull(i.amount),
  version: i.version,
  source: i.source ? { ...i.source } : null,
});

const boqNodeDto = (n: BoqNodeView) => ({
  ...takeoffNodeDto(n),
  subtotal: subtotalDto(n.subtotal),
});

export const boqSummaryDto = (s: BoqSummary): BoqSummaryDto => ({
  id: s.boq.id,
  title: s.boq.title,
  currency: s.boq.currency as CurrencyDto,
  presentation: s.boq.presentation,
  version: s.boq.version,
  createdByName: s.boq.createdByName,
  syncedAt: s.boq.syncedAt?.toISOString() ?? null,
  createdAt: s.boq.createdAt.toISOString(),
  updatedAt: s.boq.updatedAt.toISOString(),
  total: subtotalDto(s.total),
  pending: { ...s.pending },
});

export const boqDto = (v: BoqView): BoqDto => ({
  ...boqSummaryDto(v),
  nodes: v.nodes.map(boqNodeDto),
  items: v.items.map(boqItemDto),
  groups: v.groups.map((g) => ({
    key: g.key,
    nodeId: g.nodeId,
    designation: g.designation,
    unit: g.unit as BoqUnitDto,
    quantity: formatDecimal(g.quantity),
    amount: decimalOrNull(g.amount),
    lines: g.lines,
    unpriced: g.unpriced,
    itemIds: [...g.itemIds],
  })),
});

export const materialRowDto = (r: MaterialRow): MaterialRowDto => ({
  key: r.key,
  label: r.label,
  unit: r.unit,
  unitDisplay: findUnit(r.unit)?.display ?? r.unit,
  precision: r.precision,
  additive: r.additive,
  total: r.total,
  contributions: r.contributions.map((c) => ({ ...c })),
});

export const priceLibraryDto = (l: PriceLibraryRecord): PriceLibraryDto => ({
  id: l.id,
  name: l.name,
  currency: l.currency as CurrencyDto,
  validFrom: l.validFrom,
  itemCount: l.itemCount,
  version: l.version,
  createdAt: l.createdAt.toISOString(),
});

export const priceItemDto = (i: PriceItemRecord): PriceItemDto => ({
  id: i.id,
  code: i.code,
  designation: i.designation,
  unit: i.unit as BoqUnitDto,
  price: formatDecimal(i.price),
  workKey: i.workKey,
  version: i.version,
});

export const priceLibraryDetailDto = (
  v: PriceLibraryView,
  works: readonly WorkItem[],
): PriceLibraryDetailDto => ({
  ...priceLibraryDto(v.library),
  items: v.items.map(priceItemDto),
  works: works.map((w) => ({ ...w })),
});

export const btpDashboardDto = (d: BtpDashboard): BtpDashboardDto => ({
  projects: d.projects.map((p) => ({
    project: { ...p.project },
    calculations: { ...p.calculations },
    takeoff: { ...p.takeoff },
    boqs: p.boqs.map((b) => ({
      id: b.id,
      title: b.title,
      currency: b.currency,
      total: subtotalDto(b.total),
      lots: b.lots.map((l) => ({
        id: l.id,
        code: l.code,
        title: l.title,
        subtotal: subtotalDto(l.subtotal),
      })),
      outdated: b.outdated,
    })),
  })),
  truncated: d.truncated,
  engines: { ...d.engines },
});
