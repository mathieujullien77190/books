/**
 * Modification d'un livre depuis la fiche : champs modifiables (`BookPatch`), application d'un patch
 * sur un livre (valeurs saisies nettoyées) et éditeur qui regroupe les saisies dans l'historique et
 * refait les textures.
 */
import { BOOK_LIMITS } from '@/constants';
import type { Book, Id } from '@/types';

import { resizeBookRig, setBookResolution, updateBookTextures, type BookRig } from './books';
import { OPEN_BOOK_SCALE } from './constants';
import type { Domain } from './domain';

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
    | 'h'
    | 't'
    | 'd'
  >
>;

/** Applique le patch au livre ; renvoie vrai si ses textures (tranche, couverture, dos) sont à refaire. */
/** Dimension acceptée : un nombre dans les bornes (sinon la valeur reste celle du livre). */
const validDim = (key: 'h' | 'd' | 't', value: number | undefined): value is number =>
  value !== undefined &&
  Number.isFinite(value) &&
  value >= BOOK_LIMITS[key][0] &&
  value <= BOOK_LIMITS[key][1];

export const applyBookPatch = (b: Book, patch: BookPatch): boolean => {
  let resized = false;
  for (const key of ['h', 'd', 't'] as const) {
    const v = patch[key];
    if (validDim(key, v)) {
      b[key] = Math.round(v * 1000) / 1000;
      resized = true;
    }
  }
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
    resized ||
    patch.title !== undefined ||
    patch.color !== undefined ||
    patch.summary !== undefined ||
    'cover' in patch ||
    meta
  );
};

/** Ce que l'éditeur de fiche demande au moteur. */
export type BookEditorHost = {
  domain: Domain;
  rigOf: (id: Id) => BookRig | undefined;
  openId: () => Id | null;
  aniso: number;
  /** Les données ont changé : le snapshot est à recopier, la base à mettre à jour, l'interface à prévenir. */
  changed: () => void;
  /** Les dimensions d'un livre ont changé : la disposition des livres est à refaire. */
  relayout: () => void;
};

/** Édition d'un livre depuis la fiche : une saisie suivie = une seule entrée d'historique, textures refaites après une pause. */
export class BookEditor {
  private lastEdit: { id: Id; ts: number } | null = null;
  private texTimer = 0;

  constructor(private readonly host: BookEditorHost) {}

  update(id: Id, patch: BookPatch): void {
    const h = this.host;
    const b = h.domain.books.find((k) => k.id === id);
    if (!b) return;
    // une « session » de saisie sur le même livre = une seule entrée d'historique
    const now = Date.now();
    if (!this.lastEdit || this.lastEdit.id !== id || now - this.lastEdit.ts > 1500)
      h.domain.pushHistory();
    this.lastEdit = { id, ts: now };
    if (applyBookPatch(b, patch)) {
      if ('h' in patch || 'd' in patch || 't' in patch) {
        const rig = h.rigOf(id);
        if (rig) resizeBookRig(rig, b);
        h.relayout();
      }
      window.clearTimeout(this.texTimer);
      this.texTimer = window.setTimeout(() => {
        const rig = h.rigOf(id);
        if (!rig) return;
        updateBookTextures(rig, b, h.aniso);
        if (h.openId() === id) setBookResolution(rig, b, h.aniso, OPEN_BOOK_SCALE);
      }, 250);
    }
    h.changed();
  }

  /** La saisie en cours ne se prolonge plus (état remplacé par une restauration ou un chargement). */
  reset(): void {
    this.lastEdit = null;
  }

  dispose(): void {
    window.clearTimeout(this.texTimer);
  }
}
