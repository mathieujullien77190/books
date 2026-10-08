import { editRoute } from '@/lib/editRoute';
import { swapBooks } from '@/lib/library';

/**
 * POST /api/books/swap — échange la place de deux livres (caisse et rang).
 * Corps : { token, book_a, book_b }. Réservé au jeton d'Édition.
 */
export const POST = editRoute<{ token?: unknown; book_a?: unknown; book_b?: unknown }>(
  async (body) =>
    typeof body.book_a === 'string' && typeof body.book_b === 'string'
      ? ((await swapBooks({ book_a: body.book_a, book_b: body.book_b })) as {
          ok?: boolean;
          error?: string;
        })
      : null,
);
