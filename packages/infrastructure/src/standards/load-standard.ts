import { err, ok, type Result } from '@consulpro/calc-core';
import type { Database, Prisma } from '@consulpro/db';
import {
  referenceValueOf,
  standardFileSchema,
  type ParameterDefinition,
} from '@consulpro/standards';

/*
 * Chargement d'un référentiel système depuis un fichier JSON (docs/architecture/11-referentiels.md).
 * Réservé à une connexion PROPRIÉTAIRE (CLI d'administration, tests) : le rôle applicatif ne peut
 * pas écrire de référentiel système (RLS). Le fichier est validé par `standardFileSchema`.
 */

export interface LoadResult {
  readonly standardVersionId: string;
  /** CREATED : nouvelle version ; DRAFT_REPLACED : brouillon remplacé ; UNCHANGED : déjà publiée. */
  readonly outcome: 'CREATED' | 'DRAFT_REPLACED' | 'UNCHANGED';
  readonly status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';
}

const unitOf = (p: ParameterDefinition) =>
  p.kind === 'SCALAR' ? p.unit : p.kind === 'TABLE' ? p.table.unit : null;

export async function loadStandard(
  db: Database,
  raw: unknown,
  options: { publishAs?: string } = {},
): Promise<Result<LoadResult, string>> {
  const parsed = standardFileSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((i) => `${i.path.join('.') || 'fichier'} : ${i.message}`).join('\n'),
    );
  }
  const file = parsed.data;

  let publisherId: string | null = null;
  if (options.publishAs) {
    const user = await db.user.findUnique({
      where: { email: options.publishAs.toLowerCase() },
      select: { id: true, platformRole: true },
    });
    if (user?.platformRole !== 'PLATFORM_ADMIN') {
      return err(`${options.publishAs} n’est pas administrateur de la plateforme.`);
    }
    publisherId = user.id;
  }

  return db.$transaction(async (tx) => {
    const existing = await tx.standard.findFirst({
      where: { organizationId: null, code: file.standard.code },
    });
    const standard = existing
      ? await tx.standard.update({
          where: { id: existing.id },
          data: {
            title: file.standard.title,
            publisher: file.standard.publisher ?? null,
            discipline: file.standard.discipline,
            nature: file.standard.nature,
          },
        })
      : await tx.standard.create({
          data: {
            code: file.standard.code,
            title: file.standard.title,
            publisher: file.standard.publisher ?? null,
            discipline: file.standard.discipline,
            nature: file.standard.nature,
          },
        });

    const current = await tx.standardVersion.findUnique({
      where: { standardId_label: { standardId: standard.id, label: file.version.label } },
    });
    // Une version publiée est immuable (ADR-0005) : la recharger ne change rien.
    if (current && current.status !== 'DRAFT') {
      return ok({ standardVersionId: current.id, outcome: 'UNCHANGED', status: current.status });
    }
    if (current) {
      await tx.parameter.deleteMany({ where: { standardVersionId: current.id } });
      await tx.rule.deleteMany({ where: { standardVersionId: current.id } });
    }
    const version =
      current ??
      (await tx.standardVersion.create({
        data: {
          standardId: standard.id,
          label: file.version.label,
          sourceNotes: file.version.sourceNotes ?? null,
        },
      }));
    if (current) {
      await tx.standardVersion.update({
        where: { id: current.id },
        data: { sourceNotes: file.version.sourceNotes ?? null },
      });
    }

    // Insertion une à une : l'ordre du fichier est conservé (identifiants UUID v7 croissants).
    for (const p of file.parameters) {
      await tx.parameter.create({
        data: {
          standardVersionId: version.id,
          key: p.key,
          label: p.label,
          kind: p.kind,
          value: referenceValueOf(p) as unknown as Prisma.InputJsonObject,
          unit: unitOf(p),
          source: p.source,
          verification: p.verification,
        },
      });
    }
    for (const r of file.rules) {
      await tx.rule.create({
        data: {
          standardVersionId: version.id,
          code: r.code,
          description: r.description,
          severity: r.severity,
          clause: r.clause ?? null,
          parameterKeys: r.parameterKeys,
          implementation: r.implementation,
        },
      });
    }

    if (publisherId) {
      await tx.standardVersion.update({
        where: { id: version.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: publisherId },
      });
    }
    return ok({
      standardVersionId: version.id,
      outcome: current ? 'DRAFT_REPLACED' : 'CREATED',
      status: publisherId ? 'PUBLISHED' : 'DRAFT',
    });
  });
}

/** Attribue ou retire le rôle d'administrateur de la plateforme (connexion propriétaire). */
export async function setPlatformAdmin(
  db: Database,
  email: string,
  admin: boolean,
): Promise<Result<void, string>> {
  const { count } = await db.user.updateMany({
    where: { email: email.toLowerCase() },
    data: { platformRole: admin ? 'PLATFORM_ADMIN' : 'NONE' },
  });
  return count === 1 ? ok(undefined) : err(`Aucun compte pour ${email}.`);
}
