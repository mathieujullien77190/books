import type { Book, Id } from '@/types';

export type BookPatch = Partial<
  Pick<Book, 'title' | 'summary' | 'color' | 'cover' | 'author' | 'publisher' | 'year' | 'kind'>
>;

export type BookDetailProps = {
  /** null : aucun livre sorti, la fiche est masquée. */
  book: Book | null;
  /** Numéro de sa caisse (G1, M2…), ou null si à côté. */
  crateLabel: string | null;
  /** Tous les livres, pour lister les autres numéros de la même série. */
  allBooks: Book[];
  onChange: (patch: BookPatch) => void;
  onOpen: (id: Id) => void;
  /** Survol de « Ranger dans… » : la caisse du livre s'allume dans la vue 3D (null : on éteint). */
  onHint: (crateId: Id | null) => void;
  onClose: () => void;
};
