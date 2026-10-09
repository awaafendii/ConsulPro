# 00 — Vision et principes

## 1. Produit

**ConsulPro** — « La plateforme métier des professionnels de la construction. »

Utilisateurs : ingénieurs, techniciens et professionnels de la construction, en priorité
en **Afrique francophone** (choix validé en Phase 0).

Métiers couverts : BTP / Génie civil, Électricité, Plomberie & Sanitaire, Topographie.

Le **Projet** est l'objet central. Un projet active un ou plusieurs métiers ; toutes les
données, études, calculs, imports, documents et rapports lui sont rattachés.

```
Projet : Construction d'un immeuble R+3
├── BTP
├── Électricité
├── Plomberie
├── Topographie
├── Documents
└── Rapports
```

Workflow principal :

```
Projet → Données → Étude → Calcul → Validation → Vérification → Quantitatif → Documentation → Rapport
```

## 2. Principes non négociables

| #   | Principe                                         | Conséquence concrète dans l'architecture                                                                                                                                                                                                   |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Aucune IA**                                    | Aucune dépendance à un fournisseur de modèle. Les suggestions (ex. mapping de colonnes à l'import) reposent sur des dictionnaires de synonymes explicites et des règles déterministes.                                                      |
| P2  | **Calculs déterministes**                        | Les moteurs sont des fonctions pures : mêmes entrées + mêmes paramètres + même version de moteur ⇒ même résultat. Interdits dans les moteurs : `Date`, `Math.random`, I/O, état global (voir [10](10-moteur-de-calcul.md)). |
| P3  | **Traçabilité totale**                           | Chaque révision de calcul conserve : auteur, date, entrées, sorties, paramètres (instantané), hypothèses, référentiel, version du référentiel, version du moteur, trace des formules appliquées.                                           |
| P4  | **Aucune hypothèse masquée**                     | Toute valeur par défaut appliquée par un moteur génère automatiquement une hypothèse visible. Tout paramètre non vérifié (`TO_VERIFY`) génère un avertissement sur chaque résultat qui l'utilise.                                          |
| P5  | **Formules hors de l'UI**                        | Les formules vivent uniquement dans les packages `calc-*`. Le résultat qui fait foi est toujours calculé côté serveur. Le navigateur peut exécuter le même package pour un aperçu instantané, explicitement marqué « aperçu non enregistré ». |
| P6  | **Paramètres normatifs hors du code UI**         | Les valeurs normatives vivent dans les référentiels (`Standard → StandardVersion → Parameter / Rule`), jamais dans les composants.                                                                                                          |
| P7  | **Aucune fonctionnalité fictive**                | Un module non livré apparaît désactivé avec la mention « Disponible en Phase N ». Pas de données factices présentées comme réelles. Les tableaux de bord n'affichent que des données réelles.                                              |
| P8  | **Pas de suppression sans analyse**              | Toute suppression de fonctionnalité passe par une analyse des dépendances (graphe de packages + usages) documentée dans la PR.                                                                                                             |
| P9  | **Une phase n'est close que testée et stable**   | Chaque phase possède des critères de sortie vérifiables ([07](07-roadmap.md)). On ne démarre pas la suivante avant de les avoir atteints.                                                                                                   |
| P10 | **Valeurs normatives sourcées**                  | Chaque paramètre cite sa source (document, article, tableau). Une valeur non confrontée au texte est marquée `TO_VERIFY` et signalée comme telle à l'utilisateur.                                                                          |

## 3. Interprétations du cahier des charges

Points où le cahier des charges laisse une marge d'interprétation. Ces choix sont
**proposés** et doivent être confirmés lors de la revue de la Phase 0.

| #   | Sujet                              | Interprétation retenue                                                                                                                                                                                                                                                       |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | « Validation » puis « Vérification » | **Validation** = l'auteur déclare son calcul terminé (« établi par »). **Vérification** = contrôle par un second utilisateur habilité, obligatoirement différent de l'auteur (« vérifié par », principe des quatre yeux). Le moteur, lui, fait de la validation d'entrées et de la vérification de conformité automatiques. |
| I2  | Périmètre du module BTP           | Le cahier des charges demande le **calcul des quantités** (métré). La Phase 4 couvre donc les quantitatifs (volumes, surfaces, coffrages, aciers par ratio ou nomenclature, matériaux). Le **dimensionnement structurel** (ferraillage BAEL / Eurocode 2) n'est pas demandé explicitement : l'architecture l'accueille, mais il est hors périmètre tant qu'il n'est pas confirmé. |
| I3  | Imports avant la Topographie       | La Topographie (Phase 7) a besoin d'imports XLSX/CSV/copier-coller, prévus en Phase 8. Le cœur du pipeline d'import est donc construit en Phase 7 avec la Topographie comme premier consommateur ; la Phase 8 le généralise aux autres métiers et ajoute les documents.          |
| I4  | Socle calcul et référentiels       | Le moteur partagé, l'historique versionné et le système de référentiels sont transverses : ils sont construits avant le premier métier (Phases 1 et 3), pas dans la Phase 4.                                                                                                       |
| I5  | Prix unitaires                     | Facultatifs. Bibliothèque de prix par organisation (devise par organisation, ex. XOF, XAF, EUR). Un quantitatif sans prix reste complet et exploitable.                                                                                                                      |
| I6  | Rôles                              | Les six rôles sont des rôles **d'organisation**. Un rôle **plateforme** distinct (`PlatformAdmin`) est nécessaire pour publier les référentiels système ; il n'appartient à aucune organisation.                                                                            |

## 4. Hors périmètre (sauf décision contraire)

- Tout module d'IA (exclu par le cahier des charges).
- Dimensionnement structurel béton armé (voir I2).
- Dessin DAO/CAO, maquette BIM/IFC.
- Transformations de coordonnées entre systèmes géodésiques (Clarke 1880, Adindan, WGS 84…) :
  les calculs topographiques travaillent en coordonnées planes d'un système déclaré par le projet.
- Application mobile native et mode hors ligne (l'interface web est responsive).
- Facturation / abonnements SaaS.

## 5. Questions ouvertes

À trancher avant ou pendant la phase indiquée. Aucune ne bloque la Phase 1.

| #   | Question                                                                                                                            | Phase concernée |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Q1  | Confirmer I1 (sens de Validation / Vérification) et s'il faut un troisième niveau « Approuvé par ».                                  | 3               |
| Q2  | Le dimensionnement structurel (BAEL 91 mod. 99) est-il attendu à terme ?                                                              | 4               |
| Q3  | Pays cibles prioritaires (Sénégal, Côte d'Ivoire, Cameroun, Mali…) : certaines normes nationales dérivent de la NF C 15-100.         | 5               |
| Q4  | Version de la NF C 15-100 à retenir comme référence (version 2002 et amendements, ou révision plus récente) ?                       | 5               |
| Q5  | Lieu d'hébergement des données (contraintes de lois nationales sur la protection des données personnelles).                          | 10              |
| Q6  | Qui fournira ou validera les cas de référence des calculs critiques ? (Un ingénieur du métier doit contre-vérifier.)                 | 4 à 7           |
