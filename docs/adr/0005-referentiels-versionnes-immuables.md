# ADR-0005 — Référentiels versionnés immuables, snapshot des paramètres

**Statut** : Accepté · **Date** : 2026-10-08

## Contexte

Les paramètres normatifs ne doivent jamais être codés dans l'UI. Chaque calcul doit
conserver le référentiel, sa version, les paramètres et les hypothèses.

## Décision

- Modèle `Standard` → `StandardVersion` → `Parameter` / `Rule`
  ([11](../architecture/11-referentiels.md)).
- Une version publiée est **immuable** (trigger PostgreSQL). Toute correction passe par
  une nouvelle version.
- Chaque révision de calcul stocke le **snapshot complet** des paramètres résolus
  (surcharges comprises) et son hash, en plus de la référence à la version.
- Chaque paramètre a une source et un statut `VERIFIED` ou `TO_VERIFY`. Un paramètre
  `TO_VERIFY` génère un avertissement sur chaque résultat qui l'utilise.

## Conséquences

- (+) Une révision reste interprétable même si une surcharge d'organisation change plus tard.
- (+) La maturité des données normatives est visible de tous.
- (−) Stockage plus volumineux (un snapshot par révision, de l'ordre de quelques Ko) : acceptable.
