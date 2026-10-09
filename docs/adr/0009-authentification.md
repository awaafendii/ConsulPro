# ADR-0009 — Authentification (Better Auth)

**Statut** : Accepté — intégration validée en Phase 1 · **Date** : 2026-10-08

## Contexte

Besoins : e-mail et mot de passe, vérification d'e-mail, réinitialisation, 2FA TOTP,
sessions révocables stockées en base, intégration Prisma, sans dépendre d'un
fournisseur SaaS (localisation des données : question Q5).

## Décision

Better Auth, auto-hébergé, avec l'adaptateur Prisma et des sessions en base.
ConsulPro garde **sa propre** autorisation (RBAC dans `domain/access`) : la
bibliothèque ne fait que l'authentification.

## Intégration (Phase 1, 2026-10-08)

Better Auth 1.7.7 intégré et testé : inscription, vérification d'e-mail obligatoire avant
connexion, réinitialisation (révoque toutes les sessions), sessions en base, cookies
`HttpOnly`, limitation de débit stockée en base (5 tentatives / 15 min sur la connexion,
l'inscription et la réinitialisation), audit de chaque événement d'authentification.
Réglages notables : télémétrie désactivée explicitement, identifiants UUID v7 générés par
Prisma, endpoints inutilisés désactivés (connexion sociale, suppression de compte,
changement d'e-mail). La 2FA est reportée en Phase 3.

## Conséquences

- (+) Les données d'identité restent dans notre base ; aucune dépendance à un service externe.
- (−) Composant critique tiers : version épinglée, suivi des avis de sécurité.
- Si le spike de Phase 1 révèle un blocage, repli sur Auth.js et ses adaptateurs.

## Alternatives écartées

- **Auth.js** : moins adapté au mot de passe et à la 2FA.
- **Clerk, Auth0** : services externes (coût, localisation des données).
- **Implémentation maison** : risque de sécurité injustifié.
