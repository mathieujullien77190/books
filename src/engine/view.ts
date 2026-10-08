/**
 * Vue : cadrage de la caméra (vue d'ensemble, focus sur une caisse) et « showcase » du livre sorti,
 * qui flotte devant la caméra avec ses voisins (précédent / suivant) et l'animation de sortie
 * ‹ › sur téléphone. Les rigs restent la propriété du moteur ; le showcase ne fait que viser.
 */
import * as THREE from 'three';

import type { Crate, Id } from '@/types';

import type { BookRig } from './books';
import { HOME_DIR, NEIGHBOR_SCALE } from './constants';
import type { CrateRig } from './crate';
import type { Bounds } from './cratePlacement';
import { extents } from './orientation';

const _tv = new THREE.Vector3();

/** Vue d'ensemble : de face, assez loin pour cadrer toutes les caisses. */
export const recenterView = (camera: THREE.Camera, target: THREE.Vector3, bb: Bounds): void => {
  const extent = Math.max(bb.maxX - bb.minX, bb.maxZ - bb.minZ, bb.maxY * 1.6, 6);
  target.set(bb.cx, bb.maxY * 0.45, bb.cz);
  camera.position.copy(target).addScaledVector(HOME_DIR, extent * 1.55 + 3);
};

/** Cadre la caméra sur une caisse, en gardant la direction de vue. */
export const focusCrateView = (
  camera: THREE.Camera,
  target: THREE.Vector3,
  c: Crate,
  rig: CrateRig,
): void => {
  const { fx, fy, fz } = extents(c);
  const dir = _tv.copy(camera.position).sub(target).normalize();
  target.copy(rig.group.position);
  camera.position.copy(rig.group.position).addScaledVector(dir, Math.max(fx, fy, fz) * 2.4 + 1);
};

export class Showcase {
  /** Voisins du livre sorti (même caisse), présentés de part et d'autre : [précédent, suivant]. */
  neighbors: [Id | null, Id | null] = [null, null];
  /** Livre qui sort de l'écran en glissant (téléphone) pendant que le suivant arrive. */
  exiting: { rig: BookRig; dir: -1 | 1; start: number } | null = null;
  /** Sens d'arrivée du livre qui vient d'être ouvert par ‹ › (0 : pas d'animation). */
  enterDir: -1 | 0 | 1 = 0;

  // vecteurs de travail
  private readonly _tv = new THREE.Vector3();
  private readonly _fwd = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _bx = new THREE.Vector3();
  private readonly _by = new THREE.Vector3();
  private readonly _bz = new THREE.Vector3();
  private readonly _basis = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();

  /**
   * Le livre sorti flotte devant la caméra, décalé à gauche pour laisser la fiche à droite.
   * `finishExit` est appelé quand l'animation de sortie (téléphone) est finie.
   */
  update(
    camera: THREE.PerspectiveCamera,
    rig: BookRig | undefined,
    rigs: Map<Id, BookRig>,
    openBack: boolean,
    portrait: boolean,
    finishExit: () => void,
  ): void {
    camera.getWorldDirection(this._fwd);
    this._right.crossVectors(this._fwd, camera.up).normalize();
    if (!rig) return;
    let dist = Math.max(3.8, rig.mesh.geometry.parameters.height * 1.9);
    const openW = rig.mesh.geometry.parameters.depth;
    const spread = 1.15;
    const gaps = this.neighbors.map((id) => {
      const nr = id && rigs.get(id);
      return nr ? (openW + nr.mesh.geometry.parameters.depth * NEIGHBOR_SCALE) / 2 + 0.3 : 0;
    });
    if (portrait) {
      // téléphone : un seul livre, le plus grand possible (largeur ou hauteur, 8 % de marge)
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const fitH = (rig.mesh.geometry.parameters.height / 2) * 1.08;
      const fitW = (openW / 2) * 1.08;
      dist = Math.max(fitH / tanHalf, fitW / (tanHalf * camera.aspect));
    }
    const shift = portrait ? 0 : -dist * 0.22;
    this._tv
      .copy(camera.position)
      .addScaledVector(this._fwd, dist)
      .addScaledVector(this._right, shift);
    rig.target.copy(this._tv);
    const tanHalfV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const off = tanHalfV * camera.aspect * dist * 2;
    if (this.enterDir !== 0)
      rig.mesh.position.copy(this._tv).addScaledVector(this._right, this.enterDir * off);
    // couverture (+X) par défaut, dos avec le résumé (-X) une fois retourné
    this._bx.copy(this._fwd);
    if (!openBack) this._bx.negate();
    this._bz.crossVectors(this._bx, camera.up).normalize();
    this._by.crossVectors(this._bz, this._bx);
    this._basis.makeBasis(this._bx, this._by, this._bz);
    rig.quat.setFromRotationMatrix(this._basis);
    if (this.enterDir !== 0) {
      rig.mesh.quaternion.copy(rig.quat);
      this.enterDir = 0;
    }
    const ex = this.exiting;
    if (ex) {
      ex.rig.target.copy(this._tv).addScaledVector(this._right, -ex.dir * off);
      ex.rig.quat.copy(rig.quat);
      if (performance.now() - ex.start > 600) finishExit();
    }

    // voisins : couverture visible, un peu en retrait, tournés vers le livre sorti (pas sur téléphone)
    if (portrait) return;
    this.neighbors.forEach((id, i) => {
      const nr = id && rigs.get(id);
      if (!nr) return;
      const side = i === 0 ? -1 : 1;
      const gap = gaps[i] ?? 0;
      nr.target
        .copy(camera.position)
        .addScaledVector(this._fwd, dist + 0.6)
        .addScaledVector(this._right, shift + side * gap * spread);
      this._bx.copy(this._fwd).negate();
      this._bz.crossVectors(this._bx, camera.up).normalize();
      this._by.crossVectors(this._bz, this._bx);
      this._basis.makeBasis(this._bx, this._by, this._bz);
      nr.quat
        .setFromRotationMatrix(this._basis)
        .premultiply(this._q.setFromAxisAngle(camera.up, -side * 0.45));
    });
  }
}
