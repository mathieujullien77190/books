/**
 * Rig d'un livre (mesh à six faces, cible de position, état des textures) : création, mode léger
 * ou complet, mise à jour des textures, résolution de la couverture et libération.
 */
import * as THREE from 'three';

import type { Book, Id } from '@/types';

import { backCoverTexture, coverTexture, spineTexture } from './bookTextures';

export type BookMesh = THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial[]>;

export type BookRig = {
  id: Id;
  mesh: BookMesh;
  /** Position / orientation visées, atteintes par interpolation dans la boucle de rendu. */
  target: THREE.Vector3;
  quat: THREE.Quaternion;
  /** Abscisse dans la rangée de sa caisse (null : pas rangé). */
  r: number | null;
  /** Livre couché : le titre de la tranche est retourné d'un demi-tour pour se lire à l'endroit. */
  flat: boolean;
  /** Couverture et dos ne sont dessinés qu'au besoin (livre couché, voisin, sorti) : 300 livres debout
   * ne montrent que leur tranche, inutile de fabriquer 600 grandes textures au chargement. */
  faces: { cover: boolean; back: boolean };
};

/**
 * Mode léger (choisi sur téléphone) : les livres rangés sont des pavés d'une seule couleur, sans texture
 * dessinée (des centaines de canvas de dos et de couvertures font ramer un mobile). Le livre sorti garde
 * ses faces.
 */
let lite = false;
export const setLiteBooks = (on: boolean): void => {
  lite = on;
};

/** Applique le mode courant (léger ou complet) à un livre déjà construit : dos et faces refaits ou effacés. */
export const applyLiteMode = (rig: BookRig, b: Book, aniso: number): void => {
  const [front, back, , , spine] = rig.mesh.material;
  for (const m of [front!, back!]) {
    m.map?.dispose();
    m.map = null;
    m.color.set(b.color);
    m.needsUpdate = true;
  }
  rig.faces = { cover: false, back: false };
  spine!.map?.dispose();
  if (lite) {
    spine!.map = null;
    spine!.color.set(b.color);
  } else {
    spine!.color.set(0xffffff);
    spine!.map = spineTexture(b.title, b.color, aniso, b.t, b.h, b.spineColor);
    applySpineTurn(rig);
  }
  spine!.needsUpdate = true;
};

const applySpineTurn = (rig: BookRig): void => {
  const map = rig.mesh.material[4]?.map;
  if (!map) return;
  map.center.set(0.5, 0.5);
  // tranche écrite à l'horizontale : à plat (couverture dessus) c'est le titre horizontal qui se retourne
  map.rotation = rig.flat && map.userData.horizontal ? Math.PI : 0;
};

/**
 * Couché (couverture dessus), l'épaisseur et la hauteur du livre ne pointent plus comme debout : le
 * titre horizontal de la tranche doit être retourné pour se lire à l'endroit.
 */
export const setSpineFlat = (rig: BookRig, flat: boolean): void => {
  if (rig.flat === flat) return;
  rig.flat = flat;
  applySpineTurn(rig);
};

const bookMat = (opts: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    roughness: 0.75,
    flatShading: true,
    envMapIntensity: 0.4,
    ...opts,
  });

/** Faces : +X couverture, -X dos (titre + résumé), +Y tête, -Y pied, +Z tranche, -Z gouttière. */
export const makeBookRig = (b: Book, aniso: number): BookRig => {
  const edge = new THREE.Color(b.color).multiplyScalar(0.92);
  const front = bookMat({ color: b.color });
  const back = bookMat({ color: b.color });
  const edgeColor = bookMat({ color: edge });
  const pages = bookMat({ color: 0xf3ead6, roughness: 1, envMapIntensity: 0.3 });
  const spine = lite
    ? bookMat({ color: b.color })
    : bookMat({ map: spineTexture(b.title, b.color, aniso, b.t, b.h, b.spineColor) });
  const mesh: BookMesh = new THREE.Mesh(new THREE.BoxGeometry(b.t, b.h, b.d), [
    front,
    back,
    pages,
    edgeColor,
    spine,
    pages,
  ]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.id = b.id;
  mesh.position.set(0, 8, 0);
  return {
    id: b.id,
    mesh,
    target: new THREE.Vector3(0, 8, 0),
    quat: new THREE.Quaternion(),
    r: null,
    flat: false,
    faces: { cover: false, back: false },
  };
};

/** Dessine la couverture si elle ne l'est pas encore (livre couché, voisin du livre sorti…). En mode léger, seulement si `force`. */
export const ensureCover = (rig: BookRig, b: Book, aniso: number, force = false): void => {
  if (rig.faces.cover || (lite && !force)) return;
  const front = rig.mesh.material[0]!;
  rig.faces.cover = true;
  front.color.set(0xffffff);
  front.map = coverTexture(b.title, b.color, aniso, b.cover, b.author, 1, b.kind);
  front.needsUpdate = true;
};

/** Titre, couleur, résumé ou métadonnées modifiés : régénère couverture, dos et tranche. */
export const updateBookTextures = (rig: BookRig, b: Book, aniso: number): void => {
  const [front, back, , edgeColor, spine] = rig.mesh.material;
  if (rig.faces.cover) {
    front!.map?.dispose();
    front!.map = coverTexture(b.title, b.color, aniso, b.cover, b.author, 1, b.kind);
  } else front!.color.set(b.color);
  front!.needsUpdate = true;
  if (rig.faces.back) {
    back!.map?.dispose();
    back!.map = backCoverTexture(b.title, b.color, aniso, b.summary, b.author, b.publisher, b.year);
  } else back!.color.set(b.color);
  back!.needsUpdate = true;
  if (lite) spine!.color.set(b.color);
  else {
    spine!.map?.dispose();
    spine!.map = spineTexture(b.title, b.color, aniso, b.t, b.h, b.spineColor);
  }
  spine!.needsUpdate = true;
  applySpineTurn(rig);
  edgeColor!.color.set(b.color).multiplyScalar(0.92);
};

/** Redessine couverture et dos à `scale` fois la résolution : ×2 pour le livre sorti, qui occupe
 * l'écran et dont le texte doit rester net, ×1 une fois rangé (200 livres en mémoire graphique). */
export const setBookResolution = (rig: BookRig, b: Book, aniso: number, scale: number): void => {
  const [front, back] = rig.mesh.material;
  if (lite && scale <= 1) {
    // rangé : retour au pavé uni
    for (const m of [front!, back!]) {
      m.map?.dispose();
      m.map = null;
      m.color.set(b.color);
      m.needsUpdate = true;
    }
    rig.faces = { cover: false, back: false };
    return;
  }
  rig.faces = { cover: true, back: true };
  front!.color.set(0xffffff);
  back!.color.set(0xffffff);
  front!.map?.dispose();
  front!.map = coverTexture(b.title, b.color, aniso, b.cover, b.author, scale, b.kind);
  front!.needsUpdate = true;
  back!.map?.dispose();
  back!.map = backCoverTexture(
    b.title,
    b.color,
    aniso,
    b.summary,
    b.author,
    b.publisher,
    b.year,
    scale,
  );
  back!.needsUpdate = true;
};

export const disposeBookRig = (rig: BookRig): void => {
  rig.mesh.geometry.dispose();
  for (const m of rig.mesh.material) {
    m.map?.dispose();
    m.dispose();
  }
};
