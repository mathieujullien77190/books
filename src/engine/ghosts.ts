import * as THREE from 'three';

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

/** Texture du papier : « Livres à acheter » écrit à la main, avec le nombre de tomes manquants. */
const noteTexture = (count: number): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 288;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4edd8';
  g.fillRect(0, 0, c.width, c.height);
  // vieilles fibres et lignes de cahier légères
  g.strokeStyle = 'rgba(120,150,190,0.25)';
  g.lineWidth = 2;
  for (let y = 70; y < c.height; y += 44) {
    g.beginPath();
    g.moveTo(24, y);
    g.lineTo(c.width - 24, y);
    g.stroke();
  }
  g.fillStyle = '#2a3a63';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = "italic 700 62px 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
  g.fillText('Livres', c.width / 2, 78);
  g.fillText('à acheter', c.width / 2, 150);
  g.font = "italic 600 44px 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
  g.fillStyle = '#7a2a2f';
  g.fillText(`(${count})`, c.width / 2, 228);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

/**
 * Un bout de papier plié en deux, posé en tente sur le dessus de la pile des livres manquants :
 * « Livres à acheter ». Le panneau avant est écrit, l'arrière est du papier uni.
 */
export const buildNote = (count: number): THREE.Group => {
  const W = 1.5; // largeur du papier
  const L = 0.95; // longueur d'un panneau (le long de la pente)
  const a = 0.62; // inclinaison de chaque panneau par rapport à la verticale (rad)
  const group = new THREE.Group();
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(W, L),
    new THREE.MeshBasicMaterial({ map: noteTexture(count), side: THREE.DoubleSide }),
  );
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(W, L),
    new THREE.MeshBasicMaterial({ color: 0xe8dfc4, side: THREE.DoubleSide }),
  );
  const ridge = L * Math.cos(a);
  const run = L * Math.sin(a);
  front.position.set(0, ridge / 2, run / 2);
  front.rotation.x = -a;
  back.position.set(0, ridge / 2, -run / 2);
  back.rotation.x = a;
  group.add(front, back);
  return group;
};
