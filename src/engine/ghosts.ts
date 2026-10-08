import type * as THREE from 'three';

import type { MissingVolume } from '@/helpers';
import type { Book } from '@/types';

import { makeBookRig } from './books';

/**
 * Livre manquant : même dos, mêmes dimensions et même couleur que le livre le plus proche de la série,
 * avec son propre numéro sur la tranche. Renvoie le maillage et son épaisseur.
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
  rig.mesh.castShadow = false;
  rig.mesh.receiveShadow = false;
  return { mesh: rig.mesh, t: book.t };
};
