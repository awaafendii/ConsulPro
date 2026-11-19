# Corpus de fixtures d'import

Jeux d'essai versionnés du cœur d'import (Phase 7, critère de sortie
[07 §Phase 7](../../../docs/architecture/07-roadmap.md), spécifié par
[06 §5](../../../docs/architecture/06-strategie-de-tests.md)). Chaque fichier
exerce une difficulté réelle de lecture, de rapprochement ou de coercition.
Parcourus par `src/__tests__/fixtures.test.ts`.

| Fichier | Difficulté couverte |
| --- | --- |
| `rooms-fr-win1252.csv` | CSV « Excel FR » : encodage Windows-1252, séparateur `;`, virgule décimale, accents |
| `rooms-utf8-bom.csv` | CSV UTF-8 avec marque d'ordre des octets (BOM), séparateur `,` |
| `points-excel-paste.tsv` | Collage Excel : valeurs séparées par tabulations, espaces de milliers |
| `observations-word.html` | Collage Word : tableau HTML, entités (`&#233;`) |
| `observations-angles.csv` | Angles en degrés-minutes-secondes et en décimal (gon) |
| `rooms-formula-injection.csv` | Cellules hostiles commençant par `=`, `+`, `-`, `@` (importées en texte) |
| `points.xlsx` | Classeur XLSX : deux feuilles (seule la 1re est lue), ligne vide, formule (valeur en cache) |

Cas sans fichier, vérifiés directement dans les tests : extension trompeuse
(détection par le contenu, pas par le nom), classeur surdimensionné (garde
« zip bomb »), colspan et entités HTML.

Reproduction : les fichiers binaires (Windows-1252, BOM, XLSX) ont été produits
avec SheetJS 0.20.3 ; voir l'historique Git pour le script générateur. Modifier
une fixture, c'est en documenter la difficulté ici et ajuster le test.
