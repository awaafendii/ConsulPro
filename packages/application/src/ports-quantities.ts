import type { OutputPresentation, Result } from '@consulpro/calc-core';
import type {
  BoqUnit,
  ComputedLine,
  Decimal,
  ResultStatus,
  TakeoffNodeKind,
  WorkflowStatus,
} from '@consulpro/domain';

/*
 * Ports de l'avant-métré, des quantitatifs et des bibliothèques de prix (Phase 4).
 * Décimales : entiers BigInt en dix-millièmes (`Decimal` du domaine), NUMERIC(18,4) en base.
 */

export interface TakeoffNodeRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly kind: TakeoffNodeKind;
  readonly code: string;
  readonly title: string;
  readonly version: number;
  readonly createdAt: Date;
}

export interface TakeoffAssignmentRecord {
  readonly calculationId: string;
  readonly nodeId: string;
}

/** Sorties d'une révision et présentation figée : de quoi produire lignes et matériaux. */
export interface RevisionOutputs {
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly calculationId: string;
  readonly calculationTitle: string;
  readonly engineId: string;
  readonly resultStatus: ResultStatus;
  readonly workflowStatus: WorkflowStatus;
  readonly outputs: Readonly<Record<string, unknown>> | null;
  readonly outputPresentations: readonly OutputPresentation[];
  /** Révision courante du calcul (une révision remplacée est périmée). */
  readonly currentRevisionId: string | null;
  /** Moteur contre-vérifié au moment du calcul. */
  readonly engineVerified: boolean;
}

/** Calcul rattaché à l'avant-métré, avec les sorties de sa révision courante. */
export interface TakeoffSourceRecord {
  readonly calculationId: string;
  readonly calculationTitle: string;
  readonly engineId: string;
  readonly nodeId: string;
  readonly current: RevisionOutputs | null;
}

export interface BoqRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly title: string;
  readonly currency: string;
  readonly version: number;
  readonly createdById: string;
  readonly createdByName: string;
  readonly syncedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type BoqItemOrigin = 'CALCULATION' | 'MANUAL';

export interface BoqItemRecord {
  readonly id: string;
  readonly boqId: string;
  readonly nodeId: string;
  readonly origin: BoqItemOrigin;
  readonly calculationId: string | null;
  readonly outputKey: string | null;
  readonly sourceRevisionId: string | null;
  readonly workKey: string | null;
  readonly designation: string;
  readonly unit: string;
  readonly quantity: Decimal;
  readonly overrideQuantity: Decimal | null;
  readonly overrideJustification: string | null;
  readonly unitPrice: Decimal | null;
  readonly priceItemId: string | null;
  readonly version: number;
  readonly createdAt: Date;
}

export interface NewManualItem {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly boqId: string;
  readonly nodeId: string;
  readonly designation: string;
  readonly unit: BoqUnit;
  readonly quantity: Decimal;
  readonly unitPrice: Decimal | null;
}

export interface NewComputedItem extends ComputedLine {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly boqId: string;
}

export interface ItemChanges {
  readonly designation?: string;
  readonly unit?: BoqUnit;
  readonly quantity?: Decimal;
  readonly override?: { readonly quantity: Decimal; readonly justification: string } | null;
  readonly unitPrice?: Decimal | null;
}

export interface PriceLibraryRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly currency: string;
  /** Date de validité (AAAA-MM-JJ), facultative. */
  readonly validFrom: string | null;
  readonly version: number;
  readonly itemCount: number;
  readonly createdAt: Date;
}

export interface PriceItemRecord {
  readonly id: string;
  readonly libraryId: string;
  readonly code: string;
  readonly designation: string;
  readonly unit: string;
  readonly price: Decimal;
  readonly workKey: string | null;
  readonly version: number;
}

export type PriceItemConflict = 'CODE_TAKEN' | 'WORK_KEY_TAKEN';

