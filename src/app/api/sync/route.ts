import { NextResponse } from 'next/server';

import { isEditToken } from '@/lib/edit';
import { claimRev, getDb, hasMongoConfig } from '@/lib/mongodb';
import type { Book, Crate } from '@/types';

/**
 * POST /api/sync — reçoit l'état courant (caisses + livres) et remplace celui de MongoDB, qui fait
 * référence (relu au démarrage par GET /api/state). Refusé (`conflict`) si `rev` n'est plus la
 * révision en base : le client doit alors recharger l'état au lieu d'écraser une modification faite
 * ailleurs. Une erreur ou l'absence de base configurée ne doit jamais bloquer l'appli.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  if (!hasMongoConfig()) return NextResponse.json({ ok: false, reason: 'no-db' });
  try {
    const body = (await request.json()) as {
      token?: unknown;
      rev?: number;
      crates?: Crate[];
      books?: Book[];
      decor?: { mesange?: { dx?: unknown; dy?: unknown; dz?: unknown } };
    };
    // seule une session qui a saisi le code d'Édition peut écrire (sinon n'importe qui pourrait vider la base)
    if (!isEditToken(body.token))
      return NextResponse.json({ ok: false, reason: 'locked' }, { status: 401 });
    const db = await getDb();
    const rev = body.rev ?? 0;
    if (!(await claimRev(db, rev))) return NextResponse.json({ ok: false, reason: 'conflict' });
    if (Array.isArray(body.crates)) {
      const crates = db.collection<Crate>('crates');
      await crates.deleteMany({});
      if (body.crates.length)
        await crates.insertMany(body.crates.map((c, order) => ({ ...c, order })));
    }
    if (Array.isArray(body.books)) {
      const books = db.collection<Book>('books');
      await books.deleteMany({});
      if (body.books.length)
        await books.insertMany(body.books.map((b, order) => ({ ...b, order })));
    }
    const m = body.decor?.mesange;
    if (m) {
      const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      await db
        .collection('meta')
        .updateOne(
          { _id: 'decor' as never },
          { $set: { mesange: { dx: n(m.dx), dy: n(m.dy), dz: n(m.dz) } } },
          { upsert: true },
        );
    }
    return NextResponse.json({ ok: true, rev: rev + 1 });
  } catch (err) {
    console.error('sync failed', err);
    return NextResponse.json({ ok: false, reason: 'error' });
  }
};
