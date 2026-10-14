import type {
  ActivityRecord,
  AuditRecord,
  CalculationSummary,
  DatasetListItem,
  ElecDashboard,
  PlumbingDashboard,
  LinkableOutput,
  DatasetRevisionRecord,
  NotificationRecord,
  RevisionSummary,
  RevisionView,
  StudyRecord,
  EffectiveParameter,
  InvitationRecord,
  MemberView,
  MyOrganization,
  OrganizationRecord,
  OverrideView,
  ProjectMemberView,
  ProjectView,
  StandardHeader,
  StandardRecord,
  StandardVersionDetail,
} from '@consulpro/application';
import {
  findUnit,
  type AnyEngine,
  type ParameterSource,
  type ParameterValue,
} from '@consulpro/calc-core';
import type {
  ActivityDto,
  AuditLogDto,
  CalculationDto,
  DatasetDto,
  DatasetKindDto,
  DatasetRevisionDto,
  ElecDashboardDto,
  PlumbingDashboardDto,
  EngineDto,
  NotificationDto,
  RevisionDto,
  RevisionSummaryDto,
  StudyDto,
  EffectiveParameterDto,
  InvitationDto,
  MemberDto,
  OrganizationDto,
  OverrideDto,
  ParameterValueDto,
  ProjectDto,
  ProjectMemberDto,
  StandardSummaryDto,
  StandardVersionDetailDto,
} from '@consulpro/contracts';
import type { DatasetKind } from '@consulpro/domain';
import { referenceValueOf } from '@consulpro/standards';

/** Conversion des enregistrements applicatifs en DTO d'API (dates ISO 8601 UTC). */

export const organizationDto = (o: MyOrganization): OrganizationDto => ({
  id: o.id,
  name: o.name,
  slug: o.slug,
  country: o.country,
  currency: o.currency,
  role: o.role,
  version: o.version,
  createdAt: o.createdAt.toISOString(),
});

export const organizationRefDto = (o: OrganizationRecord) => ({
  id: o.id,
  name: o.name,
  slug: o.slug,
});

export const memberDto = (m: MemberView): MemberDto => ({
  id: m.id,
  userId: m.userId,
  name: m.name,
  email: m.email,
  role: m.role,
  version: m.version,
  createdAt: m.createdAt.toISOString(),
});

export const invitationDto = (i: InvitationRecord): InvitationDto => ({
  id: i.id,
  email: i.email,
  role: i.role,
  status: i.status,
  expiresAt: i.expiresAt.toISOString(),
  createdAt: i.createdAt.toISOString(),
});

export const auditLogDto = (a: AuditRecord): AuditLogDto => ({
  id: a.id,
  action: a.action,
  actorUserId: a.actorUserId,
  targetType: a.targetType,
  targetId: a.targetId,
  metadata: { ...a.metadata },
  requestId: a.requestId,
  ip: a.ip,
  createdAt: a.createdAt.toISOString(),
});

// --- Projets et référentiels (Phase 3) ------------------------------------------------------

const iso = (date: Date | null) => (date === null ? null : date.toISOString());

export const projectDto = (p: ProjectView): ProjectDto => ({
  id: p.id,
  code: p.code,
  name: p.name,
  description: p.description,
  client: p.client,
  location: p.location,
  status: p.status,
  startDate: p.startDate,
  endDate: p.endDate,
  disciplines: [...p.disciplines],
  role: p.role,
  version: p.version,
  createdAt: p.createdAt.toISOString(),
  archivedAt: iso(p.archivedAt),
});

export const projectMemberDto = (m: ProjectMemberView): ProjectMemberDto => ({
  id: m.id,
  userId: m.userId,
  name: m.name,
  email: m.email,
  role: m.role,
  organizationRole: m.organizationRole,
  version: m.version,
  createdAt: m.createdAt.toISOString(),
});

export const activityDto = (a: ActivityRecord): ActivityDto => ({
  id: a.id,
  type: a.type,
  actorUserId: a.actorUserId,
  actorName: a.actorName,
  targetType: a.targetType,
  targetId: a.targetId,
  summary: { ...a.summary },
  createdAt: a.createdAt.toISOString(),
});

export const parameterValueDto = (v: ParameterValue): ParameterValueDto =>
  v.kind === 'TABLE'
    ? { kind: 'TABLE', table: { ...v.table } }
    : v.kind === 'ENUM'
      ? { ...v, allowed: [...v.allowed] }
      : { ...v };

/** Libellés d'affichage des unités employées par des valeurs de paramètres. */
export function unitsOf(values: readonly ParameterValue[]): Record<string, string> {
  const symbols = values.flatMap((v) =>
    v.kind === 'SCALAR'
      ? [v.unit]
      : v.kind === 'TABLE'
        ? [v.table.unit, ...v.table.axes.flatMap((a) => (a.kind === 'NUMERIC' ? [a.unit] : []))]
        : [],
  );
  return Object.fromEntries(symbols.map((s) => [s, findUnit(s)?.display ?? s]));
}

