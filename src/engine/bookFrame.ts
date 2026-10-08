/**
 * Rangement d'un livre dans une caisse : repère intérieur selon l'orientation de la caisse
 * (`crateFrame`), orientation d'un livre dans ce repère et remplissage rangée par rangée
 * ou pile par pile (`placeInCrate`).
 */
import * as THREE from 'three';

import { MAX_BOOK_H, PLANK as T } from '@/constants';
import { crateDims } from '@/helpers';
import type { Book, Crate } from '@/types';

import { quatOf } from './orientation';

/**
 * Repère de rangement d'une caisse selon son orientation.
 * U = axe local qui pointe vers le haut du monde, R = axe de la rangée, F = direction de la tranche.
 */
export type CrateFrame = {
  U: THREE.Vector3;
  R: THREE.Vector3;
  F: THREE.Vector3;
  mode: 'stand' | 'flat';
  innerU: number;
  innerR: number;
  innerF: number;
  front: boolean;
  floor: number;
  /** Les livres plus profonds que la caisse sont admis (ils dépassent devant). */
  overhang: boolean;
};

/** null : ouverture vers le sol. Une caisse transparente range aussi, sans parois ni montants. */
export const crateFrame = (c: Crate, tallest = MAX_BOOK_H): CrateFrame | null => {
  const s = crateDims(c);
  const wall = c.size === 'X' ? 0 : T;
  const qi = quatOf(c).clone().invert();
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(qi);
  down.set(Math.round(down.x), Math.round(down.y), Math.round(down.z));
  const ext = (v: THREE.Vector3): number =>
    Math.abs(v.x) * s.w + Math.abs(v.y) * s.h + Math.abs(v.z) * s.d;
  if (down.z > 0.5) return null;
  const Z = new THREE.Vector3(0, 0, 1);
  let U: THREE.Vector3;
  let R: THREE.Vector3;
  let F: THREE.Vector3;
  let mode: 'stand' | 'flat';
  let innerU: number;
  let front: boolean;
  if (down.z < -0.5) {
    // ouverture en haut : livres debout, hauteur le long de Z
    U = Z.clone();
    R = s.w >= s.h ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    F = new THREE.Vector3().crossVectors(R, U);
    mode = 'stand';
    innerU = Infinity;
    front = false;
  } else {
    // ouverture sur un côté : livres face à l'ouverture
    U = down.clone().negate();
    F = Z.clone();
    R = new THREE.Vector3().crossVectors(U, F);
    innerU = ext(U) - 2 * wall;
    // debout tant que le plus grand livre de la caisse passe sous le plafond, sinon à plat
    mode = c.flat || innerU < tallest + 0.05 ? 'flat' : 'stand';
    front = true;
  }
  // on ne retire que les parois et une petite marge
  const innerR = ext(R) - 2 * wall - 0.02;
  const innerF = ext(F) - wall;
  return {
    U,
    R,
    F,
    mode,
    innerU,
    innerR,
    innerF,
    front,
    floor: -ext(U) / 2 + wall,
    overhang: !!c.overhang && front,
  };
};

const _basis = new THREE.Matrix4();

/** Quaternion local du livre : axes du livre (X épaisseur, Y hauteur, Z tranche) → axes (a, b, c). */
export const bookQuat = (
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): THREE.Quaternion => {
  const x = a.clone();
  if (new THREE.Vector3().crossVectors(x, b).dot(c) < 0) x.negate();
  _basis.makeBasis(x, b, c);
  return new THREE.Quaternion().setFromRotationMatrix(_basis);
};

export type FillState = {
  cur: number;
  pile: number;
  pileH: number;
  /** Plus grand livre de la caisse : les piles se calent sur son côté gauche. */
  widest: number;
};

export const newFillState = (fr: CrateFrame | null, widest = 0): FillState => ({
  cur: fr ? -fr.innerR / 2 : 0,
  pile: 0,
  pileH: 0,
  widest,
});

/** Place un livre dans une caisse : renvoie [r, u] ou null si elle est pleine. */
export const placeInCrate = (fr: CrateFrame, st: FillState, b: Book): [number, number] | null => {
  // le livre doit tenir dans la caisse : profondeur toujours ; debout, sa hauteur sous le plafond ;
  // à plat, sa hauteur (couché, elle court le long de la rangée) dans la largeur d'une pile
  if (b.d > fr.innerF + 1e-3 && !fr.overhang) return null;
  if (fr.mode === 'stand') {
    if (b.h > fr.innerU + 1e-3) return null;
    if (st.cur + b.t > fr.innerR / 2 + 1e-3) return null;
    const r = st.cur + b.t / 2;
    // jour réduit pour les revues fines, sinon une rangée de magazines ne tient pas
    st.cur += b.t + Math.min(0.035, b.t / 2);
    return [r, fr.floor + b.h / 2];
  }
  // à plat : piles côte à côte le long de R
  const n = Math.max(1, Math.floor(fr.innerR / (MAX_BOOK_H + 0.05)));
  if (b.h > fr.innerR / n + 1e-3) return null;
  while (st.pile < n) {
    if (st.pileH + b.t <= fr.innerU - 0.02) {
      // la pile est calée contre le côté gauche, sur la largeur de son plus grand livre : lui part du
      // bord, les plus petits sont centrés dessus
      const r = -fr.innerR / 2 + (fr.innerR / n) * st.pile + Math.max(st.widest, b.h) / 2;
      const u = fr.floor + st.pileH + b.t / 2;
      st.pileH += b.t;
      return [r, u];
    }
    st.pile++;
    st.pileH = 0;
  }
  return null;
};
