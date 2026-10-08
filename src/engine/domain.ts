/**
 * État du domaine : caisses, livres, sélection, mode, décompte par caisse et historique d'annulation.
 * Détenu par le moteur, partagé avec ses modules (qui le lisent et le modifient, puis demandent un
 * `refresh` au moteur). Aucune dépendance à three.js ni à React.
 */
import type { Book, Crate, Id, Mode, SavedState } from '@/types';

import { crateBounds, type Bounds } from './cratePlacement';
import { History } from './history';

export class Domain {
  crates: Crate[] = [];
  books: Book[] = [];
  selectedId: Id | null = null;
  mode: Mode = 'view';
  /** Nombre de livres rangés par caisse, et totaux (voir layout.ts). */
  counts = new Map<Id, number>();
  stats = { stored: 0, loose: 0, full: 0 };
  /** États précédents pour « Annuler » (le plus récent en dernier). */
  readonly history = new History();

  crate(id: Id): Crate | undefined {
    return this.crates.find((c) => c.id === id);
  }

  bounds(): Bounds {
    return crateBounds(this.crates);
  }

  pushHistory(): void {
    this.history.push({ crates: this.crates, books: this.books, messy: false });
  }

  /** Remplace caisses et livres (annulation, chargement) ; la sélection d'une caisse disparue tombe. */
  replace(s: SavedState): void {
    this.crates = s.crates;
    this.books = s.books;
    if (this.selectedId && !this.crates.some((c) => c.id === this.selectedId))
      this.selectedId = null;
  }
}
