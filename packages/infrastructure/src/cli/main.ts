/*
 * CLI d'administration de la plateforme (connexion PROPRIÉTAIRE : DATABASE_ADMIN_URL).
 *
 *   pnpm platform:grant-admin <e-mail>
 *   pnpm platform:revoke-admin <e-mail>
 *   pnpm standards:load <fichier.json>… [--publish-as <e-mail>]
 *
 * Les chemins relatifs partent du répertoire d'appel.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDatabase, type Database } from '@consulpro/db';

import { loadStandard, setPlatformAdmin } from '../standards/load-standard';

const DB_ENV = fileURLToPath(new URL('../../../db/.env', import.meta.url));
if (!process.env.DATABASE_ADMIN_URL && existsSync(DB_ENV)) process.loadEnvFile(DB_ENV);

type Outcome = { ok: true; lines: string[] } | { ok: false; message: string };
const done = (...lines: string[]): Outcome => ({ ok: true, lines });
const failed = (message: string): Outcome => ({ ok: false, message });

async function run(db: Database, command: string | undefined, rest: string[]): Promise<Outcome> {
  switch (command) {
    case 'platform:grant-admin':
    case 'platform:revoke-admin': {
      const [email] = rest;
      if (!email) return failed(`Usage : ${command} <e-mail>`);
      const updated = await setPlatformAdmin(db, email, command === 'platform:grant-admin');
      return updated.ok ? done(`${email} : rôle plateforme mis à jour.`) : failed(updated.error);
    }
    case 'standards:load': {
      const at = rest.indexOf('--publish-as');
      const publishAs = at >= 0 ? rest[at + 1] : undefined;
      const files = rest.filter((_, i) => at < 0 || (i !== at && i !== at + 1));
      if (files.length === 0 || (at >= 0 && !publishAs)) {
        return failed('Usage : standards:load <fichier.json>… [--publish-as <e-mail>]');
      }
      const base = process.env.INIT_CWD ?? process.cwd();
      const lines: string[] = [];
      for (const file of files) {
        const raw: unknown = JSON.parse(readFileSync(resolve(base, file), 'utf8'));
        const loaded = await loadStandard(db, raw, publishAs ? { publishAs } : {});
        if (!loaded.ok) return failed(`${file} :\n${loaded.error}`);
        const { outcome, status, standardVersionId } = loaded.value;
        lines.push(`${file} : ${outcome} (${status}) ${standardVersionId}`);
      }
      return done(...lines);
    }
    default:
      return failed('Commandes : platform:grant-admin, platform:revoke-admin, standards:load');
  }
}

const [command, ...rest] = process.argv.slice(2);
const url = process.env.DATABASE_ADMIN_URL;
if (url) {
  const db = createDatabase(url, { max: 1 });
  try {
    const outcome = await run(db, command, rest);
    if (outcome.ok) process.stdout.write(outcome.lines.map((l) => `${l}\n`).join(''));
    else {
      process.stderr.write(`${outcome.message}\n`);
      process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
} else {
  process.stderr.write('DATABASE_ADMIN_URL manquant (voir packages/db/.env.example).\n');
  process.exitCode = 1;
}
