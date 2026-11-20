import { renderIcon, STANDARD } from '../../_pwa/icon-mark';

export const dynamic = 'force-static';

export function GET() {
  return renderIcon(192, STANDARD);
}
