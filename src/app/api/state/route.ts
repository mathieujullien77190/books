import { NextResponse } from 'next/server';

import { getDb, hasMongoConfig, readRev } from '@/lib/mongodb';
import type { Book, Crate, Prop } from '@/types';

/** GET /api/state — état complet (caisses + livres) stocké dans MongoDB, chargé au démarrage. */
export const GET = async (): Promise<NextResponse> => {
  if (!hasMongoConfig()) return NextResponse.json({ ok: false, reason: 'no-db' });
  try {
    const db = await getDb();
    // révision lue avant les données : au pire elle est en retard, et la prochaine écriture du
    // client est refusée puis rechargée — jamais l'inverse
    const rev = await readRev(db);
    // l'ordre compte : il fixe la numérotation des caisses, l'empilement et la place des livres
    const opts = { projection: { _id: 0, order: 0 }, sort: { order: 1 } } as const;
    const [crates, books, props] = await Promise.all([
      db.collection<Crate>('crates').find({}, opts).toArray(),
      db.collection<Book>('books').find({}, opts).toArray(),
      db.collection<Prop>('props').find({}, opts).toArray(),
    ]);
    return NextResponse.json({ ok: true, rev, crates, books, props });
  } catch (err) {
    console.error('load state failed', err);
    return NextResponse.json({ ok: false, reason: 'error' });
  }
};
