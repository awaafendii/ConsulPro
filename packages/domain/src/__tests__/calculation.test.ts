import { describe, expect, it } from 'vitest';

import { compareRevisions, flatten } from '../calculation/compare';
import { checkReview, isObsolete, type ReviewRequest } from '../calculation/workflow';
import { DATASET_KINDS, isDatasetKind, validateRows } from '../dataset/kinds';
import { validateStudy, validateTitle } from '../project/study';

const request = (
  patch: Partial<ReviewRequest> & { status?: ReviewRequest['revision']['workflowStatus'] } = {},
): ReviewRequest => ({
  revision: {
    workflowStatus: patch.status ?? 'COMPUTED',
    resultStatus: 'OK',
    authorId: 'auteur',
    isCurrent: true,
    ...patch.revision,
  },
  reviewerId: patch.reviewerId ?? 'auteur',
  type: patch.type ?? 'VALIDATION',
  decision: patch.decision ?? 'APPROVED',
  comment: patch.comment ?? '',
});

describe('circuit de contrôle à deux niveaux', () => {
  it('l’auteur valide, une autre personne vérifie', () => {
    expect(checkReview(request())).toEqual({ ok: true, value: 'VALIDATED' });
    expect(
      checkReview(request({ status: 'VALIDATED', type: 'VERIFICATION', reviewerId: 'verif' })),
    ).toEqual({ ok: true, value: 'VERIFIED' });
    expect(
      checkReview(
        request({
          status: 'VALIDATED',
          type: 'VERIFICATION',
          reviewerId: 'verif',
          decision: 'REJECTED',
          comment: 'Épaisseur erronée',
        }),
      ),
    ).toEqual({ ok: true, value: 'REJECTED' });
  });

  it.each([
    [
      'révision remplacée',
      request({
        revision: {
          workflowStatus: 'COMPUTED',
          resultStatus: 'OK',
          authorId: 'auteur',
          isCurrent: false,
        },
      }),
      'REVISION_SUPERSEDED',
    ],
    [
      'calcul sans résultat',
      request({
        revision: {
          workflowStatus: 'COMPUTED',
          resultStatus: 'INVALID',
          authorId: 'auteur',
          isCurrent: true,
        },
      }),
      'REVISION_WITHOUT_RESULT',
    ],
    ['validation par un tiers', request({ reviewerId: 'autre' }), 'VALIDATOR_NOT_AUTHOR'],
    ['l’auteur rejette', request({ decision: 'REJECTED' }), 'REVIEW_DECISION_INVALID'],
    ['double validation', request({ status: 'VALIDATED' }), 'REVISION_NOT_COMPUTED'],
    [
      'vérification par l’auteur',
      request({ status: 'VALIDATED', type: 'VERIFICATION' }),
      'VERIFIER_IS_AUTHOR',
    ],
    [
      'vérification avant validation',
      request({ type: 'VERIFICATION', reviewerId: 'verif' }),
      'REVISION_NOT_VALIDATED',
    ],
    [
      'rejet sans motif',
      request({
        status: 'VALIDATED',
        type: 'VERIFICATION',
        reviewerId: 'verif',
        decision: 'REJECTED',
        comment: ' ',
      }),
      'REJECTION_UNJUSTIFIED',
    ],
  ])('refuse : %s', (_label, req, code) => {
    expect(checkReview(req)).toMatchObject({ ok: false, error: { code } });
  });

  it('obsolescence : la révision reprise n’est plus la révision courante de sa source', () => {
    expect(isObsolete([])).toBe(false);
    expect(isObsolete([{ sourceRevisionId: 'r1', sourceCurrentRevisionId: 'r1' }])).toBe(false);
    expect(isObsolete([{ sourceRevisionId: 'r1', sourceCurrentRevisionId: 'r2' }])).toBe(true);
  });
});