const headerDto = (s: StandardHeader) => ({
  id: s.id,
  code: s.code,
  title: s.title,
  publisher: s.publisher,
  discipline: s.discipline,
  nature: s.nature,
  scope: s.organizationId === null ? ('SYSTEM' as const) : ('ORGANIZATION' as const),
});

export const standardSummaryDto = (s: StandardRecord): StandardSummaryDto => ({
  ...headerDto(s),
  versions: s.versions.map((v) => ({
    id: v.id,
    label: v.label,
    status: v.status,
    publishedAt: iso(v.publishedAt),
    parameterCount: v.parameterCount,
    toVerifyCount: v.toVerifyCount,
  })),
});

const sourceDto = (s: ParameterSource) => ({
  document: s.document,
  ...(s.clause === undefined ? {} : { clause: s.clause }),
  ...(s.table === undefined ? {} : { table: s.table }),
  ...(s.note === undefined ? {} : { note: s.note }),
});

export const standardVersionDetailDto = (v: StandardVersionDetail): StandardVersionDetailDto => ({
  id: v.id,
  units: unitsOf(v.parameters.map(referenceValueOf)),
  standard: headerDto(v.standard),
  label: v.label,
  status: v.status,
  sourceNotes: v.sourceNotes,
  publishedAt: iso(v.publishedAt),
  parameters: v.parameters.map((p) => ({
    key: p.key,
    label: p.label,
    value: parameterValueDto(referenceValueOf(p)),
    source: sourceDto(p.source),
    verification: p.verification,
  })),
  // L'identifiant d'implémentation reste interne.
  rules: v.rules.map((r) => ({
    code: r.code,
    description: r.description,
    severity: r.severity,
    clause: r.clause,
    parameterKeys: [...r.parameterKeys],
  })),
});

export const overrideDto = (o: OverrideView): OverrideDto => ({
  id: o.id,
  scope: o.scope,
  projectId: o.projectId,
  standardVersionId: o.standardVersionId,
  standardCode: o.standardCode,
  standardVersionLabel: o.standardVersionLabel,
  key: o.key,
  label: o.label,
  value: parameterValueDto(o.value),
  referenceValue: parameterValueDto(o.referenceValue),
  justification: o.justification,
  createdByName: o.createdByName,
  version: o.version,
  updatedAt: o.updatedAt.toISOString(),
});

export const effectiveParameterDto = (p: EffectiveParameter): EffectiveParameterDto => ({
  key: p.key,
  label: p.label,
  value: parameterValueDto(p.value),
  referenceValue: parameterValueDto(p.referenceValue),
  source: sourceDto(p.source),
  verification: p.verification,
  origin: p.origin,
  justification: p.justification,
});

export const overrideList = (items: readonly OverrideView[]) => ({
  items: items.map(overrideDto),
  units: unitsOf(items.flatMap((o) => [o.value, o.referenceValue])),
});

// --- Études, calculs, données, compte (Phase 3, lots C et D) ---------------------------------

const display = (symbol: string) => findUnit(symbol)?.display ?? symbol;

export const studyDto = (s: StudyRecord): StudyDto => ({
  id: s.id,
  discipline: s.discipline,
  title: s.title,
  description: s.description,
  calculationCount: s.calculationCount,
  createdByName: s.createdByName,
  version: s.version,
  createdAt: s.createdAt.toISOString(),
});

/** Moteur et formulaire de saisie (présentation du moteur ; aucune formule). */
export const engineDto = (e: AnyEngine): EngineDto => ({
  id: e.id,
  version: e.version,
  title: e.title,
  discipline: e.discipline,
  description: e.presentation.description,
  inputs: e.presentation.inputs.map((i): EngineDto['inputs'][number] => {
    const common = {
      key: i.key,
      label: i.label,
      optional: i.optional === true,
      ...(i.help ? { help: i.help } : {}),
    };
    switch (i.kind) {
      case 'quantity':
        return {
          ...common,
          kind: 'quantity',
          unitKind: i.unitKind,
          units: i.units.map((symbol) => ({ symbol, display: display(symbol) })),
        };
      case 'enum':
        return { ...common, kind: 'enum', options: i.options.map((o) => ({ ...o })) };
      case 'integer':
        return { ...common, kind: 'integer', min: i.min };
      case 'list':
        return {
          ...common,
          kind: 'list',
          maxItems: i.maxItems,
          fields: i.fields.map((f) =>
            f.kind === 'quantity'
              ? {
                  kind: 'quantity' as const,
                  key: f.key,
                  label: f.label,
                  unitKind: f.unitKind,
                  units: f.units.map((symbol) => ({ symbol, display: display(symbol) })),
                }
              : { kind: 'integer' as const, key: f.key, label: f.label, min: f.min },
          ),
        };
      case 'dataset':
        return { ...common, kind: 'dataset', datasetKind: i.datasetKind };
    }
  }),
  outputs: e.presentation.outputs.map((o) => ({
    key: o.key,
    label: o.label,
    unit: o.unit,
    unitKind: findUnit(o.unit)?.kind ?? 'dimensionless',
    precision: o.precision,
    ...(o.family ? { family: o.family } : {}),
  })),
  referenceCases: { ...(e.referenceCases ?? { total: 0, checked: 0 }) },
  parameters: e.parameters.map((p) => ({ key: p.key, description: p.description })),
  hypotheses: e.hypotheses.map((h) => ({ ...h })),
});

