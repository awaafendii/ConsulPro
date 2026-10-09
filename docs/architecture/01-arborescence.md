# 01 — Arborescence

## 1. Choix structurant

**Monorepo pnpm + Turborepo** ([ADR-0001](../adr/0001-monorepo-pnpm-turborepo.md)).

Les couches imposées par le cahier des charges sont des **packages distincts**. Une couche
ne peut importer que ce que son `package.json` déclare, ce qui rend les violations
impossibles à compiler, et `dependency-cruiser` le vérifie en CI
([ADR-0002](../adr/0002-couches-imposees-par-packages.md)).

```
UI                    apps/web (composants, pages)          ─┐
Application Services  packages/application                   │ dépend vers le bas uniquement
Domain                packages/domain                        │
Calculation Engines   packages/calc-core, calc-*            │
Infrastructure        packages/infrastructure, db           ─┘ (implémente les ports de l'application)
```

L'infrastructure **implémente** des interfaces (ports) déclarées par l'application :
l'application ne dépend jamais de Prisma, de S3 ou de Next.js.

## 2. Arborescence du dépôt

```
consulpro/
├── apps/
│   ├── web/                          # Next.js (App Router) : UI + adaptateurs HTTP
│   │   ├── src/
│   │   │   ├── app/                  # routes (voir §3)
│   │   │   │   └── api/v1/           # Route Handlers : adaptateurs minces → application
│   │   │   ├── features/             # UI par fonctionnalité (projects, calculations, topo…)
│   │   │   │   └── <feature>/
│   │   │   │       ├── components/
│   │   │   │       ├── hooks/        # hooks TanStack Query (appels API typés)
│   │   │   │       └── forms/        # React Hook Form + schémas Zod issus de contracts
│   │   │   ├── components/           # composants partagés propres à l'app (shell, nav)
│   │   │   ├── lib/                  # client API, query keys, formatage fr-FR
│   │   │   ├── stores/               # Zustand : état d'interface uniquement
│   │   │   ├── server/               # composition root : câblage application ↔ infrastructure
│   │   │   └── messages/             # textes d'interface (fr)
│   │   ├── e2e/                      # Playwright
│   │   └── next.config.ts
│   │
│   └── worker/                       # processus de jobs asynchrones (pg-boss)
│       └── src/
│           ├── jobs/                 # generate-report, run-import, purge-quarantine…
│           └── main.ts               # composition root du worker
│
├── packages/
│   ├── calc-core/                    # PUR — pipeline, unités, résultat, trace, erreurs
│   │   └── src/
│   │       ├── pipeline/             # run(): validation → calcul → vérification → résultat
│   │       ├── units/                # registre d'unités, conversions, types Quantity
│   │       ├── result/               # CalculationResult, Check, Warning, Hypothesis
│   │       ├── trace/                # enregistrement des étapes de calcul (formule + valeurs)
│   │       ├── params/               # ParameterRequirement, ResolvedParameterSet
│   │       └── registry/             # registre des moteurs (id → définition)
│   │
│   ├── calc-btp/                     # PUR — moteurs BTP (quantitatifs)
│   ├── calc-elec/                    # PUR — moteurs Électricité
│   ├── calc-plomberie/               # PUR — moteurs Plomberie & Sanitaire
│   ├── calc-topo/                    # PUR — moteurs Topographie
│   │   └── src/<engine>/             # même structure pour chaque moteur :
│   │       ├── schema.ts             #   entrées / sorties (Zod)
│   │       ├── engine.ts             #   calcul
│   │       ├── checks.ts             #   vérifications (règles)
│   │       ├── metadata.ts           #   formules (LaTeX), sources, paramètres requis
│   │       ├── CHANGELOG.md          #   historique de version du moteur
│   │       └── __tests__/
│   │           ├── engine.test.ts
│   │           └── reference-cases/  #   cas de référence vérifiables (JSON)
│   │
│   ├── standards/                    # PUR — modèle des référentiels, résolution des paramètres
│   │   └── src/
│   │       ├── model/                # Standard, StandardVersion, Parameter, Rule (types)
│   │       ├── resolve/              # version + surcharges org/projet → ResolvedParameterSet
│   │       └── seeds/                # données sourcées (JSON) par référentiel et version
│   │
│   ├── domain/                       # PUR — entités, invariants, politiques
│   │   └── src/
│   │       ├── organization/
│   │       ├── project/
│   │       ├── dataset/
│   │       ├── study/
│   │       ├── calculation/          # cycle de vie des révisions, validation/vérification
│   │       ├── quantity/             # quantitatifs, prix unitaires
│   │       ├── library/
│   │       ├── import/
│   │       ├── document/
│   │       ├── report/
│   │       └── access/               # rôles, permissions, matrice RBAC (source unique)
│   │
│   ├── application/                  # services applicatifs (cas d'usage) + ports
│   │   └── src/
│   │       ├── ports/                # interfaces : repositories, storage, queue, clock, audit
│   │       ├── <context>/            # un dossier par contexte, un fichier par cas d'usage
│   │       └── context/              # RequestContext (acteur, organisation, permissions)
│   │
│   ├── contracts/                    # schémas Zod des requêtes / réponses de l'API
│   │
│   ├── infrastructure/               # implémentations des ports
│   │   └── src/
│   │       ├── persistence/          # repositories Prisma (scopés par organisation)
│   │       ├── storage/              # S3 / MinIO, URLs signées, quarantaine
│   │       ├── queue/                # pg-boss
│   │       ├── auth/                 # adaptateur d'authentification
│   │       ├── mail/
│   │       ├── rate-limit/
│   │       └── audit/
│   │
│   ├── db/                           # Prisma : schema.prisma, migrations, seed, client
│   ├── importers/                    # parsing XLSX/CSV/presse-papiers, détection, mapping
│   ├── reports/                      # modèle de document + rendus PDF / DOCX / XLSX
│   ├── ui/                           # design system : tokens, shadcn/ui, composants génériques
│   ├── test-utils/                   # fabriques, fixtures, Postgres de test (Testcontainers)
│   ├── config-typescript/            # tsconfig partagés (strict)
│   └── config-eslint/                # règles ESLint partagées (dont restrictions des moteurs)
│
├── docker/
│   └── compose.dev.yml               # postgres, minio, mailpit
├── docs/
│   ├── architecture/
│   └── adr/
├── .github/workflows/                # CI
├── .dependency-cruiser.cjs           # règles de dépendances entre couches
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .nvmrc                            # Node 24 (LTS)
```

