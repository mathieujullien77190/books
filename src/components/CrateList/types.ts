import type { Crate, Id } from '@/types';

export type CrateListProps = {
  crates: Crate[];
  labels: Map<Id, string>;
  counts: Record<Id, number>;
  selectedId: Id | null;
  /** Clic sur une ligne : sélection (édition) ou cadrage caméra (bibliothèque). */
  onPick: (id: Id) => void;
};