export interface QuantityRepositories {
  readonly takeoff: {
    listNodes(organizationId: string, projectId: string): Promise<TakeoffNodeRecord[]>;
    findNode(
      organizationId: string,
      projectId: string,
      id: string,
    ): Promise<TakeoffNodeRecord | null>;
    createNode(
      input: Omit<TakeoffNodeRecord, 'version' | 'createdAt'>,
    ): Promise<Result<void, 'CODE_TAKEN'>>;
    /** `ok(false)` : version attendue dépassée. */
    updateNode(
      organizationId: string,
      projectId: string,
      id: string,
      fields: { code: string; title: string },
      expectedVersion: number,
    ): Promise<Result<boolean, 'CODE_TAKEN'>>;
    deleteNode(
      organizationId: string,
      projectId: string,
      id: string,
      expectedVersion: number,
    ): Promise<boolean>;
    /** Ce qui empêche la suppression d'un nœud : enfants, calculs rattachés, lignes de DQE. */
    nodeUsage(
      organizationId: string,
      id: string,
    ): Promise<{ children: number; assignments: number; boqItems: number }>;
    listAssignments(organizationId: string, projectId: string): Promise<TakeoffAssignmentRecord[]>;
    /** Rattache (ou déplace) un calcul ; l'auteur du rattachement est l'utilisateur courant. */
    assign(input: {
      organizationId: string;
      projectId: string;
      calculationId: string;
      nodeId: string;
      assignedById: string;
    }): Promise<void>;
    unassign(organizationId: string, projectId: string, calculationId: string): Promise<boolean>;
    /** Calculs rattachés et sorties de leur révision courante. */
    sources(organizationId: string, projectId: string): Promise<TakeoffSourceRecord[]>;
  };
  readonly boqs: {
    list(organizationId: string, projectId: string): Promise<BoqRecord[]>;
    findById(organizationId: string, projectId: string, id: string): Promise<BoqRecord | null>;
    /** Verrouille le quantitatif pour la transaction (mises à jour en série). */
    lock(organizationId: string, projectId: string, id: string): Promise<BoqRecord | null>;
    create(input: {
      id: string;
      organizationId: string;
      projectId: string;
      title: string;
      currency: string;
      createdById: string;
    }): Promise<void>;
    update(
      organizationId: string,
      projectId: string,
      id: string,
      fields: { title: string; currency: string },
      expectedVersion: number,
    ): Promise<boolean>;
    /** Nouvelle version du contenu (synchronisation, prix) ; date de synchronisation éventuelle. */
    bump(organizationId: string, id: string, syncedAt?: Date): Promise<void>;
    delete(
      organizationId: string,
      projectId: string,
      id: string,
      expectedVersion: number,
    ): Promise<boolean>;
    listItems(organizationId: string, boqId: string): Promise<BoqItemRecord[]>;
    findItem(organizationId: string, boqId: string, id: string): Promise<BoqItemRecord | null>;
    createManualItem(item: NewManualItem): Promise<void>;
    createComputedItems(items: readonly NewComputedItem[]): Promise<void>;
    /** Champs calculés d'une ligne (synchronisation) ; prix et quantité retenue conservés. */
    updateComputedItems(
      organizationId: string,
      updates: readonly { id: string; line: ComputedLine }[],
    ): Promise<void>;
    deleteItems(organizationId: string, ids: readonly string[]): Promise<void>;
    updateItem(
      organizationId: string,
      boqId: string,
      id: string,
      changes: ItemChanges,
      expectedVersion: number,
    ): Promise<boolean>;
    setPrices(
      organizationId: string,
      entries: readonly { id: string; unitPrice: Decimal; priceItemId: string }[],
    ): Promise<void>;
    deleteItem(
      organizationId: string,
      boqId: string,
      id: string,
      expectedVersion: number,
    ): Promise<boolean>;
    /** Sorties des révisions demandées (lignes calculées, matériaux), avec leur calcul. */
    revisionOutputs(
      organizationId: string,
      revisionIds: readonly string[],
    ): Promise<RevisionOutputs[]>;
  };
  readonly prices: {
    listLibraries(organizationId: string): Promise<PriceLibraryRecord[]>;
    findLibrary(organizationId: string, id: string): Promise<PriceLibraryRecord | null>;
    createLibrary(input: {
      id: string;
      organizationId: string;
      name: string;
      currency: string;
      validFrom: string | null;
      createdById: string;
    }): Promise<Result<void, 'NAME_TAKEN'>>;
    updateLibrary(
      organizationId: string,
      id: string,
      fields: { name: string; currency: string; validFrom: string | null },
      expectedVersion: number,
    ): Promise<Result<boolean, 'NAME_TAKEN'>>;
    deleteLibrary(organizationId: string, id: string, expectedVersion: number): Promise<boolean>;
    listItems(organizationId: string, libraryId: string): Promise<PriceItemRecord[]>;
    findItem(
      organizationId: string,
      libraryId: string,
      id: string,
    ): Promise<PriceItemRecord | null>;
    createItem(
      input: Omit<PriceItemRecord, 'version'> & { organizationId: string },
    ): Promise<Result<void, PriceItemConflict>>;
    updateItem(
      organizationId: string,
      libraryId: string,
      id: string,
      fields: Omit<PriceItemRecord, 'id' | 'libraryId' | 'version'>,
      expectedVersion: number,
    ): Promise<Result<boolean, PriceItemConflict>>;
    deleteItem(
      organizationId: string,
      libraryId: string,
      id: string,
      expectedVersion: number,
    ): Promise<boolean>;
  };
}
