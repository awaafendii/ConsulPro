# 13 — Pipelines d'import et de rapport

## 1. Pipeline d'import

```
UPLOAD → DETECTION → MAPPING → VALIDATION → PREVIEW → IMPORT
```

Chaque étape fait avancer `ImportJob.status`. L'utilisateur peut revenir à l'étape
MAPPING tant que l'import n'est pas exécuté.

### 1.1 Sources

| Source               | Réception                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| XLSX                 | Upload par URL signée → quarantaine → contrôles ([12 §6](12-securite-rbac.md)) → lecture ExcelJS côté serveur     |
| CSV                  | Idem, lecture Papa Parse après détection de l'encodage                                                            |
| Copier-coller Excel  | Le presse-papiers fournit `text/plain` (TSV) et `text/html`. Le navigateur extrait un **tableau brut** (lignes × cellules texte) et l'envoie au serveur en JSON borné. |
| Copier-coller Word   | Le presse-papiers fournit `text/html` : extraction des `<table>` (cellules fusionnées signalées, jamais devinées). Repli sur `text/plain` avec tabulations. |

Le navigateur ne fait que de l'extraction syntaxique. **Toute** normalisation et toute
validation sont refaites côté serveur.

### 1.2 Détection (déterministe)

| Élément                  | Méthode                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Encodage (CSV)           | BOM, puis `chardet` ; candidats UTF-8 et Windows-1252                                                    |
| Délimiteur (CSV)         | Le délimiteur parmi `;`, `,`, tabulation, `|` qui donne le nombre de colonnes le plus constant             |
| Feuille (XLSX)           | Liste des feuilles ; choix par l'utilisateur, avec la première non vide proposée par défaut              |
| Ligne d'en-tête          | Première ligne majoritairement textuelle suivie de lignes majoritairement numériques ; toujours modifiable |
| Séparateur décimal       | Analyse des colonnes numériques (`1 234,56` contre `1,234.56`) ; une ambiguïté est **signalée**, jamais tranchée en silence |
| Format d'angle           | gon, degrés décimaux, DMS (`45°30'15"`, `45 30 15`) ; unité confirmée par l'utilisateur                  |

### 1.3 Mapping

- Champs cibles définis par le schéma du `kind` de jeu de données (ex. `TOPO_POINTS` :
  `pointId`, `x`, `y`, `z?`, `code?`, `description?`).
- Suggestion **par dictionnaire de synonymes** versionné (aucune IA, principe P1), par
  exemple `x ← X | E | Est | Easting | Coord X`, `pointId ← Matricule | Point | N° | Nom`.
- Transformations explicites et visibles : unité source, séparateur décimal, format d'angle.
- Mapping enregistrable comme modèle réutilisable (`ImportMappingTemplate`).

### 1.4 Validation

- Par ligne : schéma Zod du `kind` (types, bornes, champs requis).
- Entre lignes : doublons de matricule, cohérence des unités, valeurs aberrantes
  **signalées** (jamais corrigées automatiquement).
- Rapport : erreurs bloquantes et avertissements, par ligne et par colonne.

### 1.5 Aperçu et import

- Aperçu paginé (lignes en `ImportStagingRow`), erreurs surlignées, filtre « lignes en erreur ».
- Import **atomique** : création d'une nouvelle `DataSetRevision` en une transaction, ou rien.
  Les lignes en erreur bloquent l'import, sauf exclusion explicite par l'utilisateur
  (l'exclusion est tracée dans la révision).
- Gros fichiers : exécution dans le worker (pg-boss), progression visible, notification à la fin.
- Audit : source, nombre de lignes importées et exclues, mapping utilisé.

## 2. Pipeline de rapport

```
SÉLECTION → ASSEMBLAGE (modèle de document) → RENDU (PDF | DOCX | XLSX) → STOCKAGE → TÉLÉCHARGEMENT
```

### 2.1 Structure (imposée par le cahier des charges)

| Section          | Contenu                                                     | Origine                                   |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------- |
| Couverture       | Titre, projet, organisation, logo, date, indice de révision | Projet + modèle d'organisation            |
| Projet           | Identification, maître d'ouvrage, localisation              | Projet                                    |
| Auteur           | Établi par, validé par, vérifié par (avec dates)            | Révisions et revues                       |
| Objet            | Texte                                                       | Saisi par l'utilisateur                   |
| Données          | Entrées des calculs, jeux de données utilisés               | Révisions (figées)                        |
| Hypothèses       | Toutes les hypothèses, **sans filtrage possible**           | Révisions                                 |
| Méthodologie     | Référentiels et versions, formules utilisées                | Révisions + métadonnées des moteurs       |
| Calculs          | Trace des étapes (formules, substitutions)                  | Révisions                                 |
| Résultats        | Sorties, quantitatifs                                       | Révisions, quantitatifs                   |
| Contrôles        | Vérifications et statut, avertissements                     | Révisions                                 |
| Observations     | Texte                                                       | Saisi par l'utilisateur                   |
| Conclusion       | Texte                                                       | Saisi par l'utilisateur                   |

Les hypothèses et les avertissements **ne peuvent pas être retirés** d'un rapport
(principe P4). Une révision non vérifiée porte la mention « Non vérifié » sur chaque
page où elle apparaît.

### 2.2 Modèle de document intermédiaire

L'application assemble un `ReportDocument` (arbre JSON typé : sections, paragraphes,
tableaux, formules, valeurs avec unités, mentions). Chaque format a son **renderer**,
qui consomme ce même modèle :

| Format | Renderer                               | Usage                                         |
| ------ | -------------------------------------- | --------------------------------------------- |
| PDF    | Décision par spike en Phase 9          | Livrable officiel, mise en page figée          |
| DOCX   | `docx`                                 | Document modifiable par l'utilisateur          |
| XLSX   | ExcelJS                                | Données tabulaires : entrées, résultats, quantitatifs |

### 2.3 Reproductibilité

- Le `ReportRender` stocke l'instantané du `ReportDocument`, la liste des révisions
  sources et le fichier produit. Il est **immuable**.
- Régénérer un rapport à partir des mêmes révisions produit le même contenu.
- La génération est asynchrone (worker), auditée, et notifiée à la fin.
