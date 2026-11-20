# ADR-0012 — Stockage des lignes de jeux de données en `jsonb`

**Statut** : Accepté · **Date** : 2026-11-19

## Contexte

Un jeu de données (Phase 3) est typé et versionné : chaque enregistrement crée une révision
immuable dont les lignes sont validées par le type (`validateRows`, domaine). Les types vont de
quelques lignes (pièces d'un bâtiment, tronçons) à un levé topographique de **50 000 points**
(`TOPO_POINTS.maxRows = 50 000`). La table `dataset_revisions` stocke les lignes dans une unique
colonne `rows JSONB NOT NULL` (migration `20261009090000`). La Phase 7 demande de mesurer les
performances sur un levé de 50 000 points et de trancher ce choix de stockage (critère de
sortie #3, [07-roadmap](../architecture/07-roadmap.md)).

Chaque ligne est un objet hétérogène selon le type (texte, grandeur `{ value, unit }`, choix,
nombre). Les lignes ne sont jamais modifiées en place (le rôle applicatif n'a ni UPDATE ni DELETE
sur `dataset_revisions`) ; une révision est lue et écrite comme un tout, consommée par les moteurs
de calcul, pas éditée cellule par cellule côté serveur.

## Décision

- Les lignes d'une révision restent dans **une seule colonne `jsonb`** (tableau d'objets), et non
  dans une table normalisée « une ligne par point ».
- Le plafond par type (`maxRows`) borne la taille ; l'import valide jusqu'à `maxRows` (la saisie
  reste plafonnée à 5 000 lignes par les contrats).
- Mesure de référence (chemin d'import pur : lecture → rapprochement → coercition → validation,
  `packages/importers/src/__tests__/perf.test.ts`) sur **50 000 points** : **≈ 265 ms** et un blob
  **≈ 7,1 Mio**, très en deçà de la limite d'un champ `jsonb` PostgreSQL (1 Gio). Le test garde un
  budget large comme garde-fou anti-régression.

## Conséquences

- (+) Écriture et lecture d'une révision en une seule opération, cohérentes avec l'immuabilité et
  l'indexation `(dataset_id, number)` existantes.
- (+) Aucun schéma par type à maintenir : la forme des lignes suit le `DatasetKind` du domaine.
- (+) Les moteurs reçoivent le tableau complet sans jointure ni réassemblage.
- (−) Pas de requête SQL ligne à ligne (filtrer, agréger un point précis) : hors besoin actuel ;
  l'analyse topographique se fait dans les moteurs purs sur le tableau chargé.
- (−) L'UI ne doit pas charger 50 000 lignes dans un tableau éditable : la saisie tabulaire vise
  les petits jeux, les grands arrivent par import (aperçu échantillonné), et la consultation d'un
  gros levé passe par le calcul, pas par un rendu exhaustif.

## Alternatives écartées

- **Table normalisée `dataset_rows`** (une ligne par point, colonnes typées) : colonnes variables
  selon le type, jointures et réassemblage à chaque lecture, et bénéfice nul tant qu'aucune requête
  ligne à ligne n'est requise. À reconsidérer si un besoin d'interrogation par point apparaît.
- **Fichier externe (stockage blob)** : perdrait l'immuabilité transactionnelle et la RLS de la
  base ; réservé aux documents (voir [ADR-0010](0010-stockage-fichiers.md)).
