/*
 * Géométrie planaire partagée des moteurs topographiques (03-modules.md §3.4).
 * Conventions francophones : gisement compté depuis le Nord (axe Y) dans le sens horaire,
 * X vers l'Est, Y vers le Nord. Fonctions pures : aucune lecture de paramètre, aucune trace.
 */

export const TAU = 2 * Math.PI;

/** Hypothèse de convention commune à tous les moteurs topographiques. */
export const TOPO_HYPOTHESIS = {
  code: 'TOPO.ANGLE_CONVENTION',
  text: 'Gisements comptés depuis le Nord (axe Y) dans le sens horaire ; X vers l’Est, Y vers le Nord, Z en altitude. Angles en grades (gon) par défaut.',
} as const;

/** Ramène un angle (rad) dans l'intervalle [0 ; 2π). */
export function normalizeAngle(rad: number): number {
  const r = rad % TAU;
  const positive = r < 0 ? r + TAU : r;
  // Garde-fou flottant : −ε + 2π peut s'arrondir à 2π exactement, hors de [0 ; 2π).
  return positive >= TAU ? 0 : positive;
}

export interface Planar {
  readonly x: number;
  readonly y: number;
}

export interface JoinResult {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly distance: number;
  readonly bearing: number;
}

/**
 * Problème inverse (transformation) : accroissements, distance horizontale et gisement de A
 * vers B. Deux points confondus donnent une distance nulle et un gisement indéterminé (0 retenu).
 */
export function join(a: Planar, b: Planar): JoinResult {
  const deltaX = b.x - a.x;
  const deltaY = b.y - a.y;
  const distance = Math.hypot(deltaX, deltaY);
  const bearing = distance === 0 ? 0 : normalizeAngle(Math.atan2(deltaX, deltaY));
  return { deltaX, deltaY, distance, bearing };
}

export interface RadiateResult {
  readonly x: number;
  readonly y: number;
  readonly deltaX: number;
  readonly deltaY: number;
}

/**
 * Problème direct (rayonnement, point lancé) : coordonnées d'un point visé depuis A par un
 * gisement (rad) et une distance horizontale. ΔX = D·sin G, ΔY = D·cos G (Nord, sens horaire).
 */
export function radiate(a: Planar, bearing: number, distance: number): RadiateResult {
  const deltaX = distance * Math.sin(bearing);
  const deltaY = distance * Math.cos(bearing);
  return { x: a.x + deltaX, y: a.y + deltaY, deltaX, deltaY };
}
