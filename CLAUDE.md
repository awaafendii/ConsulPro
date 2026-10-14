# ConsulPro — instructions pour les sessions de développement

Plateforme métier des professionnels de la construction (BTP, Électricité, Plomberie &
Sanitaire, Topographie). Le **Projet** est l'objet central. Cible prioritaire :
Afrique francophone.

## Règles absolues

- **Aucun module d'IA** (ni chatbot, ni génération, ni suggestion). Les calculs sont déterministes et fondés sur des règles explicites.
- Aucune fonctionnalité fictive présentée comme fonctionnelle. Un module non livré s'affiche désactivé (« Disponible en Phase N »).
- Aucune hypothèse masquée. Toute valeur par défaut devient une hypothèse visible ; tout paramètre `TO_VERIFY` produit un avertissement.
- Aucune formule dans l'UI : formules dans `packages/calc-*` uniquement, et résultat officiel calculé côté serveur.
- Aucun paramètre normatif codé en dur : ils passent par les référentiels (`Standard → StandardVersion → Parameter / Rule`).
- Aucune valeur normative sans source ; sinon, elle est marquée `TO_VERIFY`.
- Ne jamais supprimer une fonctionnalité sans analyser ses dépendances.
- Ne jamais passer à la phase suivante si la phase courante n'est pas testée et stable.

## Architecture

Lire `docs/README.md` (documents 00 à 13 et ADR). Couches strictes, imposées par les packages
et vérifiées par `pnpm depcruise` :
`apps/web` (UI + adaptateurs HTTP) → `packages/application` → `packages/domain` → `packages/calc-*` ;
`packages/infrastructure` implémente les ports de `application`.

Conventions : `docs/architecture/05-conventions.md` (identifiants en anglais, UI en
français, unités SI internes, `Result` plutôt qu'exceptions, RFC 9457 pour les erreurs API,
If-Match obligatoire sur PATCH et DELETE).

- La matrice RBAC de `packages/domain/src/access/permissions.ts` doit rester identique au
  tableau de `docs/architecture/12-securite-rbac.md` (un test le vérifie).
- Toute nouvelle route API : l'ajouter au registre `apps/web/src/server/http/routes.ts`,
  créer le `route.ts` correspondant, et l'ajouter aux générateurs du test de matrice
  (`apps/web/src/__tests__/permissions.integration.test.ts`), sinon la CI échoue.
- Toute nouvelle table d'organisation : `organization_id NOT NULL` + politiques RLS dans la
  migration ; une table immuable doit révoquer UPDATE/DELETE au rôle `consulpro_app`.

## Commandes

`pnpm db:up` (PostgreSQL sur le port **5434**, Mailpit sur 8025) · `pnpm dev` ·
`pnpm check` · `pnpm test:integration` (Docker requis) · `pnpm build` · `pnpm db:migrate` ·
`pnpm --filter @consulpro/ui storybook` · `pnpm --filter @consulpro/web test:e2e` (après `pnpm build`) ·
`pnpm standards:load <json> [--publish-as <e-mail>]` · `pnpm platform:grant-admin <e-mail>`.

## Pièges connus

- Les outils d'édition convertissent les séquences `\uXXXX` en caractères réels : pour écrire
  une échappatoire Unicode littérale dans un fichier, la construire autrement (ex. `String.fromCharCode(92)`).
- Dans Next.js, `params` vaut `undefined` pour une route sans segment dynamique.
- Sous Git Bash (Windows), `curl -d` n'envoie pas l'UTF-8 : utiliser `--data-binary @fichier.json`.
- Interface : composants de `@consulpro/ui` uniquement (voir docs/architecture/14-design-system.md) ;
  textes dans `apps/web/messages/fr.json` (pas de point dans une clé) ; dates via next-intl.
- Un nouveau module : l'ajouter au registre `packages/domain/src/modules/registry.ts` ; relever
  `LATEST_DELIVERED_PHASE` à la fin de chaque phase (un test E2E vérifie chaque module disponible).
- Testing Library normalise les espaces du DOM : écrire les textes attendus avec des espaces simples.
- Radix Select peut émettre une valeur vide quand sa liste d'options change : ignorer `''` dans `onValueChange`.
- Une route de projet (`projectRoute`) déclare sa permission pour la matrice ; l'accès au projet et le
  rôle effectif sont contrôlés par `inProject` (application), puis par la RLS.
- Révisions, avis, dépendances, liens vers les jeux de données et révisions de données : insertion
  seule (pas d'UPDATE pour le rôle applicatif) ; ne jamais « corriger » une révision, en calculer une nouvelle.
- Moteurs de démonstration : `CONSULPRO_DEMO_ENGINES=true` (dev/test) ; refusés si l'environnement
  (`APP_ENV`, sinon `NODE_ENV`) est la production. Ils n'ont aucune valeur technique.
- Sous Git Bash, les longs heredocs contenant des apostrophes échouent parfois : écrire le script
  dans un fichier puis l'exécuter.
- Mutation (Stryker) : lanceur `command` obligatoire ; avec Vitest 5, le lanceur Vitest de Stryker
  n'active aucun mutant (tous « survivent »). Annoter un mutant équivalent par
  `// Stryker disable next-line <Mutateur>: raison`, jamais sans raison. Une seule campagne à la fois,
  et aucun `pnpm install` pendant qu'elle tourne : sinon des mutants « survivent » à tort.

## État des phases

| Phase | État |
| ----- | ---- |
| 0 — Architecture | Validée (2026-10-08) |
| 1 — Foundation   | Validée (2026-10-08) |
| 2 — Design System | Validée (2026-10-09) |
| 3 — Projets, calcul, référentiels | Validée (2026-10-11) |
| 4 — BTP (quantités) | Validée (2026-10-13) |
| 5 — Électricité | Validée (2026-10-13) |
| 6 — Plomberie & Sanitaire | Validée (2026-10-14) |
| 7 à 10           | À faire |

Critères de sortie de chaque phase : `docs/architecture/07-roadmap.md`.
