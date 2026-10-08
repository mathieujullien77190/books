/**
 * Rangement des livres : calcule pour chaque livre sa cible (position, orientation) dans sa caisse
 * ou dans la pile « à côté », et le décompte par caisse. Ne crée pas les rigs lui-même (le moteur
 * les fournit via `rigOf`) ; les mouvements sont ensuite animés par la boucle de rendu.
 * Aucun hasard : le désordre des piles dépend de l'id du livre (voir cratePlacement.ts).
 */
import * as THREE from 'three';

import { PLANK as T } from '@/constants';
import type { Book, Crate, Id, Mode } from '@/types';

import {
  bookQuat,
  crateFrame,
  ensureCover,
  newFillState,
  placeInCrate,
  setSpineFlat,
  type BookRig,
} from './books';
import { pileJitter, stackJitter, type Bounds } from './cratePlacement';
import type { CrateRig } from './crate';
import { AXES } from './orientation';

export type LayoutInput = {
  crates: Crate[];
  books: Book[];
  crateRigs: Map<Id, CrateRig>;
  bounds: Bounds;
  aniso: number;
  mode: Mode;
  /** Rig du livre (créé à la demande par le moteur). */
  rigOf: (b: Book) => BookRig;
  /** Livre en main ou sorti : il garde sa place, il suit la souris / la caméra. */
  isHeld: (b: Book) => boolean;
};

export type LayoutResult = {
  /** Nombre de livres rangés par caisse. */
  counts: Map<Id, number>;
  stats: { stored: number; loose: number; full: number };
};

// vecteurs de travail
const _local = new THREE.Vector3();
const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();

/** Chaque livre appartient à une caisse (b.crate) ou à la pile « à côté ». Aucune redistribution automatique. */
export const layoutBooks = (inp: LayoutInput): LayoutResult => {
  const { crates, books, crateRigs, aniso, rigOf, isHeld } = inp;
  const bb = inp.bounds;
  const counts = new Map<Id, number>();
  for (const c of crates) counts.set(c.id, 0);
  let pileY = 0;
  let loose = 0;
  let full = 0;
  const toPile = (b: Book, rig: BookRig): void => {
    loose++;
    ensureCover(rig, b, aniso); // la pile « à côté » est couchée, couverture dessus
    const pj = pileJitter(b.id); // désordre fixe pour un même livre : la pile ne bouge pas à chaque refresh
    rig.target.set(bb.maxX + 1.2 + pj.dx, pileY + b.t / 2, bb.cz + pj.dz);
    rig.quat.setFromEuler(_euler.set(0, pj.yaw, Math.PI / 2));
    rig.r = null;
    setSpineFlat(rig, false);
    pileY += b.t;
  };

  const byCrate = new Map<Id, Book[]>();
  const unassigned: Book[] = [];
  for (const b of books) {
    if (b.crate && crateRigs.has(b.crate)) {
      const list = byCrate.get(b.crate) ?? [];
      list.push(b);
      byCrate.set(b.crate, list);
    } else unassigned.push(b);
  }
  for (const [cid, list] of byCrate) {
    const c = crates.find((k) => k.id === cid);
    const rig = crateRigs.get(cid);
    if (!c || !rig) continue;
    const fr = crateFrame(c, Math.max(...list.map((b) => b.h)));
    // livres à plat tournés de 90° : leur hauteur et leur profondeur s'échangent pour le rangement
    const turn = !!c.flatTurn && !!fr && fr.mode === 'flat';
    const eff = (k: Book): Book => (turn ? { ...k, h: k.d, d: k.h } : k);
    const st = newFillState(fr, Math.max(...list.map((k) => eff(k).h)));
    const deepest = Math.max(...list.map((k) => eff(k).d));
    // debout : repère de la caisse ; à plat la couverture est toujours dessus : la hauteur du livre
    // court vers -R (sinon bookQuat retourne l'épaisseur et la 4e de couverture se retrouve dessus)
    const modeQ = fr
      ? fr.mode === 'stand'
        ? bookQuat(fr.R, fr.U, fr.F)
        : bookQuat(fr.U, fr.R.clone().negate(), fr.F)
      : null;
    for (const b of list) {
      const br = rigOf(b);
      const ru = fr ? placeInCrate(fr, st, eff(b)) : null;
      if (!ru || !fr || !modeQ) {
        if (fr) full++;
        toPile(b, br);
        continue;
      }
      counts.set(cid, counts.get(cid)! + 1);
      br.r = ru[0];
      setSpineFlat(br, fr.mode === 'flat');
      if (fr.mode === 'flat') ensureCover(br, b, aniso); // couché, la couverture est dessus
      if (isHeld(b)) continue; // livre en main ou sorti : garde sa place, suit la souris / la caméra
      // au ras de l'ouverture ; un livre plus profond que la caisse est calé au fond et dépasse devant.
      // À plat, la pile se cale sur son livre le plus profond et les autres y sont centrés.
      const fOf = (d: number): number =>
        d > fr.innerF ? -fr.innerF / 2 + T / 2 + d / 2 : fr.innerF / 2 + T / 2 - 0.1 - d / 2;
      const f = !fr.front ? 0 : fOf(fr.mode === 'flat' ? deepest : eff(b).d);
      // à plat, la pile n'est jamais parfaite : léger décalage gauche-droite / avant-arrière et léger
      // quart de tour, fixes pour un même livre (tirés de son id, pas de hasard à chaque rendu)
      const jit = fr.mode === 'flat' ? stackJitter(b.id) : null;
      _local
        .set(0, 0, 0)
        .addScaledVector(fr.R, ru[0] + (jit ? jit.dr : 0))
        .addScaledVector(fr.U, ru[1])
        .addScaledVector(fr.F, f + (jit ? jit.df : 0));
      rig.group.localToWorld(_local);
      br.target.copy(_local);
      br.quat.copy(rig.group.quaternion).multiply(modeQ);
      // rotation de 90° vers la droite autour de la verticale (l'axe local X du livre couché)
      if (turn) br.quat.multiply(_q.setFromAxisAngle(AXES.x, -Math.PI / 2));
      // le livre est couché : son axe local X (l'épaisseur) pointe vers le haut, il pivote autour
      if (jit) br.quat.multiply(_q.setFromAxisAngle(AXES.x, jit.yaw));
    }
  }
  for (const b of unassigned) {
    const br = rigOf(b);
    if (isHeld(b)) {
      loose++;
      pileY += b.t;
      continue;
    }
    toPile(b, br);
  }
  // lecture : un espace transparent n'est qu'un regroupement, sa coque s'efface (livres et numéro restent)
  for (const c of crates) {
    const rig = crateRigs.get(c.id);
    if (!rig || !rig.shell.length) continue;
    for (const o of rig.shell) o.visible = inp.mode !== 'view';
  }
  return { counts, stats: { stored: books.length - loose, loose, full } };
};
