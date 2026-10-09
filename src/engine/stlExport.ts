/**
 * Export STL (binaire) de la bibliothèque : les planches des caisses et tous les livres, en millimètres et
 * avec l'axe Z vers le haut (convention des logiciels d'impression 3D et de CAO), alors que la scène est en
 * unités de 10 cm avec Y vers le haut. Les volumes transparents, les boîtes de sélection et les lignes
 * (arêtes, cadres) ne sont pas exportés.
 */
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

/** Une caisse à exporter : son groupe et les objets de son enveloppe transparente (à ignorer). */
export type StlCrate = { group: THREE.Object3D; shell: THREE.Object3D[] };

/** Millimètres par unité de la scène (1 unité = 10 cm). */
const MM_PER_UNIT = 100;

/** Les maillages pleins d'un objet : sans les boîtes invisibles (sélection) ni l'enveloppe transparente. */
const solidMeshes = (root: THREE.Object3D, skip: Set<THREE.Object3D>): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (skip.has(o) || !(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    const hidden = !Array.isArray(mesh.material) && mesh.material.visible === false;
    if (!hidden) out.push(mesh);
  });
  return out;
};

/** Fichier STL binaire des caisses et des livres tels qu'ils sont posés en ce moment. */
export const buildStl = (crates: StlCrate[], books: THREE.Mesh[]): ArrayBuffer => {
  const root = new THREE.Group();
  root.rotation.x = Math.PI / 2; // Y vers le haut → Z vers le haut
  root.scale.setScalar(MM_PER_UNIT);
  const add = (mesh: THREE.Mesh): void => {
    mesh.updateWorldMatrix(true, false);
    const copy = new THREE.Mesh(mesh.geometry);
    copy.applyMatrix4(mesh.matrixWorld);
    root.add(copy);
  };
  for (const { group, shell } of crates) solidMeshes(group, new Set(shell)).forEach(add);
  books.forEach(add);
  root.updateMatrixWorld(true);
  const view = new STLExporter().parse(root, { binary: true }) as DataView;
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
};
