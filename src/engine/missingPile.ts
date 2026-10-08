/**
 * Tas des tomes manquants, à gauche des caisses : un livre translucide par tome absent des séries,
 * le papier « Livres à acheter » posé dessus, et le défilé en gros plan (rang courant, cible de
 * caméra vers laquelle on se glisse en douceur). Ne connaît pas l'état du domaine : le moteur lui
 * donne les livres et l'emprise des caisses.
 */
import * as THREE from 'three';

import { missingVolumes } from '@/helpers';
import type { Book } from '@/types';

import { GHOST_PILE, HOME_DIR } from './constants';
import type { Bounds } from './cratePlacement';
import { buildGhostBook, buildNote } from './ghosts';
import { disposeGroup } from './materials';

export class MissingPile {
  readonly group = new THREE.Group();
  private key = '';
  /** Le papier « Livres à acheter » posé sur le tas, et ce qu'il déclenche au clic. */
  private note: THREE.Group | null = null;
  /** Livres manquants du tas, du bas vers le haut, pour le défilé en 3D. */
  private items: { mesh: THREE.Object3D; label: string }[] = [];
  /** Rang (dans items) du tome manquant affiché en gros plan ; null : pas de défilé. */
  private idx: number | null = null;
  /** Cible de la caméra pendant le défilé : on s'y glisse en douceur. */
  private goal: { target: THREE.Vector3; pos: THREE.Vector3 } | null = null;

  constructor(private readonly aniso: number) {}

  get count(): number {
    return this.items.length;
  }

  /** Le défilé est en cours. */
  get browsing(): boolean {
    return this.idx !== null;
  }

  /** Tome affiché en gros plan : libellé, rang depuis le haut du tas et nombre total (null : pas de défilé). */
  get current(): { label: string; index: number; total: number } | null {
    if (this.idx === null) return null;
    return {
      label: this.items[this.idx]?.label ?? '',
      index: this.items.length - this.idx,
      total: this.items.length,
    };
  }

  /** Reconstruit le tas des tomes manquants quand la liste (ou la position des caisses) change. */
  /** Oublie le dernier tas construit : le prochain `sync` le refait (changement de mode d'affichage). */
  invalidate(): void {
    this.key = '';
  }

  sync(books: Book[], bb: Bounds): void {
    // les plus grands livres en bas du tas, les plus petits en haut (puis par série et numéro)
    const missing = missingVolumes(books).sort(
      (x, y) =>
        y.template.h - x.template.h ||
        y.template.d - x.template.d ||
        x.label.localeCompare(y.label, 'fr', { numeric: true }),
    );
    const key = `${missing.map((m) => m.label).join('|')}@${bb.minX.toFixed(2)},${bb.cz.toFixed(2)}`;
    if (key === this.key) return;
    this.key = key;
    for (const g of [...this.group.children]) {
      this.group.remove(g);
      disposeGroup(g);
    }
    this.items = [];
    if (this.idx !== null) this.idx = null;
    let height = 0;
    missing.forEach((m, i) => {
      const pile = Math.floor(i / GHOST_PILE);
      if (i % GHOST_PILE === 0) height = 0;
      const { mesh, t } = buildGhostBook(m, this.aniso);
      // livre couché sur la tranche vers l'observateur, couverture dessus, léger désordre déterministe
      const jx = Math.sin(i * 12.9898) * 0.06;
      const jz = Math.cos(i * 78.233) * 0.05;
      mesh.position.set(bb.minX - 1.9 - pile * 2.4 + jx, height + t / 2, bb.cz + jz);
      mesh.quaternion.setFromEuler(new THREE.Euler(0, Math.sin(i * 4.1) * 0.12, Math.PI / 2));
      height += t;
      this.group.add(mesh);
      this.items.push({ mesh, label: m.label });
    });
    // un papier plié posé sur le dessus de la pile : « Livres à acheter »
    if (missing.length) {
      const note = buildNote(missing.length);
      note.position.set(bb.minX - 1.9, height + 0.01, bb.cz);
      this.group.add(note);
      this.note = note;
    } else this.note = null;
  }

  /** Le rayon touche le papier « Livres à acheter ». */
  hitsNote(raycaster: THREE.Raycaster): boolean {
    return !!this.note && raycaster.intersectObject(this.note, true).length > 0;
  }

  /** Rang du livre manquant touché par le rayon, ou -1. */
  hitIndex(raycaster: THREE.Raycaster): number {
    if (!this.items.length) return -1;
    const hit = raycaster.intersectObjects(
      this.items.map((g) => g.mesh),
      true,
    )[0];
    if (!hit) return -1;
    return this.items.findIndex((g) => {
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent)
        if (o === g.mesh) return true;
      return false;
    });
  }

  /** Lance le défilé : gros plan sur le dernier du tas (le plus petit). */
  browse(): void {
    this.show(this.items.length - 1);
  }

  /** Gros plan sur le tome de rang `idx`. */
  show(idx: number): void {
    this.idx = idx;
    this.focus();
  }

  /** Tome suivant (dir 1, vers le bas du tas) ou précédent (-1, vers le haut), en boucle. */
  step(dir: 1 | -1): void {
    if (this.idx === null || !this.items.length) return;
    const n = this.items.length;
    this.idx = (this.idx - dir + n) % n;
    this.focus();
  }

  end(): void {
    this.idx = null;
    this.goal = null;
  }

  /** Cadre la caméra de face sur le tome manquant courant. */
  private focus(): void {
    const g = this.idx === null ? undefined : this.items[this.idx];
    if (!g) return;
    const target = g.mesh.getWorldPosition(new THREE.Vector3());
    const pos = target.clone().addScaledVector(HOME_DIR, 3.4);
    this.goal = { target, pos };
  }

  /** Glisse la caméra vers le tome affiché (à appeler à chaque image) ; k = fraction du chemin. */
  updateCamera(camera: THREE.Camera, target: THREE.Vector3, k: number): void {
    const goal = this.goal;
    if (!goal) return;
    camera.position.lerp(goal.pos, k);
    target.lerp(goal.target, k);
    if (camera.position.distanceToSquared(goal.pos) < 1e-4) this.goal = null;
  }

  dispose(): void {
    disposeGroup(this.group);
  }
}
