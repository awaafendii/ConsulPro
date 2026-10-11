import { createHmac } from 'node:crypto';

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
  /** Projet de référence (BTP) créé par le propriétaire. */
  readonly projectId: string;
  readonly projectCode: string;
  /** Version publiée du référentiel de démonstration. */
  readonly demoVersionId: string;
  /** Étude, calcul (une révision) et jeu de données du projet de référence. */
  readonly studyId: string;
  readonly calculationId: string;
  readonly datasetId: string;
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

/** Code TOTP (RFC 6238, SHA-1, 30 s, 6 chiffres) à partir d'une clé base32 — tests uniquement. */
export function totp(secretBase32: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secretBase32.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}
