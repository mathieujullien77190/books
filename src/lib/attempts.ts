import { getDb, hasMongoConfig } from '@/lib/mongodb';

/** Essais ratés autorisés par adresse, sur une fenêtre glissante, avant de refuser tout essai. */
const MAX_FAILS = 8;
const WINDOW_MS = 15 * 60 * 1000;

type Entry = { n: number; since: number };
/** Repli sans base : compteur en mémoire (une instance serverless à la fois, mieux que rien). */
const memory = new Map<string, Entry>();

/** Adresse du visiteur derrière le proxy de Vercel (`x-forwarded-for`, premier maillon). */
export const clientKey = (request: Request): string =>
  (request.headers.get('x-forwarded-for') ?? 'inconnue').split(',')[0]!.trim() || 'inconnue';

const fresh = (e: Entry | null | undefined, now: number): Entry | null =>
  e && now - e.since < WINDOW_MS ? e : null;

/** Cette adresse a-t-elle épuisé ses essais ? */
export const isBlocked = async (key: string): Promise<boolean> => {
  const now = Date.now();
  if (!hasMongoConfig()) return (fresh(memory.get(key), now)?.n ?? 0) >= MAX_FAILS;
  try {
    const db = await getDb();
    const doc = await db.collection<{ _id: string } & Entry>('edit_attempts').findOne({ _id: key });
    return (fresh(doc, now)?.n ?? 0) >= MAX_FAILS;
  } catch {
    return false; // base injoignable : on ne bloque pas l'utilisateur légitime
  }
};

/** Compte un essai raté. */
export const recordFail = async (key: string): Promise<void> => {
  const now = Date.now();
  if (!hasMongoConfig()) {
    const e = fresh(memory.get(key), now);
    memory.set(key, { n: (e?.n ?? 0) + 1, since: e?.since ?? now });
    return;
  }
  try {
    const db = await getDb();
    const col = db.collection<{ _id: string } & Entry>('edit_attempts');
    const doc = fresh(await col.findOne({ _id: key }), now);
    await col.updateOne(
      { _id: key },
      { $set: { n: (doc?.n ?? 0) + 1, since: doc?.since ?? now } },
      { upsert: true },
    );
  } catch {
    // compteur indisponible : sans conséquence
  }
};

/** Un bon code efface les essais ratés. */
export const clearFails = async (key: string): Promise<void> => {
  memory.delete(key);
  if (!hasMongoConfig()) return;
  try {
    const db = await getDb();
    await db.collection<{ _id: string }>('edit_attempts').deleteOne({ _id: key });
  } catch {
    // sans conséquence
  }
};
