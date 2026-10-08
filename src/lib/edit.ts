import { createHmac, timingSafeEqual } from 'node:crypto';

/** Code qui déverrouille l'Édition ; EDIT_CODE le remplace dans .env.local. */
export const EDIT_CODE = process.env.EDIT_CODE ?? 'supermatou';
/** Clé de signature du jeton ; sans EDIT_SECRET, le jeton change si le code change. */
const SECRET = process.env.EDIT_SECRET ?? `edit:${EDIT_CODE}`;

export const signEditToken = (): string =>
  createHmac('sha256', SECRET).update('edit-unlocked').digest('hex');

export const sameSecret = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Le jeton gardé par le client prouve-t-il que le code d'Édition a été saisi ? */
export const isEditToken = (token: unknown): boolean =>
  typeof token === 'string' && sameSecret(token, signEditToken());
