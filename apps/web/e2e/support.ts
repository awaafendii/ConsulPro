import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const BASE_URL = 'http://localhost:3100';
export const MAILPIT = 'http://localhost:8025/api/v1';
export const PASSWORD = 'Beton-arme-BAEL-1991';

export interface Fixture {
  readonly ownerEmail: string;
  readonly ownerName: string;
  readonly orgSlug: string;
  readonly orgName: string;
}

/** Dernier lien reçu par une adresse dans Mailpit (vérification, invitation…). */
export async function lastLinkTo(email: string, subjectContains?: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const query = encodeURIComponent(
      `to:${email}${subjectContains ? ` subject:"${subjectContains}"` : ''}`,
    );
    const search = (await (await fetch(`${MAILPIT}/search?query=${query}`)).json()) as {
      messages?: { ID: string }[];
    };
    const id = search.messages?.[0]?.ID;
    if (id) {
      const message = (await (await fetch(`${MAILPIT}/message/${id}`)).json()) as { Text: string };
      const link = /https?:\/\/\S+/.exec(message.Text)?.[0];
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Aucun e-mail reçu par ${email}`);
}

/**
 * Analyse axe dans un vrai navigateur, TOUTES règles actives (contraste et repères compris),
 * niveau WCAG 2.2 AA.
 */
export async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  const violations = results.violations.map(
    (v) =>
      `${v.id} (${v.impact ?? '?'}) : ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  );
  expect(violations, label).toEqual([]);
}

/** Aucune barre de défilement horizontale au niveau de la page. */
export async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} : débordement horizontal de ${overflow} px`).toBeLessThanOrEqual(0);
}
