import type { Book, Id } from '@/types';

export type BookListProps = {
  books: Book[];
  /** Numéro de chaque caisse (G1, M2…) par id. */
  labels: Map<Id, string>;
  onOpen: (id: Id) => void;
  onRemove: (id: Id) => void;
};
