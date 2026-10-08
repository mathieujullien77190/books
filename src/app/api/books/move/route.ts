import { editRoute } from '@/lib/editRoute';
import { moveBook } from '@/lib/library';

/**
 * POST /api/books/move — range un livre dans une caisse ou une pile.
 * Corps : { token, book_id, crate, position? | after_book_id? }
 *  - crate : étiquette (P2, M3, G1, T5…) ou « à côté »
 *  - position : rang dans la caisse, 1 = premier (le plus à gauche / le plus bas de la pile)
 *  - after_book_id : place le livre juste après cet autre livre
 * Sans ni position ni after_book_id, le livre va en fin de rangée. Réservé au jeton d'Édition.
 */
export const POST = editRoute<{
  token?: unknown;
  book_id?: unknown;
  crate?: unknown;
  position?: unknown;
  after_book_id?: unknown;
}>(async (body) => {
  if (typeof body.book_id !== 'string' || typeof body.crate !== 'string') return null;
  return (await moveBook({
    book_id: body.book_id,
    crate: body.crate,
    position:
      typeof body.position === 'number' && Number.isFinite(body.position)
        ? body.position
        : undefined,
    after_book_id: typeof body.after_book_id === 'string' ? body.after_book_id : undefined,
  })) as { ok?: boolean; error?: string };
});