export const revisionSummaryDto = (r: RevisionSummary): RevisionSummaryDto => ({
  id: r.id,
  number: r.number,
  resultStatus: r.resultStatus,
  workflowStatus: r.workflowStatus,
  authorName: r.authorName,
  createdAt: r.createdAt.toISOString(),
});

export const calculationDto = (c: CalculationSummary): CalculationDto => ({
  id: c.id,
  studyId: c.studyId,
  title: c.title,
  engineId: c.engineId,
  engineTitle: c.engineTitle,
  engineAvailable: c.engineAvailable,
  current: c.current ? revisionSummaryDto(c.current) : null,
  obsolete: c.obsolete,
  version: c.version,
  createdAt: c.createdAt.toISOString(),
});

export const revisionDto = (v: RevisionView): RevisionDto => ({
  ...revisionSummaryDto(v.revision),
  calculationId: v.revision.calculationId,
  isCurrent: v.isCurrent,
  parameterSnapshotHash: v.revision.parameterSnapshotHash,
  rawInputs: { ...v.revision.rawInputs },
  view: v.view,
  reviews: v.reviews.map((r) => ({
    id: r.id,
    type: r.type,
    decision: r.decision,
    comment: r.comment,
    reviewerName: r.reviewerName,
    createdAt: r.createdAt.toISOString(),
  })),
  dependencies: v.dependencies.map((d) => ({
    sourceCalculationId: d.sourceCalculationId,
    sourceCalculationTitle: d.sourceCalculationTitle,
    sourceRevisionNumber: d.sourceRevisionNumber,
    output: d.output,
    input: d.input,
    obsolete: d.obsolete,
  })),
  datasets: v.datasets.map((d) => ({
    input: d.input,
    datasetId: d.datasetId,
    datasetTitle: d.datasetTitle,
    datasetRevisionNumber: d.datasetRevisionNumber,
    rowCount: d.rowCount,
    obsolete: d.obsolete,
  })),
  can: { ...v.can },
});

export const datasetKindDto = (k: DatasetKind): DatasetKindDto => ({
  id: k.id,
  discipline: k.discipline,
  label: k.label,
  maxRows: k.maxRows,
  columns: k.columns.map((c) => {
    switch (c.type) {
      case 'quantity':
        return { ...c, units: c.units.map((symbol) => ({ symbol, display: display(symbol) })) };
      case 'choice':
        return { ...c, options: c.options.map((o) => ({ ...o })) };
      default:
        return { ...c };
    }
  }),
});

export const datasetDto = (d: DatasetListItem): DatasetDto => ({
  id: d.id,
  kind: d.kind,
  discipline: d.discipline,
  title: d.title,
  current: d.current
    ? {
        number: d.current.number,
        rowCount: d.current.rowCount,
        authorName: d.current.authorName,
        createdAt: d.current.createdAt.toISOString(),
      }
    : null,
  version: d.version,
  createdAt: d.createdAt.toISOString(),
});

export const datasetRevisionDto = (r: DatasetRevisionRecord): DatasetRevisionDto => ({
  id: r.id,
  number: r.number,
  rows: r.rows.map((row) => ({ ...row })),
  note: r.note,
  authorName: r.authorName,
  createdAt: r.createdAt.toISOString(),
});

export const notificationDto = (n: NotificationRecord): NotificationDto => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  readAt: iso(n.readAt),
  createdAt: n.createdAt.toISOString(),
});

/** Sortie réutilisable par liaison, avec sa grandeur (filtrage des entrées compatibles). */
export const linkableOutputDto = (o: LinkableOutput) => ({
  calculationId: o.calculationId,
  calculationTitle: o.calculationTitle,
  revisionNumber: o.revisionNumber,
  output: o.output,
  label: o.label,
  value: o.value,
  unit: o.unit,
  unitKind: findUnit(o.unit)?.kind ?? 'dimensionless',
});

export const elecDashboardDto = (d: ElecDashboard): ElecDashboardDto => ({
  projects: d.projects.map((p) => ({
    project: { ...p.project },
    calculations: { ...p.calculations },
    powerBalances: p.powerBalances.map((b) => ({ ...b })),
    nonCompliant: p.nonCompliant.map((c) => ({ ...c })),
  })),
  truncated: d.truncated,
  engines: { ...d.engines },
});

export const plumbingDashboardDto = (d: PlumbingDashboard): PlumbingDashboardDto => ({
  projects: d.projects.map((p) => ({
    project: { ...p.project },
    calculations: { ...p.calculations },
    flows: p.flows.map((f) => ({ ...f })),
    nonCompliant: p.nonCompliant.map((c) => ({ ...c })),
  })),
  truncated: d.truncated,
  engines: { ...d.engines },
});
