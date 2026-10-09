# ADR-0008 — Jobs asynchrones sur PostgreSQL (pg-boss)

**Statut** : Accepté · **Date** : 2026-10-08

## Contexte

Les imports volumineux, la génération de rapports et les purges ne doivent pas bloquer
les requêtes HTTP.

## Décision

pg-boss (file de jobs stockée dans PostgreSQL), consommée par `apps/worker`. Les jobs
sont idempotents, rejouables et rattachés à une organisation.

## Conséquences

- (+) Aucune infrastructure supplémentaire (pas de Redis).
- (+) Le job est créé dans la même transaction que la donnée métier.
- (−) Débit inférieur à une file dédiée, mais largement suffisant pour les volumes
  visés. À réévaluer en Phase 10.

## Alternatives écartées

- **BullMQ** : nécessite Redis.
- **Traitement dans le Route Handler** : délais d'expiration, aucune reprise sur erreur.
