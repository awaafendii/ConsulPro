/** Cellule et ligne d'un jeu de données (après validation), erreur rattachée à une cellule. */
export type CellValue = string | number | { readonly value: number; readonly unit: string } | null;
export type DatasetRow = Readonly<Record<string, CellValue>>;

export interface RowError {
  readonly row: number;
  readonly column: string;
  readonly message: string;
}
