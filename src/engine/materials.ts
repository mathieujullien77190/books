import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

import { rand } from '@/helpers';

/** Boîte aux sommets légèrement déplacés : rendu low-poly « taillé à la main ». */
export const lowPolyBox = (
  w: number,
  h: number,
  d: number,
  jitter = 0.022,
): THREE.BufferGeometry => {
  let geo: THREE.BufferGeometry = new THREE.BoxGeometry(w, h, d);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(
      i,
      p.getX(i) + (Math.random() - 0.5) * jitter,
      p.getY(i) + (Math.random() - 0.5) * jitter,
      p.getZ(i) + (Math.random() - 0.5) * jitter,
    );
  }
  geo.computeVertexNormals();
  return geo;
};

/** Bois vieilli : gris-brun délavé, forte variation d'une planche à l'autre. */
export const woodMaterial = (): THREE.MeshStandardMaterial => {
  const grey = Math.random() < 0.3;
  const c = grey
    ? new THREE.Color().setHSL(rand(0.08, 0.12), rand(0.06, 0.14), rand(0.26, 0.38))
    : new THREE.Color().setHSL(rand(0.06, 0.09), rand(0.18, 0.32), rand(0.2, 0.34));
  return new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
    envMapIntensity: 0.25,
  });
};

/** Acier sombre un peu patiné — partagé, ne jamais le disposer. */
export const metalMat = new THREE.MeshStandardMaterial({
  color: 0x8a8f96,
  metalness: 0.8,
  roughness: 0.45,
  flatShading: true,
  envMapIntensity: 1.0,
});

/** Cadre de sélection : dessiné par-dessus tout, sinon ses arêtes basses (sous le sol) disparaissent. */
export const outlineMat = new THREE.LineBasicMaterial({
  color: 0xb5651d,
  depthTest: false,
  depthWrite: false,
  transparent: true,
});

const SHARED = new Set<THREE.Material>([metalMat, outlineMat]);

/** Libère géométries, matériaux et textures d'un groupe (sauf les matériaux partagés). */
export const disposeGroup = (g: THREE.Object3D): void => {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (!mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (SHARED.has(m)) continue;
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map) map.dispose();
      m.dispose();
    }
  });
};
