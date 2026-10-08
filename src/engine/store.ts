/**
 * Magasin lu par React (`useSyncExternalStore`) : abonnements et instantané de l'état. Les copies
 * profondes des caisses et des livres ne sont refaites que si les données ont changé (`markData`) :
 * ouvrir un livre, le retourner ou parcourir les manquants garde les mêmes tableaux pour React.
 */
import type { Book, Crate, Snapshot } from '@/types';

/** Ce que le magasin lit dans le moteur : tout l'instantané, avec les caisses et livres d'origine. */
export type SnapshotSource = Omit<Snapshot, 'crates' | 'books' | 'messy'> & {
  crates: Crate[];
  books: Book[];
};

export class Store {
  private readonly listeners = new Set<() => void>();
  /** Données modifiées depuis la dernière copie de l'instantané. */
  private dataDirty = true;
  private crates: Crate[] = [];
  private books: Book[] = [];
  private snapshot: Snapshot;

  constructor(private readonly read: () => SnapshotSource) {
    this.snapshot = this.make();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  /** Les caisses ou les livres ont changé : la prochaine copie est à refaire. */
  markData(): void {
    this.dataDirty = true;
  }

  /** Refait l'instantané et prévient les abonnés. */
  emit(): void {
    this.snapshot = this.make();
    for (const l of this.listeners) l();
  }

  private make(): Snapshot {
    const { crates, books, ...rest } = this.read();
    if (this.dataDirty) {
      this.crates = crates.map((c) => ({ ...c }));
      this.books = books.map((b) => ({ ...b }));
      this.dataDirty = false;
    }
    return { crates: this.crates, books: this.books, messy: false, ...rest };
  }
}
