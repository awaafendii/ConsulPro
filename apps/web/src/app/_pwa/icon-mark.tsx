/**
 * Dessin des icônes PWA (favicon, icône iOS, icônes du manifeste).
 *
 * Généré par le framework via `next/og` (ImageResponse) : aucune dépendance de
 * rastérisation (sharp/ImageMagick), net à toute taille. Formes géométriques +
 * monogramme « CP » laiton sur fond encre — direction « Encre & Laiton ».
 *
 * Les couleurs sont des littéraux : les métadonnées de plateforme (manifeste,
 * icônes) ne peuvent pas référencer les tokens CSS du design system. Elles
 * reprennent la famille encre/laiton des tokens `--primary` et `--brand`.
 */
import { ImageResponse } from 'next/og';

const INK = '#141d33';
const INK_SHEEN = 'linear-gradient(145deg, #1b2747 0%, #0c1526 100%)';
const BRASS = '#c79a4f';
const IVORY = '#fbf9f6';

export interface IconShape {
  /** Rayon des coins, en fraction de la taille (0 = plein cadre). */
  readonly radiusScale: number;
  /** Taille de la zone de contenu, en fraction de la taille. */
  readonly contentScale: number;
}

/** Icône standard : coins arrondis, contenu large. */
export const STANDARD: IconShape = { radiusScale: 0.22, contentScale: 0.86 };
/** Icône « maskable » Android : plein cadre, contenu dans la zone de sécurité (~70 %). */
export const MASKABLE: IconShape = { radiusScale: 0, contentScale: 0.7 };
/** Icône iOS : plein cadre (iOS arrondit lui-même), contenu large. */
export const APPLE: IconShape = { radiusScale: 0, contentScale: 0.84 };

/** Produit une icône PNG carrée de `size` pixels. */
export function renderIcon(size: number, shape: IconShape): ImageResponse {
  const safe = Math.round(size * shape.contentScale);
  const radius = Math.round(size * shape.radiusScale);
  const monogram = Math.round(safe * 0.52);
  const ruleWidth = Math.round(safe * 0.5);
  const ruleHeight = Math.max(2, Math.round(size * 0.022));

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: INK,
          backgroundImage: INK_SHEEN,
          borderRadius: radius,
        }}
      >
        <div
          style={{
            width: safe,
            height: safe,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: monogram,
              fontWeight: 800,
              letterSpacing: -Math.round(monogram * 0.06),
              lineHeight: 1,
              color: BRASS,
            }}
          >
            CP
          </div>
          <div
            style={{
              marginTop: Math.round(size * 0.04),
              width: ruleWidth,
              height: ruleHeight,
              borderRadius: ruleHeight,
              backgroundColor: IVORY,
            }}
          />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
