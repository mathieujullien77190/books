/**
 * Modification d'un livre depuis la fiche : champs modifiables (`BookPatch`) et application d'un
 * patch sur un livre, en nettoyant les valeurs saisies.
 */
import type { Book } from '@/types';

/** Champs modifiables d'un livre depuis la fiche. */
export type BookPatch = Partial<
  Pick<
    Book,
    | 'title'
    | 'summary'
    | 'color'
    | 'cover'
    | 'author'
    | 'publisher'
    | 'year'
    | 'kind'
    | 'isbn'
    | 'isbnConfidence'
  >
>;

/** Applique le patch au livre ; renvoie vrai si ses textures (tranche, couverture, dos) sont à refaire. */
export const applyBookPatch = (b: Book, patch: BookPatch): boolean => {
  const title = patch.title?.trim();
  if (title) b.title = title;
  if (patch.color !== undefined) b.color = patch.color;
  if (patch.summary !== undefined) b.summary = patch.summary;
  if ('cover' in patch) b.cover = patch.cover || undefined;
  if ('author' in patch) b.author = patch.author?.trim() || undefined;
  if ('publisher' in patch) b.publisher = patch.publisher?.trim() || undefined;
  if ('year' in patch) b.year = patch.year && Number.isFinite(patch.year) ? patch.year : undefined;
  if ('kind' in patch) b.kind = patch.kind;
  if ('isbn' in patch) b.isbn = patch.isbn?.trim() || undefined;
  if ('isbnConfidence' in patch) b.isbnConfidence = b.isbn ? patch.isbnConfidence : undefined;
  const meta =
    'author' in patch ||
    'publisher' in patch ||
    'year' in patch ||
    'kind' in patch ||
    'isbn' in patch ||
    'isbnConfidence' in patch;
  return (
    patch.title !== undefined ||
    patch.color !== undefined ||
    patch.summary !== undefined ||
    'cover' in patch ||
    meta
  );
};
