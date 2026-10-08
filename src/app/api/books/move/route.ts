import { NextResponse } from 'next/server';

import { isEditToken } from '@/lib/edit';
import { moveBook } from '@/lib/library';
import { hasMongoConfig } from '@/lib/mongodb';

/**
 * POST /api/books/move — range un livre dans une caisse ou une pile.
 * Corps : { token, book_id, crate, position? | after_book_id? }
 *  - crate : étiquette (P2, M3, G1, T5…) ou « à côté »
 *  - position : rang dans la caisse, 1 = premier (le plus à gauche / le plus bas de la pile)
 *  - after_book_id : place le livre juste après cet autre livre
 * Sans ni position ni after_book_id, le livre va en fin de rangée. Réservé au jeton d'Édition.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  let body: {
    token?: unknown;
    book_id?: unknown;
    crate?: unknown;
    position?: unknown;
    after_book_id?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }
  if (!isEditToken(body.token))
    return NextResponse.json({ ok: false, reason: 'locked' }, { status: 401 });
  if (!hasMongoConfig()) return NextResponse.json({ ok: false, reason: 'no-db' }, { status: 503 });
  if (typeof body.book_id !== 'string' || typeof body.crate !== 'string')
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
  const position =
    typeof body.position === 'number' && Number.isFinite(body.position) ? body.position : undefined;
  const result = (await moveBook({
    book_id: body.book_id,
    crate: body.crate,
    position,
    after_book_id: typeof body.after_book_id === 'string' ? body.after_book_id : undefined,
  })) as { ok?: boolean; error?: string };
  return NextResponse.json(result.ok ? result : { ok: false, reason: result.error }, {
    status: result.ok ? 200 : 404,
  });
};
