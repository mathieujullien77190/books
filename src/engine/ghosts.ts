import type * as THREE from 'three';

import type { MissingVolume } from '@/helpers';
import type { Book } from '@/types';

import { makeBookRig } from './books';

/** Opacité d'un livre manquant : assez lisible pour reconnaître la série, assez pâle pour voir qu'il manque. */
const GHOST_OPACITY = 0.5;

/**
 * Livre manquant : même dos, mêmes dimensions et même couleur que le livre le plus proche de la série,
 * avec son propre numéro sur la tranche, rendu translucide. Renvoie le maillage et son épaisseur.
 */
export const buildGhostBook = (
  m: MissingVolume,
  aniso: number,
): { mesh: THREE.Object3D; t: number } => {
  const tpl = m.template;
  const book: Book = {
    id: `ghost-${m.series}-${m.num}`,
    title: m.label,
    color: tpl.color,
    spineColor: tpl.spineColor,
    summary: '',
    h: tpl.h,
    d: tpl.d,
    t: tpl.t,
    crate: null,
    kind: tpl.kind,
  };
  const rig = makeBookRig(book, aniso);
  const mats = new Set(rig.mesh.material);
  for (const mat of mats) {
    mat.transparent = true;
    mat.opacity = GHOST_OPACITY;
    mat.depthWrite = false;
  }
  rig.mesh.castShadow = false;
  rig.mesh.receiveShadow = false;
  return { mesh: rig.mesh, t: book.t };
};
