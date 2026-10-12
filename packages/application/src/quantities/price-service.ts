import { err, ok, type Result } from '@consulpro/calc-core';
import {
  boqUnitOf,
  formatDecimal,
  isCurrency,
  validateAmount,
  validateDesignation,
  workKeyOf,
  type BoqUnit,
} from '@consulpro/domain';

import { guarded, type OrgContext } from '../context';
import { appError, fromDomain, notFound, reread, staleVersion, type AppError } from '../errors';
import type { ApplicationDeps } from '../ports';
import type { PriceItemConflict, PriceItemRecord, PriceLibraryRecord } from '../ports-quantities';
import { auditBase, contextOf } from '../scope';

/** Ouvrage chiffrable : sortie d'un moteur qui alimente le DQE. */
export interface WorkItem {
  readonly workKey: string;
  readonly engineId: string;
  readonly engineTitle: string;
  readonly outputLabel: string;
  readonly unit: BoqUnit;
}

export interface PriceLibraryView {
  readonly library: PriceLibraryRecord;
  readonly items: readonly PriceItemRecord[];
}

export interface PriceItemInput {
  readonly code: string;
  readonly designation: string;
  readonly unit: BoqUnit;
  readonly price: string;
  readonly workKey?: string | null | undefined;
}

const nameTaken = () =>
  appError('CONFLICT', 'PRICE_LIBRARY_NAME_TAKEN', 'Une bibliothèque de prix porte déjà ce nom.');

const itemConflict = (conflict: PriceItemConflict) =>
  conflict === 'CODE_TAKEN'
    ? appError('CONFLICT', 'PRICE_CODE_TAKEN', 'Ce code de prix existe déjà dans la bibliothèque.')
    : appError(
        'CONFLICT',
        'PRICE_WORK_TAKEN',
        'Cet ouvrage a déjà un prix dans la bibliothèque (un prix par ouvrage).',
      );

function validateName(value: string): Result<string, AppError> {
  const name = value.trim();
  return name.length >= 2 && name.length <= 120
    ? ok(name)
    : err(
        appError(
          'VALIDATION',
          'PRICE_LIBRARY_NAME_INVALID',
          'Le nom doit comporter entre 2 et 120 caractères.',
        ),
      );
}