describe('comparaison de révisions', () => {
  it('liste les valeurs qui diffèrent, par section', () => {
    const base = {
      inputs: { length: { value: 10, unit: 'm' }, tags: [] },
      parameters: [{ key: 'demo.waste_rate', value: { value: 5, unit: '%' } }],
      outputs: { area: 50 },
      checks: [{ rule: 'demo.max-area', status: 'PASS', measured: 50 }],
      resultStatus: 'OK',
      engineVersion: '1.0.0',
    };
    const diff = compareRevisions(base, {
      ...base,
      inputs: { length: { value: 12, unit: 'm' }, tags: [] },
      parameters: [{ key: 'demo.waste_rate', value: { value: 6, unit: '%' } }],
      outputs: { area: 60 },
      checks: [{ rule: 'demo.max-area', status: 'PASS' }],
    });
    expect(diff).toEqual([
      { section: 'inputs', path: 'length.value', before: 10, after: 12 },
      { section: 'parameters', path: 'demo.waste_rate.value', before: 5, after: 6 },
      { section: 'outputs', path: 'area', before: 50, after: 60 },
      { section: 'checks', path: 'demo.max-area.measured', before: 50, after: null },
    ]);
    expect(compareRevisions(base, base)).toEqual([]);
    expect(flatten([1, { a: undefined }])).toEqual(
      new Map([
        ['0', 1],
        ['1.a', null],
      ]),
    );
  });
});

describe('jeux de données typés', () => {
  it('valide et normalise les lignes', () => {
    expect(isDatasetKind('ROOMS')).toBe(true);
    expect(isDatasetKind('constructor')).toBe(false);
    expect(
      validateRows('ROOMS', [
        { name: '  Séjour ', area: { value: 24.5, unit: 'm2' }, height: null, extra: 'x' },
      ]),
    ).toEqual({
      ok: true,
      value: [{ name: 'Séjour', level: null, area: { value: 24.5, unit: 'm2' }, height: null }],
    });
  });

  it('signale chaque erreur, ligne par ligne', () => {
    const result = validateRows('ROOMS', [
      { name: '', area: { value: 10, unit: 'm2' } },
      { name: 3, area: { value: 'x', unit: 'm2' } },
      { name: 'Cuisine', level: 'x'.repeat(41), area: { value: 10, unit: 'm' } },
      { name: 'Bain', area: { value: -2, unit: 'm2' }, height: { value: 2.5, unit: 'km' } },
    ]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.map((e) => `${String(e.row)}:${e.column}`)).toEqual([
      '1:name',
      '2:name',
      '2:area',
      '3:level',
      '3:area',
      '4:area',
      '4:height',
    ]);
    const tooMany = validateRows(
      'ROOMS',
      Array.from({ length: DATASET_KINDS.ROOMS.maxRows + 1 }, () => ({})),
    );
    expect(tooMany).toMatchObject({ ok: false, error: [{ row: 0 }] });
  });
});

describe('études', () => {
  it('métier activé et intitulé obligatoires', () => {
    expect(
      validateStudy({ discipline: 'BTP', title: ' Dalles R+1 ', description: ' ' }, ['BTP']),
    ).toEqual({
      ok: true,
      value: { discipline: 'BTP', title: 'Dalles R+1', description: undefined },
    });
    expect(validateStudy({ discipline: 'ELEC', title: 'Bilan' }, ['BTP'])).toMatchObject({
      ok: false,
      error: { code: 'STUDY_DISCIPLINE_INACTIVE' },
    });
    expect(validateStudy({ discipline: 'BTP', title: 'x' }, ['BTP'])).toMatchObject({
      ok: false,
      error: { code: 'STUDY_TITLE_INVALID' },
    });
    expect(validateTitle(' Dalle ', 'X')).toEqual({ ok: true, value: 'Dalle' });
    expect(validateTitle('', 'CALCULATION_TITLE_INVALID')).toMatchObject({ ok: false });
  });
});
