# ConsulPro

> La plateforme métier des professionnels de la construction.

ConsulPro est une plateforme web destinée aux ingénieurs, techniciens et professionnels
de la construction. Elle couvre quatre métiers :

1. BTP / Génie civil
2. Électricité
3. Plomberie & Sanitaire
4. Topographie

Le **projet** est l'objet métier central : tous les calculs, études, imports, documents
et rapports lui sont rattachés.

ConsulPro **ne contient aucun module d'IA**. Tous les calculs et contrôles sont
déterministes, traçables et fondés sur des règles métier explicites et des
référentiels versionnés.

## État du projet

| Phase | Intitulé              | État                        |
| ----- | --------------------- | --------------------------- |
| 0     | Architecture          | Validée                     |
| 1     | Foundation            | Validée                     |
| 2     | Design System         | Validée                     |
| 3     | Projets               | **Terminée — en revue**     |
| 4     | BTP                   | À faire                     |
| 5     | Électricité           | À faire                     |
| 6     | Plomberie / Sanitaire | À faire                     |
| 7     | Topographie           | À faire                     |
| 8     | Imports / Documents   | À faire                     |
| 9     | Rapports              | À faire                     |
| 10    | Production            | À faire                     |

Aujourd'hui, l'application permet : comptes (vérification d'e-mail, double authentification
facultative, fuseau horaire), organisations, membres et transfert de propriété, journal d'audit ;
**projets** (membres, métiers, archivage, fil d'activité), **référentiels versionnés** (bibliothèque,
surcharges justifiées par organisation ou par projet), **études et calculs** exécutés par le serveur
en révisions immuables (comparaison, dépendances et obsolescence), contrôle à deux niveaux (l'auteur
valide, un autre ingénieur vérifie), données de projet versionnées, notifications et recherche.
Les seuls moteurs disponibles sont des moteurs de **démonstration, sans valeur technique**
(développement et test) ; les moteurs métier arrivent à partir de la Phase 4.

## Démarrage local

### Prérequis

- Node.js 24 (voir `.nvmrc`) et pnpm 9 (`corepack enable` ou installation globale)
- Docker Desktop (PostgreSQL 17 et Mailpit en conteneurs)

### Première installation

```bash
pnpm install
pnpm db:up                                   # PostgreSQL (port 5434) + Mailpit (ports 1025 / 8025)
cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example apps/web/.env.local # puis remplacer BETTER_AUTH_SECRET
pnpm db:deploy                               # applique les migrations
pnpm dev                                     # http://localhost:3000
```

Pour essayer les calculs en développement (`CONSULPRO_DEMO_ENGINES="true"` dans `.env.local`),
créez votre compte, puis publiez le référentiel de démonstration :

```bash
pnpm platform:grant-admin vous@exemple.com
pnpm standards:load packages/standards/seeds/demo/demo-1.json --publish-as vous@exemple.com
```

Les e-mails envoyés en développement (vérification, invitations, réinitialisation)
sont visibles dans Mailpit : <http://localhost:8025>.

### Commandes

| Commande                | Rôle                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| `pnpm dev`              | Application web en développement                                     |
| `pnpm typecheck`        | Vérification des types (tous les packages)                            |
| `pnpm lint`             | ESLint (dont la règle de pureté des moteurs de calcul)                |
| `pnpm depcruise`        | Règles de dépendances entre couches                                   |
| `pnpm test`             | Tests unitaires et de calcul, avec seuils de couverture               |
| `pnpm test:integration` | Tests d'intégration sur un PostgreSQL éphémère (Docker requis)        |
| `pnpm build`            | Build de production                                                   |
| `pnpm check`            | typecheck + lint + depcruise + tests unitaires                        |
| `pnpm --filter @consulpro/ui storybook` | Storybook du design system (http://localhost:6006)  |
| `pnpm --filter @consulpro/web test:e2e` | Tests E2E Playwright (après `pnpm build` ; base et Mailpit démarrés) |
| `pnpm db:migrate`       | Crée et applique une migration (développement)                        |
| `pnpm standards:load`   | Charge (et publie avec `--publish-as`) un référentiel JSON validé       |
| `pnpm platform:grant-admin` | Attribue le rôle d'administrateur de la plateforme              |

### Bases de données et rôles

- `consulpro` : rôle **propriétaire**, utilisé uniquement pour les migrations (`packages/db/.env`).
- `consulpro_app` : rôle **applicatif**, soumis à la sécurité au niveau des lignes (RLS) ; c'est
  le seul utilisé par l'application (`apps/web/.env.local`).

## Documentation

Point d'entrée : [`docs/README.md`](docs/README.md).
