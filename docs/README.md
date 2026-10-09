# Documentation ConsulPro

## Architecture (Phase 0)

Livrables demandés, dans l'ordre :

| #   | Document                                                           | Contenu                                                        |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| 00  | [Vision et principes](architecture/00-vision-et-principes.md)     | Principes non négociables, interprétations, hors périmètre     |
| 01  | [Arborescence](architecture/01-arborescence.md)                   | Monorepo, packages, routes de l'application                    |
| 02  | [Modèle de données](architecture/02-modele-de-donnees.md)         | Entités, relations, invariants, ébauche Prisma                 |
| 03  | [Modules](architecture/03-modules.md)                             | Modules transverses et modules métier, moteurs par discipline  |
| 04  | [Dépendances](architecture/04-dependances.md)                     | Graphe interne, règles d'import, bibliothèques externes        |
| 05  | [Conventions](architecture/05-conventions.md)                     | Code, unités, API, base de données, git, glossaire FR → EN     |
| 06  | [Stratégie de tests](architecture/06-strategie-de-tests.md)       | Pyramide, cas de référence, matrice de permissions, CI         |
| 07  | [Roadmap](architecture/07-roadmap.md)                             | Phases 0 à 10, livrables, critères de sortie                   |

Approfondissements :

| #   | Document                                                                         |
| --- | -------------------------------------------------------------------------------- |
| 10  | [Moteur de calcul](architecture/10-moteur-de-calcul.md)                         |
| 11  | [Référentiels normatifs](architecture/11-referentiels.md)                        |
| 12  | [Sécurité et RBAC](architecture/12-securite-rbac.md)                             |
| 13  | [Pipelines d'import et de rapport](architecture/13-imports-et-rapports.md)       |
| 14  | [Design system](architecture/14-design-system.md)                                |

## Décisions d'architecture (ADR)

Voir [`adr/`](adr/). Toutes les ADR sont **acceptées** depuis la validation de la Phase 0 (2026-10-08).
