/**
 * Rigs des livres dans la scène : création à la demande, retrait, synchronisation avec la liste des
 * livres (restauration, chargement) et pose directe sans animation. Les livres eux-mêmes restent
 * l'état du moteur.
 */
import * as THREE from 'three';

import type { Book, Id } from '@/types';

import { disposeBookRig, makeBookRig, updateBookTextures, type BookRig } from './books';

export class BookRigs {
  readonly rigs = new Map<Id, BookRig>();
  readonly group = new THREE.Group();

  /** `onRemove` : prévenu quand un rig disparaît (le moteur oublie alors le survol). */
  constructor(
    private readonly aniso: number,
    private readonly onRemove: (rig: BookRig) => void,
  ) {}

  /** Rig du livre, créé s'il n'existe pas encore. */
  ensure(b: Book): BookRig {
    let rig = this.rigs.get(b.id);
    if (!rig) {
      rig = makeBookRig(b, this.aniso);
      this.group.add(rig.mesh);
      this.rigs.set(b.id, rig);
    }
    return rig;
  }

  remove(id: Id): void {
    const rig = this.rigs.get(id);
    if (!rig) return;
    disposeBookRig(rig);
    this.group.remove(rig.mesh);
    this.rigs.delete(id);
    this.onRemove(rig);
  }

  /** Retire les rigs des livres disparus et remet à jour les textures des autres. */
  sync(books: Book[]): void {
    for (const id of [...this.rigs.keys()]) if (!books.some((b) => b.id === id)) this.remove(id);
    for (const b of books) {
      const rig = this.rigs.get(b.id);
      if (rig) updateBookTextures(rig, b, this.aniso);
    }
  }

  /** Pose chaque livre directement à sa place, sans l'animation d'arrivée (chargement, restauration). */
  settle(): void {
    for (const rig of this.rigs.values()) {
      rig.mesh.position.copy(rig.target);
      rig.mesh.quaternion.copy(rig.quat);
    }
  }

  dispose(): void {
    for (const rig of this.rigs.values()) disposeBookRig(rig);
    this.rigs.clear();
  }
}
