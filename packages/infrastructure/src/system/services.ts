import { createHash, randomBytes } from 'node:crypto';

import type { Clock, IdGenerator, TokenService } from '@consulpro/application';
import { v7 as uuidv7 } from 'uuid';

export const systemClock: Clock = { now: () => new Date() };

/** UUID v7 : ordonnés dans le temps (pagination par curseur, index). */
export const uuidV7Generator: IdGenerator = { next: () => uuidv7() };

/** Jetons de 256 bits ; seule leur empreinte SHA-256 est stockée. */
export const tokenService: TokenService = {
  generate() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: sha256(token) };
  },
  hash: sha256,
};

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
