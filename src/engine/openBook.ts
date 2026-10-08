/**
 * Livre sorti : ouverture et fermeture (le livre passe en couche 1, dessiné par-dessus la scène, en
 * double résolution), retournement couverture / dos, voisins précédent / suivant, parcours d'une
 * recherche et animation de sortie sur téléphone. Les livres et leurs rigs restent la propriété du
 * moteur, qui parle à ce module par `OpenBookHost`.
 */
import type { Book, Id } from '@/types';

import { ensureCover, setBookResolution, type BookRig } from './books';
import { OPEN_BOOK_SCALE } from './constants';
import type { Domain } from './domain';
import { Showcase } from './view';

export type OpenBookHost = {
  domain: Domain;
  bookRigs: Map<Id, BookRig>;
  /** Livre rangé dans une caisse (sinon : dans la pile « à côté »). */
  hasCrate: (id: Id) => boolean;
  aniso: number;
  /** Écran en portrait (téléphone) : un seul livre est présenté, sans voisins. */
  isPortrait: () => boolean;
  /** Éteint la surbrillance d'une caisse survolée dans la fiche. */
  clearHint: () => void;
  layoutBooks: () => void;
  refresh: () => void;
  emit: () => void;
};

export class OpenBook {
  id: Id | null = null;
  /** Face visible du livre sorti : false = couverture, true = dos (résumé). */
  back = false;
  /** Résultats d'une recherche présentés l'un après l'autre (précédent / suivant) ; null : voisins de la caisse. */
  resultIds: Id[] | null = null;
  /** Voisins du livre sorti, animation de sortie et position flottante devant la caméra. */
  readonly showcase = new Showcase();

  constructor(private readonly host: OpenBookHost) {}

  private book(id: Id): Book | undefined {
    return this.host.domain.books.find((b) => b.id === id);
  }

  open(id: Id): void {
    const h = this.host;
    if (this.id && this.id !== id) this.close(false);
    const rig = h.bookRigs.get(id);
    if (!rig) return;
    this.id = id;
    this.back = false; // toujours la couverture d'abord
    rig.mesh.layers.set(1);
    rig.mesh.castShadow = false;
    const book = this.book(id);
    if (book) setBookResolution(rig, book, h.aniso, OPEN_BOOK_SCALE);
    h.refresh();
  }

  close(doRefresh = true): void {
    const h = this.host;
    const rig = this.id ? h.bookRigs.get(this.id) : undefined;
    if (rig && rig !== this.showcase.exiting?.rig) {
      rig.mesh.layers.set(0);
      rig.mesh.castShadow = true;
      const book = this.book(this.id!); // un rig trouvé implique un livre ouvert
      if (book) setBookResolution(rig, book, h.aniso, 1);
    }
    this.id = null;
    h.clearHint();
    if (doRefresh) this.resultIds = null;
    if (doRefresh) h.refresh();
  }

  /** Retourne le livre sorti : couverture ↔ dos (résumé). */
  flip(): void {
    if (!this.id) return;
    this.back = !this.back;
    this.host.emit();
  }

  /** Présente les résultats d'une recherche : ouvre le premier, précédent / suivant parcourent la liste. */
  showResults(ids: Id[]): void {
    const first = ids[0];
    if (!first) return;
    this.resultIds = ids;
    this.open(first);
  }

  /** Passe au livre précédent (-1) ou suivant (1) : voisins de la caisse ou résultats de la recherche. */
  step(dir: -1 | 1): void {
    const h = this.host;
    const id = this.showcase.neighbors[dir < 0 ? 0 : 1];
    if (!id) return;
    const out = this.id ? h.bookRigs.get(this.id) : undefined;
    if (!h.isPortrait() || !out) {
      this.open(id);
      return;
    }
    // téléphone : le livre actuel part du côté opposé, le suivant arrive du côté où on va
    this.finishExit();
    this.showcase.exiting = { rig: out, dir, start: performance.now() };
    this.showcase.enterDir = dir;
    this.open(id);
  }

  /** Remet le livre sorti de l'écran à sa place dans la caisse, sans qu'on le voie voler. */
  finishExit(): void {
    const h = this.host;
    const ex = this.showcase.exiting;
    if (!ex) return;
    this.showcase.exiting = null;
    ex.rig.mesh.layers.set(0);
    ex.rig.mesh.castShadow = true;
    const book = this.book(ex.rig.id);
    if (book) setBookResolution(ex.rig, book, h.aniso, 1);
    h.layoutBooks();
    ex.rig.mesh.position.copy(ex.rig.target);
    ex.rig.mesh.quaternion.copy(ex.rig.quat);
  }

  /** Recalcule les voisins du livre sorti et les fait passer au premier plan (couche 1). */
  updateNeighbors(): void {
    const h = this.host;
    const { books } = h.domain;
    const open = this.id ? this.book(this.id) : undefined;
    let next: [Id | null, Id | null] = [null, null];
    if (open) {
      const stored = (b: Book): boolean => !!b.crate && h.hasCrate(b.crate);
      const list = this.resultIds?.includes(open.id)
        ? this.resultIds.flatMap((id) => books.find((b) => b.id === id) ?? [])
        : books.filter((b) => (stored(open) ? b.crate === open.crate : !stored(b)));
      const i = list.indexOf(open);
      next = [list[i - 1]?.id ?? null, list[i + 1]?.id ?? null];
    }
    for (const id of this.showcase.neighbors) {
      const rig = id && !next.includes(id) && h.bookRigs.get(id);
      if (!rig) continue;
      rig.mesh.layers.set(0);
      rig.mesh.castShadow = true;
    }
    for (const id of next) {
      const rig = id && h.bookRigs.get(id);
      if (!rig || h.isPortrait()) continue;
      ensureCover(
        rig,
        books.find((k) => k.id === id)!,
        h.aniso,
        true,
      );
      rig.mesh.layers.set(1);
      rig.mesh.castShadow = false;
    }
    this.showcase.neighbors = next;
  }
}
