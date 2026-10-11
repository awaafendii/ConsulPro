# ADR-0007 — Révisions de calcul immuables

**Statut** : Accepté · **Date** : 2026-10-08

## Contexte

Chaque calcul doit être versionné et conserver auteur, date, entrées, sorties,
paramètres, hypothèses, référentiel et version.

## Décision

- `Calculation` (calcul logique) → `CalculationRevision` (instantané immuable, numéroté).
- Chaque exécution crée une nouvelle révision. Aucune révision n'est modifiée ni supprimée.
- La validation et la vérification sont des enregistrements `CalculationReview`
  (append-only). Le statut de workflow en est dénormalisé par un trigger contrôlé.
- Les dépendances entre calculs (`CalculationDependency`) signalent l'obsolescence en aval.

## Conséquences

- (+) Historique fidèle et opposable ; comparaison de révisions.
- (+) Les rapports référencent des révisions exactes : ils sont reproductibles.
- (−) Plus de lignes en base. Une purge éventuelle relèverait d'une politique de
  rétention explicite, jamais d'un mécanisme automatique.

## Mise en œuvre (Phase 3)

- Le rôle applicatif n'a que SELECT et INSERT sur `calculation_revisions`,
  `calculation_reviews`, `calculation_dependencies` et `dataset_revisions`.
- Une révision naît au statut `COMPUTED` et au nom de l'utilisateur courant (RLS). Le trigger
  `apply_calculation_review` (SECURITY DEFINER) applique les règles du contrôle à deux niveaux
  (l'auteur valide la révision courante ; une autre personne la vérifie ou la rejette avec un motif)
  puis met à jour `workflow_status`, seule colonne modifiable, sous un drapeau de transaction.
- L'empreinte SHA-256 du snapshot de paramètres (JSON canonique) est stockée avec la révision.
- L'obsolescence est calculée à la lecture : une dépendance est obsolète quand la révision reprise
  n'est plus la révision courante de son calcul.
