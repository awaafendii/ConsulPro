import { err, ok, type Result } from '@consulpro/calc-core';

import type { DomainError } from '../errors';

/*
 * Circuit de contrôle à deux niveaux (décision du 2026-10-09, 02-modele-de-donnees.md §3.4) :
 *
 *   COMPUTED ──(l'auteur valide)──▶ VALIDATED ──(un autre utilisateur vérifie)──▶ VERIFIED
 *                                        └──(rejet motivé par le vérificateur)──▶ REJECTED
 *
 * Une révision rejetée ou remplacée ne se contrôle plus : on calcule une nouvelle révision.
 * La base applique les mêmes règles (trigger sur calculation_reviews).
 */

export const WORKFLOW_STATUSES = ['COMPUTED', 'VALIDATED', 'VERIFIED', 'REJECTED'] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export type ReviewType = 'VALIDATION' | 'VERIFICATION';
export type ReviewDecision = 'APPROVED' | 'REJECTED';
export type ResultStatus = 'OK' | 'OK_WITH_WARNINGS' | 'NON_COMPLIANT' | 'INVALID' | 'ERROR';

export interface ReviewRequest {
  readonly revision: {
    readonly workflowStatus: WorkflowStatus;
    readonly resultStatus: ResultStatus;
    readonly authorId: string;
    /** Révision courante du calcul (une révision remplacée ne se contrôle plus). */
    readonly isCurrent: boolean;
  };
  readonly reviewerId: string;
  readonly type: ReviewType;
  readonly decision: ReviewDecision;
  readonly comment: string;
}

const fail = (code: string, message: string) => err<DomainError>({ code, message });

/** Contrôle une décision de validation ou de vérification ; renvoie le nouveau statut. */
export function checkReview(request: ReviewRequest): Result<WorkflowStatus, DomainError> {
  const { revision, reviewerId, type, decision } = request;
  if (!revision.isCurrent) {
    return fail(
      'REVISION_SUPERSEDED',
      'Une révision plus récente existe : seule la révision courante se contrôle.',
    );
  }
  if (revision.resultStatus === 'INVALID' || revision.resultStatus === 'ERROR') {
    return fail(
      'REVISION_WITHOUT_RESULT',
      'Ce calcul n’a pas produit de résultat : corrigez les entrées et calculez de nouveau.',
    );
  }

  if (type === 'VALIDATION') {
    if (reviewerId !== revision.authorId) {
      return fail('VALIDATOR_NOT_AUTHOR', 'Seul l’auteur du calcul le valide.');
    }
    if (decision !== 'APPROVED') {
      return fail(
        'REVIEW_DECISION_INVALID',
        'L’auteur ne rejette pas son calcul : il le corrige et calcule une nouvelle révision.',
      );
    }
    if (revision.workflowStatus !== 'COMPUTED') {
      return fail('REVISION_NOT_COMPUTED', 'Cette révision a déjà été validée ou contrôlée.');
    }
    return ok('VALIDATED');
  }

  if (reviewerId === revision.authorId) {
    return fail(
      'VERIFIER_IS_AUTHOR',
      'La vérification doit être faite par une autre personne que l’auteur.',
    );
  }
  if (revision.workflowStatus !== 'VALIDATED') {
    return fail(
      'REVISION_NOT_VALIDATED',
      'Seule une révision validée par son auteur peut être vérifiée.',
    );
  }
  if (decision === 'REJECTED') {
    if (request.comment.trim().length < 3) {
      return fail('REJECTION_UNJUSTIFIED', 'Le motif du rejet est obligatoire.');
    }
    return ok('REJECTED');
  }
  return ok('VERIFIED');
}

/**
 * Un calcul est obsolète quand une révision dont il a repris un résultat n'est plus la
 * révision courante de son calcul (une nouvelle révision a été calculée depuis).
 */
export function isObsolete(
  dependencies: readonly {
    readonly sourceRevisionId: string;
    readonly sourceCurrentRevisionId: string | null;
  }[],
): boolean {
  return dependencies.some((d) => d.sourceCurrentRevisionId !== d.sourceRevisionId);
}
