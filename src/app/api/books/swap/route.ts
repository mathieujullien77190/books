import { NextResponse } from 'next/server';

import { isEditToken } from '@/lib/edit';
import { swapBooks } from '@/lib/library';
import { hasMongoConfig } from '@/lib/mongodb';

/**
 * POST /api/books/swap — échange la place de deux livres (caisse et rang).
 * Corps : { token, book_a, book_b }. Réservé au jeton d'Édition.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  let body: { token?: unknown; book_a?: unknown; book_b?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }
  if (!isEditToken(body.token))
    return NextResponse.json({ ok: false, reason: 'locked' }, { status: 401 });
  if (!hasMongoConfig()) return NextResponse.json({ ok: false, reason: 'no-db' }, { status: 503 });
  if (typeof body.book_a !== 'string' || typeof body.book_b !== 'string')
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
  const result = (await swapBooks({ book_a: body.book_a, book_b: body.book_b })) as {
    ok?: boolean;
    error?: string;
  };
  return NextResponse.json(result.ok ? result : { ok: false, reason: result.error }, {
    status: result.ok ? 200 : 404,
  });
};
