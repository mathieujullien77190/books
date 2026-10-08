import type { Book, Id } from '@/types';

export type SearchBarProps = {
  books: Book[];
  /** Numéro de chaque caisse (G1, M2…) par id. */
  labels: Map<Id, string>;
  onOpen: (id: Id) => void;
  onRemove: (id: Id) => void;
  /** Recherche validée (Entrée) : tous les résultats sont présentés devant, du premier au dernier. */
  onShowAll: (ids: Id[]) => void;
};
