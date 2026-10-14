# ADR-0011 — Sorties ventilées et présentation du quantitatif

**Statut** : Accepté · **Date** : 2026-10-13

## Contexte

Un réseau de plomberie produit des linéaires de tubes de plusieurs matériaux et diamètres ; un
DQE de plomberie se chiffre diamètre par diamètre. Jusqu'en Phase 5, une sortie de moteur était
un nombre, et une ligne de quantitatif était identifiée par (calcul, sortie). Les dimensions
fabriquées viennent des référentiels (normes produits) : une liste de sorties figée dans le code
du moteur coderait en dur des valeurs normatives. Décision Q9 (2026-10-13) : une ligne par
matériau et diamètre comme méthode standard, une présentation agrégée par matériau au choix.

## Décision

- Une sortie peut être **ventilée** (`OutputPresentation.breakdown`) : sa valeur est une liste
  d'entrées `{ key, label, group, groupLabel, value }` (`breakdownSchema`, `calc-core`), par
  exemple `PPR_PN20-25` « Tube PPR PN20 Ø25 », groupe `PPR_PN20`.
- La vue d'un calcul affiche une ligne par entrée ; les liaisons d'entrées et les tableaux de
  bord n'utilisent que les sorties numériques.
- Une ligne de quantitatif est identifiée par **(calcul, sortie, entrée)** (`boq_items.output_part`,
  vide pour une sortie simple) ; son ouvrage est `<moteur>.<sortie>:<entrée>`, clé des prix.
- La **présentation** du DQE (`DETAILED` | `AGGREGATED`) est un paramètre du quantitatif, sous
  If-Match. En présentation agrégée, les entrées d'un même groupe d'un calcul et d'un nœud se
  présentent en une ligne (quantités et montants additionnés, sans prix unitaire). Les données
  restent ligne par ligne ; les exports (Phase 9) appliqueront la même présentation.
- Une bibliothèque de prix vise une entrée ventilée connue : les variantes proposées sont celles
  déjà présentes dans les quantitatifs de l'organisation.

## Conséquences

- (+) Aucune dimension codée en dur : les entrées suivent le référentiel des tubes.
- (+) Le même mécanisme servira aux aciers par diamètre (BTP) ou aux appareils par type.
- (−) Une variante n'est chiffrable dans une bibliothèque qu'après son apparition dans un
  quantitatif de l'organisation.
- (−) La base contrôle la cohérence entrée / groupe (`boq_items_part_check`).

## Alternatives écartées

- Un total par calcul (comme les aciers BTP en Phase 4) : inutilisable pour chiffrer des tubes.
- Une sortie par diamètre déclarée dans le moteur : dimensions normatives codées en dur.
- Une ligne de DQE par tronçon : DQE illisible, prix répétés.
