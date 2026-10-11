import { err, ok, type Result } from '@consulpro/calc-core';

import type { DomainError } from '../errors';
import type { Discipline } from './project';

export interface NewStudy {
  readonly discipline: Discipline;
  readonly title: string;
  readonly description?: string | undefined;
}

/** Une étude regroupe les calculs d'un métier activé sur le projet. */
export function validateStudy(
  input: NewStudy,
  projectDisciplines: readonly Discipline[],
): Result<NewStudy, DomainError> {
  const title = input.title.trim();
  if (title.length < 2 || title.length > 160) {
    return err({
      code: 'STUDY_TITLE_INVALID',
      message: 'L’intitulé doit comporter entre 2 et 160 caractères.',
    });
  }
  if (!projectDisciplines.includes(input.discipline)) {
    return err({
      code: 'STUDY_DISCIPLINE_INACTIVE',
      message: 'Ce métier n’est pas activé sur le projet.',
    });
  }
  const description = input.description?.trim();
  return ok({
    discipline: input.discipline,
    title,
    description: description ? description : undefined,
  });
}

/** Intitulé d'un calcul ou d'un jeu de données (2 à 160 caractères). */
export function validateTitle(value: string, code: string): Result<string, DomainError> {
  const title = value.trim();
  return title.length >= 2 && title.length <= 160
    ? ok(title)
    : err({ code, message: 'L’intitulé doit comporter entre 2 et 160 caractères.' });
}
