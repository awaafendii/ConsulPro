import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // CSP complète (nonces) prévue en Phase 10 ; on interdit déjà l'intégration en iframe.
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
];

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Packages internes publiés en TypeScript source (01-arborescence.md).
  transpilePackages: [
    '@consulpro/application',
    '@consulpro/calc-core',
    '@consulpro/contracts',
    '@consulpro/db',
    '@consulpro/domain',
    '@consulpro/infrastructure',
    '@consulpro/ui',
  ],
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Next.js exige un export par défaut pour ce fichier.
// eslint-disable-next-line no-restricted-syntax
export default withNextIntl(config);