export function createPriceService({
  uow,
  ids,
  engines,
}: Pick<ApplicationDeps, 'uow' | 'ids' | 'engines'>) {
  /** Ouvrages des moteurs enregistrés (sorties d'ouvrage, unité de DQE). */
  function works(): WorkItem[] {
    return engines.list().flatMap((engine) =>
      engine.presentation.outputs.flatMap((output) => {
        const unit = boqUnitOf(output.unit);
        return output.family && output.family !== 'MATERIAL' && unit
          ? [
              {
                workKey: workKeyOf(engine.id, output.key),
                engineId: engine.id,
                engineTitle: engine.title,
                outputLabel: output.label,
                unit,
              },
            ]
          : [];
      }),
    );
  }

  /** Article validé ; un ouvrage impose son unité (celle de la ligne de DQE). */
  function validateItem(
    input: PriceItemInput,
  ): Result<Omit<PriceItemRecord, 'id' | 'libraryId' | 'version'>, AppError> {
    const code = input.code.trim();
    if (code.length < 1 || code.length > 40) {
      return err(appError('VALIDATION', 'PRICE_CODE_INVALID', 'Code de 1 à 40 caractères.'));
    }
    const designation = validateDesignation(input.designation);
    if (!designation.ok) return err(fromDomain(designation.error));
    const price = validateAmount(input.price, 'PRICE_INVALID');
    if (!price.ok) return err(fromDomain(price.error));
    const workKey = input.workKey ?? null;
    if (workKey !== null) {
      const work = works().find((w) => w.workKey === workKey);
      if (!work) {
        return err(appError('VALIDATION', 'PRICE_WORK_UNKNOWN', 'Ouvrage inconnu.'));
      }
      if (work.unit !== input.unit) {
        return err(
          appError(
            'VALIDATION',
            'PRICE_UNIT_MISMATCH',
            `Cet ouvrage se quantifie en ${work.unit} : le prix doit être exprimé dans la même unité.`,
          ),
        );
      }
    }
    return ok({
      code,
      designation: designation.value,
      unit: input.unit,
      price: price.value,
      workKey,
    });
  }

  return {
    works,

    async list(ctx: OrgContext): Promise<Result<PriceLibraryRecord[], AppError>> {
      return guarded(ctx, 'library.read', () =>
        uow.run(contextOf(ctx), async (repos) =>
          ok(await repos.prices.listLibraries(ctx.organization.id)),
        ),
      );
    },

    async get(ctx: OrgContext, libraryId: string): Promise<Result<PriceLibraryView, AppError>> {
      return guarded(ctx, 'library.read', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const library = await repos.prices.findLibrary(ctx.organization.id, libraryId);
          if (!library) return err(notFound('Bibliothèque de prix'));
          return ok({
            library,
            items: await repos.prices.listItems(ctx.organization.id, libraryId),
          });
        }),
      );
    },

    async create(
      ctx: OrgContext,
      input: { name: string; currency: string; validFrom?: string | null | undefined },
    ): Promise<Result<PriceLibraryRecord, AppError>> {
      return guarded(ctx, 'price.manage', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const orgId = ctx.organization.id;
          const name = validateName(input.name);
          if (!name.ok) return name;
          if (!isCurrency(input.currency)) {
            return err(appError('VALIDATION', 'CURRENCY_INVALID', 'Devise non prise en charge.'));
          }
          const id = ids.next();
          const created = await repos.prices.createLibrary({
            id,
            organizationId: orgId,
            name: name.value,
            currency: input.currency,
            validFrom: input.validFrom ?? null,
            createdById: ctx.actor.userId,
          });
          if (!created.ok) return err(nameTaken());
          await repos.audit.append({
            ...auditBase(ctx, orgId),
            action: 'price_library.created',
            targetType: 'price_library',
            targetId: id,
            metadata: { name: name.value, currency: input.currency },
          });
          return ok(reread(await repos.prices.findLibrary(orgId, id), 'Bibliothèque de prix'));
        }),
      );
    },

    async update(
      ctx: OrgContext,
      libraryId: string,
      input: {
        name?: string | undefined;
        currency?: string | undefined;
        validFrom?: string | null | undefined;
      },
      expectedVersion: number,
    ): Promise<Result<PriceLibraryRecord, AppError>> {
      return guarded(ctx, 'price.manage', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const orgId = ctx.organization.id;
          const library = await repos.prices.findLibrary(orgId, libraryId);
          if (!library) return err(notFound('Bibliothèque de prix'));
          if (library.version !== expectedVersion) return err(staleVersion());
          const name = validateName(input.name ?? library.name);
          if (!name.ok) return name;
          const currency = input.currency ?? library.currency;
          if (!isCurrency(currency)) {
            return err(appError('VALIDATION', 'CURRENCY_INVALID', 'Devise non prise en charge.'));
          }
          if (currency !== library.currency && library.itemCount > 0) {
            return err(
              appError(
                'CONFLICT',
                'PRICE_CURRENCY_LOCKED',
                'La bibliothèque contient des prix : sa devise ne change plus (aucune conversion).',
              ),
            );
          }
          const fields = {
            name: name.value,
            currency,
            validFrom: input.validFrom === undefined ? library.validFrom : input.validFrom,
          };
          const updated = await repos.prices.updateLibrary(
            orgId,
            libraryId,
            fields,
            expectedVersion,
          );
          if (!updated.ok) return err(nameTaken());
          if (!updated.value) return err(staleVersion());
          await repos.audit.append({
            ...auditBase(ctx, orgId),
            action: 'price_library.updated',
            targetType: 'price_library',
            targetId: libraryId,
            metadata: { ...fields, action: 'library_updated' },
          });
          return ok(
            reread(await repos.prices.findLibrary(orgId, libraryId), 'Bibliothèque de prix'),
          );
        }),
      );
    },

    /** Supprime une bibliothèque : les prix déjà reportés dans les quantitatifs y restent. */
    async remove(
      ctx: OrgContext,
      libraryId: string,
      expectedVersion: number,
    ): Promise<Result<void, AppError>> {
      return guarded(ctx, 'price.manage', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const orgId = ctx.organization.id;
          const library = await repos.prices.findLibrary(orgId, libraryId);
          if (!library) return err(notFound('Bibliothèque de prix'));
          if (!(await repos.prices.deleteLibrary(orgId, libraryId, expectedVersion))) {
            return err(staleVersion());
          }
          await repos.audit.append({
            ...auditBase(ctx, orgId),
            action: 'price_library.deleted',
            targetType: 'price_library',
            targetId: libraryId,
            metadata: { name: library.name, items: library.itemCount },
          });
          return ok(undefined);
        }),
      );
    },

    async addItem(
      ctx: OrgContext,
      libraryId: string,
      input: PriceItemInput,
    ): Promise<Result<PriceItemRecord, AppError>> {
      return guarded(ctx, 'price.manage', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const orgId = ctx.organization.id;
          const library = await repos.prices.findLibrary(orgId, libraryId);
          if (!library) return err(notFound('Bibliothèque de prix'));
          const item = validateItem(input);
          if (!item.ok) return item;
          const id = ids.next();
          const created = await repos.prices.createItem({
            ...item.value,
            id,
            libraryId,
            organizationId: orgId,
          });
          if (!created.ok) return err(itemConflict(created.error));
          await repos.audit.append({
            ...auditBase(ctx, orgId),
            action: 'price_library.updated',
            targetType: 'price_library',
            targetId: libraryId,
            metadata: {
              action: 'item_added',
              code: item.value.code,
              price: formatDecimal(item.value.price),
            },
          });
          return ok(reread(await repos.prices.findItem(orgId, libraryId, id), 'Prix'));
        }),
      );
    },

    async updateItem(
      ctx: OrgContext,
      libraryId: string,
      itemId: string,
      input: { [K in keyof PriceItemInput]?: PriceItemInput[K] | undefined },
      expectedVersion: number,
    ): Promise<Result<PriceItemRecord, AppError>> {
      return guarded(ctx, 'price.manage', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const orgId = ctx.organization.id;
          const current = await repos.prices.findItem(orgId, libraryId, itemId);
          if (!current) return err(notFound('Prix'));
          if (current.version !== expectedVersion) return err(staleVersion());
          const item = validateItem({
            code: input.code ?? current.code,
            designation: input.designation ?? current.designation,
            unit: input.unit ?? (current.unit as BoqUnit),
            price: input.price ?? formatDecimal(current.price),
            workKey: input.workKey === undefined ? current.workKey : input.workKey,
          });
          if (!item.ok) return item;
          const updated = await repos.prices.updateItem(
            orgId,
            libraryId,
            itemId,
            item.value,
            expectedVersion,
          );
          if (!updated.ok) return err(itemConflict(updated.error));
          if (!updated.value) return err(staleVersion());
          await repos.audit.append({
            ...auditBase(ctx, orgId),
            action: 'price_library.updated',
            targetType: 'price_library',
            targetId: libraryId,
            metadata: {
              action: 'item_updated',
              code: item.value.code,
              price: formatDecimal(item.value.price),
            },
          });
          return ok(reread(await repos.prices.findItem(orgId, libraryId, itemId), 'Prix'));
        }),
      );
    },

    async removeItem(
      ctx: OrgContext,
      libraryId: string,
      itemId: string,
      expectedVersion: number,
    ): Promise<Result<void, AppError>> {
      return guarded(ctx, 'price.manage', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const orgId = ctx.organization.id;
          const current = await repos.prices.findItem(orgId, libraryId, itemId);
          if (!current) return err(notFound('Prix'));
          if (!(await repos.prices.deleteItem(orgId, libraryId, itemId, expectedVersion))) {
            return err(staleVersion());
          }
          await repos.audit.append({
            ...auditBase(ctx, orgId),
            action: 'price_library.updated',
            targetType: 'price_library',
            targetId: libraryId,
            metadata: { action: 'item_removed', code: current.code },
          });
          return ok(undefined);
        }),
      );
    },
  };
}

export type PriceService = ReturnType<typeof createPriceService>;
