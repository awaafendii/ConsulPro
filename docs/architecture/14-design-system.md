# 14 — Design system

Package : `packages/ui` (`@consulpro/ui`). Documentation vivante : Storybook
(`pnpm --filter @consulpro/ui storybook`, http://localhost:6006).

## 1. Principes

| Principe                     | Traduction concrète                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| Interface d'ingénierie sobre | Peu de couleurs, une seule couleur d'action (bleu « ingénierie »), chiffres tabulaires, densité maîtrisée |
| Tokens, jamais de valeurs    | Toute couleur passe par un token. Un audit recherche les couleurs codées en dur (§6).                    |
| Accessible par construction  | WCAG 2.2 AA vérifié automatiquement (contrastes, axe sur chaque story, axe en navigateur réel sur chaque page) |
| Clavier d'abord              | Tout se fait au clavier : palette Ctrl+K, raccourcis, grille de données navigable et éditable             |
| Indépendant du framework     | Aucune dépendance à Next.js : les liens et la navigation sont injectés (`LinkProvider`, `NavigateProvider`) |
| Aucune formule               | Les composants de calcul affichent une `CalculationView` fournie par l'API (principe P5)                 |

## 2. Tokens

Définis dans `src/styles/globals.css`, en OKLCH, pour le thème clair (`:root`) et
le thème sombre (`.dark`). Le thème suit le système par défaut ; l'utilisateur peut
forcer clair ou sombre (`ThemeToggle`, mémorisé).

| Famille           | Tokens                                                                                                  | Usage                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Surfaces          | `background`, `card`, `popover`, `muted`, `accent`, `secondary`, `sidebar`, `sidebar-accent`             | Fonds                                       |
| Texte             | `foreground`, `*-foreground`, `muted-foreground`                                                         | Texte sur la surface correspondante         |
| Action            | `primary`, `primary-foreground`, `ring`                                                                  | Boutons principaux, liens, focus            |
| Statuts pleins    | `success`, `warning`, `info`, `destructive` (+ `-foreground`)                                            | Badges de statut, bouton destructif         |
| Statuts atténués  | `*-subtle`, `*-subtle-foreground`                                                                        | Encadrés, badges discrets                   |
| Contours          | `border` (décoratif), `input` (champs, ≥ 3:1)                                                            | Séparations, champs de saisie               |
| Rayons            | `--radius` (0,5 rem) → `rounded-sm/md/lg/xl`                                                             |                                             |
| Typographie       | `font-sans` : Inter (auto-hébergée) ; `font-mono` : JetBrains Mono ; chiffres tabulaires dans les tableaux |                                         |
| Mouvement         | `--duration-fast/normal/slow`, `ease-standard` ; neutralisé si `prefers-reduced-motion`                  |                                             |

**Contrôle automatique** : `src/styles/__tests__/contrast.test.ts` lit les tokens dans le
CSS et vérifie 28 paires dans chaque thème (texte ≥ 4,5:1, contours et focus ≥ 3:1).
Ratios actuels : de 5,5 à 17:1 pour le texte, 3,5:1 pour le contour des champs.

## 3. Composants

### 3.1 Primitives (shadcn/ui, adaptées)

Générées par la CLI shadcn (style « new-york », Radix UI) puis corrigées : imports
relatifs, typage strict, couleurs reliées aux tokens, textes d'accessibilité en français.

Bouton (variantes : principal, secondaire, contour, discret, destructif, lien ; état
`loading`), Badge (+ variantes `success`, `warning`, `info`, `muted`), Champ, Zone de
texte, Liste déroulante, Case à cocher, Interrupteur, Formulaire (React Hook Form),
Boîte de dialogue, Boîte d'alerte, Panneau latéral, Menu déroulant, Info-bulle,
Fenêtre contextuelle, Palette (cmdk), Onglets, Fil d'Ariane, Carte, Tableau simple,
Avatar, Squelette, Séparateur, Zone défilante, Touche (`Kbd`), Barre latérale.

### 3.2 Composants ConsulPro

| Composant                          | Rôle                                                                                         | États / accessibilité                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `AppShell`                         | Barre latérale + en-tête + espace de travail ; panneau « Navigation » sous 768 px             | Lien d'évitement, `<nav>` et `<main>` uniques, Ctrl+B, modules non livrés inactifs   |
| `CommandPalette`                   | Ctrl+K : navigation et actions                                                               | Entrées inactives avec leur raison ; pas de séparateur dans la liste (interdit dans un `listbox`) |
| `ShortcutsProvider`, `useShortcut` | Registre unique des raccourcis (combinaisons et séquences `g d`), aide sur `?`                | Lettres seules inactives dans un champ ; aide générée depuis le registre             |
| `DataTable`                        | Tri, filtre (sans accents), pagination par curseur, grille clavier, édition                   | Chargement / vide / erreur / nominal ; motif « grid » WAI-ARIA                       |
| `ConfirmProvider`, `useConfirm`    | Confirmation promise (`await confirm({...})`)                                                 | Focus piégé, Échap = annuler, titre nommant l'objet                                  |
| `Callout`, `EmptyState`, `ErrorState`, `LoadingState` | États et messages                                                         | `role="alert"` pour l'erreur, `role="status"` sinon ; référence de requête affichée |
| `PageHeader`, `Section`, `AuthLayout`, `Brand` | Mise en page                                                                       | Un seul `<h1>` par page                                                              |
| `OrganizationSwitcher`, `UserMenu`, `ThemeToggle` | Menus de la coquille                                                            | Noms accessibles explicites                                                          |
| `CalculationReport`                | Résultat de calcul : entrées, hypothèses, paramètres, résultats, vérifications, avertissements, trace | ERREUR et DONNÉES INVALIDES n'affichent aucune valeur ; « aperçu non enregistré » visible |
| `Formula`                          | LaTeX (KaTeX), `trust: false`                                                                | Sortie MathML lue par les lecteurs d'écran                                            |

### 3.3 Grille de données au clavier

| Touche                  | Effet                                                         |
| ----------------------- | ------------------------------------------------------------- |
| Flèches                 | Cellule voisine                                               |
| Début / Fin             | Début / fin de ligne (avec Ctrl : première / dernière cellule) |
| Page préc. / suiv.      | 10 lignes                                                     |
| Entrée ou F2            | Édite la cellule, ou donne le focus à son bouton              |
| Caractère               | Commence la saisie (cellule éditable)                         |
| Entrée (en édition)     | Valide et descend                                             |
| Tab / Maj+Tab (édition) | Valide et passe à droite / à gauche                           |
| Échap                   | Annule l'édition, ou revient du bouton à la cellule           |

## 4. Règles d'usage (apprises en testant)

1. Une `Popover` est une boîte de dialogue : donner un `aria-label` à `PopoverContent`.
2. La zone `<main>` est fournie par `AppShell` : ne jamais en ajouter une dans une page.
3. Dans une grille ou une liste flex, ajouter `min-w-0` / `grid-cols-1` pour que le contenu
   puisse rétrécir (sinon débordement horizontal sur mobile ou tablette).
4. Dates : dans l'application, formater avec next-intl (`useFormatter`, `getFormatter`),
   qui applique le fuseau configuré côté serveur ET navigateur ; les utilitaires
   `formatDate*` du package servent aux composants isolés.
5. Clés de traduction : pas de point dans une clé (next-intl l'interprète comme un niveau).
6. Textes : les composants du package ont des libellés français par défaut, que
   l'application remplace par ses messages (`apps/web/messages/fr.json`).

## 5. Ajouter un composant

1. Le créer dans `packages/ui/src/components/…` en n'utilisant que les tokens.
2. Écrire ses stories (tous ses états) dans `src/stories/`.
3. Il est alors automatiquement rendu et analysé par axe (`src/__tests__/stories.test.tsx`).
4. Ajouter des tests d'interaction s'il réagit au clavier ou à la souris.
5. L'exporter depuis `src/index.ts`.

## 6. Audit (Phase 2)

| Contrôle                                    | Résultat                                                         |
| ------------------------------------------- | ---------------------------------------------------------------- |
| Couleurs codées en dur dans les composants  | 0 (hors voile d'arrière-plan `bg-black/50` des boîtes modales)   |
| Contrastes des tokens (clair + sombre)      | 57 contrôles, tous conformes                                     |
| Stories                                     | 49, toutes analysées par axe sans violation                      |
| Tests du package                            | 136, couverture 89 % des lignes                                  |
| Pages réelles (navigateur, clair + sombre)  | 0 violation axe (WCAG 2.2 AA + bonnes pratiques)                 |
| Largeurs testées                            | 360, 768, 1280, 1920 px sans défilement horizontal               |

Défauts trouvés et corrigés pendant la phase : bouton et badge « destructifs » hors
tokens, palette sans nom accessible, séparateurs interdits dans la palette, deux
`<main>` imbriqués, barre latérale hors repère, textes d'accessibilité en anglais,
débordements à 360 et 768 px, page 404 sans titre `<h1>`, libellés d'audit non traduits.