Packages publiés sous la portée interne `@consulpro/*` (ex. `@consulpro/calc-core`).

## 3. Routes de l'application (`apps/web/src/app`)

Segments d'URL en **français, sans accents** (visibles par l'utilisateur). Identifiants de
code en anglais.

```
app/
├── (public)/
│   ├── connexion/
│   ├── inscription/
│   ├── mot-de-passe-oublie/
│   └── invitation/[token]/
│
├── (workspace)/[orgSlug]/
│   ├── tableau-de-bord/
│   ├── projets/
│   │   ├── nouveau/
│   │   └── [projectId]/
│   │       ├── apercu/
│   │       ├── donnees/                 # jeux de données du projet
│   │       ├── btp/
│   │       │   ├── tableau-de-bord/
│   │       │   ├── avant-metre/
│   │       │   ├── [module]/            # terrassement, semelles, longrines, poteaux…
│   │       │   └── quantitatifs/
│   │       ├── electricite/
│   │       │   ├── tableau-de-bord/
│   │       │   └── [module]/            # bilan-puissance, chute-tension, sections…
│   │       ├── plomberie/
│   │       │   ├── tableau-de-bord/
│   │       │   └── [module]/            # eau-froide, debits, pertes-de-charge…
│   │       ├── topographie/
│   │       │   ├── tableau-de-bord/
│   │       │   └── [module]/            # points, polygonale, nivellement…
│   │       ├── etudes/[studyId]/
│   │       │   └── calculs/[calculationId]/
│   │       │       └── revisions/[revision]/
│   │       ├── imports/
│   │       ├── documents/
│   │       ├── rapports/
│   │       ├── membres/
│   │       ├── activite/
│   │       └── parametres/
│   ├── bibliotheque/
│   │   ├── referentiels/
│   │   ├── catalogues/                  # matériaux, sections, équipements
│   │   ├── formules/                    # générées depuis les métadonnées des moteurs
│   │   ├── unites/
│   │   └── prix/
│   └── organisation/
│       ├── membres/
│       ├── roles/
│       ├── journal-audit/
│       └── parametres/
│
└── api/v1/                              # voir conventions API (05)
    ├── organizations/…
    ├── projects/[projectId]/…
    ├── calculations/…
    └── …
```

Les pages `[module]` sont générées depuis un **registre de modules** (métadonnées :
discipline, moteur associé, phase de livraison). Un module non livré est rendu désactivé
(principe P7), jamais comme une page vide présentée comme fonctionnelle.
