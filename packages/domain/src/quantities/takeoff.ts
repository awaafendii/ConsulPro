import { err, ok, type Result } from '@consulpro/calc-core';

import type { DomainError } from '../errors';

/*
 * Avant-métré (03-modules.md §3.1) : structure des ouvrages d'un projet par lot, niveau et
 * ouvrage, à laquelle on rattache les calculs BTP. Le quantitatif en reprend la structure
 * (un nœud = un chapitre du DQE, avec son sous-total).
 *
 *   LOT (racine) ──▶ LEVEL ──▶ ELEMENT
 *        └────────────────────▶ ELEMENT
 */

export const TAKEOFF_NODE_KINDS = ['LOT', 'LEVEL', 'ELEMENT'] as const;
export type TakeoffNodeKind = (typeof TAKEOFF_NODE_KINDS)[number];

/** Nombre maximal de nœuds d'un avant-métré. */
export const TAKEOFF_MAX_NODES = 500;

const CHILDREN: Readonly<Record<TakeoffNodeKind | 'ROOT', readonly TakeoffNodeKind[]>> = {
  ROOT: ['LOT'],
  LOT: ['LEVEL', 'ELEMENT'],
  LEVEL: ['ELEMENT'],
  ELEMENT: [],
};

/** Un lot est à la racine ; un niveau dans un lot ; un ouvrage dans un lot ou un niveau. */
export function checkNesting(
  parent: TakeoffNodeKind | null,
  child: TakeoffNodeKind,
): Result<void, DomainError> {
  return CHILDREN[parent ?? 'ROOT'].includes(child)
    ? ok(undefined)
    : err({
        code: 'TAKEOFF_NESTING_INVALID',
        message:
          'Structure invalide : un lot est à la racine, un niveau dans un lot, un ouvrage dans un lot ou un niveau.',
      });
}

const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/;

/** Code d'un nœud (« 1 », « 2.1 », « GO-A ») : 1 à 20 caractères, lettres, chiffres, . _ -. */
export function validateNodeCode(value: string): Result<string, DomainError> {
  const code = value.trim();
  return CODE.test(code)
    ? ok(code)
    : err({
        code: 'TAKEOFF_CODE_INVALID',
        message: 'Code de 1 à 20 caractères : lettres, chiffres, point, tiret ou souligné.',
      });
}

/** Ordre naturel des codes (« 2 » avant « 10 », « 1.2 » avant « 1.10 »). */
export const compareNodeCodes = (a: string, b: string): number =>
  a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });

export interface TreeNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly code: string;
}

/**
 * Parcours en profondeur dans l'ordre naturel des codes : ordre du DQE et des sous-totaux.
 * Les nœuds dont le parent est absent sont ignorés (incohérence impossible en base).
 */
export function orderTree<N extends TreeNode>(nodes: readonly N[]): (N & { depth: number })[] {
  const children = new Map<string | null, N[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  const ordered: (N & { depth: number })[] = [];
  const visit = (parentId: string | null, depth: number) => {
    const siblings = [...(children.get(parentId) ?? [])].sort((a, b) =>
      compareNodeCodes(a.code, b.code),
    );
    for (const node of siblings) {
      ordered.push({ ...node, depth });
      visit(node.id, depth + 1);
    }
  };
  visit(null, 0);
  return ordered;
}

/** Ancêtres d'un nœud, du parent à la racine. */
export function ancestorsOf(nodes: readonly TreeNode[], id: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: string[] = [];
  let current = byId.get(id)?.parentId ?? null;
  while (current !== null && !chain.includes(current)) {
    chain.push(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return chain;
}
