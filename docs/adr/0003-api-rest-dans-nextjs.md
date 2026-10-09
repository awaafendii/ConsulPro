# ADR-0003 — API REST `/api/v1` dans Next.js, contrats Zod

**Statut** : Accepté · **Date** : 2026-10-08

## Contexte

Le cahier des charges demande une « API structurée » en TypeScript. Il faut limiter
l'exploitation au départ (un seul service web) sans s'enfermer dans Next.js.

## Décision

- API REST versionnée `/api/v1`, exposée par des Route Handlers Next.js **minces** :
  validation Zod (`contracts`) → appel d'un service de `application` → réponse ou
  erreur RFC 9457.
- Les Server Components peuvent appeler directement les services applicatifs en
  lecture. L'autorisation étant dans `application`, aucun chemin ne la contourne.
- Pas de Server Actions pour les mutations métier : une seule surface d'API, testable
  et documentable.
- Une documentation OpenAPI est générée depuis les schémas Zod.

## Conséquences

- (+) Un seul déploiement web au départ.
- (+) Extraction possible vers un service autonome (Fastify, par exemple) sans réécrire
  `application` : seuls les adaptateurs changent.
- (−) Les traitements longs ne tournent pas dans les Route Handlers : ils passent par le
  worker (ADR-0008).

## Alternatives écartées

- **tRPC** : excellent typage de bout en bout, mais API moins standard pour de futures
  intégrations tierces.
- **Backend séparé dès le départ (NestJS)** : coût d'exploitation et duplication
  injustifiés à ce stade.
