# ADR-0010 — Stockage de fichiers compatible S3

**Statut** : Accepté · **Date** : 2026-10-08

## Contexte

Les imports, documents et rapports produisent des fichiers à stocker de façon sûre,
isolée par organisation, et sauvegardée.

## Décision

- API S3 (`@aws-sdk/client-s3`) : MinIO en développement ; S3, Cloudflare R2 ou un
  équivalent en production.
- Deux buckets : `quarantine` (dépôt) et `clean` (fichiers contrôlés).
- Upload et téléchargement par **URL signées** de courte durée, émises après contrôle
  de permission.
- Clés de stockage `org/{organizationId}/…/{uuid}`, sans le nom d'origine.
- Métadonnées (`FileObject`) en base : type détecté, taille, SHA-256, statut d'analyse.

## Conséquences

- (+) Fichiers hors de la base ; serveur web sans état.
- (+) Fournisseur interchangeable (choix d'hébergement ouvert : Q5).
- (−) La cohérence entre base et stockage est à gérer (purge des objets orphelins par
  un job planifié).
