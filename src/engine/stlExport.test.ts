import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { buildStl, type StlCrate } from './stlExport';

/** STL binaire : 80 octets d'en-tête, 4 octets de nombre de triangles, puis 50 octets par triangle. */
const triangles = (stl: ArrayBuffer): number => new DataView(stl).getUint32(80, true);

/** Sommets (x, y, z) de tous les triangles d'un STL binaire. */
const vertices = (stl: ArrayBuffer): number[][] => {
  const v = new DataView(stl);
  const out: number[][] = [];
  for (let t = 0; t < triangles(stl); t++)
    for (let k = 0; k < 3; k++) {
      const at = 84 + t * 50 + 12 + k * 12;
      out.push([0, 4, 8].map((o) => v.getFloat32(at + o, true)));
    }
  return out;
};

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  m.position.set(x, y, z);
  return m;
};

describe('buildStl', () => {
  it('exporte les planches des caisses et les livres : 12 triangles par pavé', () => {
    const group = new THREE.Group();
    group.add(box(1, 1, 1), box(1, 1, 1, 2, 0, 0));
    const stl = buildStl([{ group, shell: [] }], [box(0.2, 2, 1.4)]);
    expect(triangles(stl)).toBe(36);
    expect(stl.byteLength).toBe(84 + 36 * 50);
  });

  it('ignore la boîte invisible de sélection, les lignes et l’enveloppe transparente', () => {
    const group = new THREE.Group();
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)));
    const glass = box(3, 3, 3);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry));
    group.add(box(1, 1, 1), hit, outline, glass, edges);
    const crates: StlCrate[] = [{ group, shell: [glass, edges] }];
    expect(triangles(buildStl(crates, []))).toBe(12);
  });

  it('garde un maillage dont les matériaux sont multiples (livre à six faces)', () => {
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 1.4), [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
    ]);
    const group = new THREE.Group();
    group.add(book);
    expect(triangles(buildStl([{ group, shell: [] }], []))).toBe(12);
  });

  it('convertit les unités de 10 cm en millimètres et met Z vers le haut', () => {
    // un livre de 0,2 × 2 × 1,4 unités posé à 5 unités de haut : 20 × 200 × 140 mm, haut à 5,0 + 1,0 = 6 unités
    const stl = buildStl([], [box(0.2, 2, 1.4, 0, 5, 0)]);
    const pts = vertices(stl);
    const range = (axis: number): [number, number] => {
      const values = pts.map((p) => p[axis]!);
      return [Math.min(...values), Math.max(...values)];
    };
    const [zmin, zmax] = range(2);
    expect(zmin).toBeCloseTo(400, 1); // (5 - 1) × 100 mm
    expect(zmax).toBeCloseTo(600, 1); // (5 + 1) × 100 mm : la hauteur devient l'axe Z
    const [xmin, xmax] = range(0);
    expect(xmax - xmin).toBeCloseTo(20, 1);
  });

  it('tient compte de la position des objets parents', () => {
    const group = new THREE.Group();
    group.position.set(10, 0, 0);
    group.add(box(1, 1, 1, 1, 0, 0));
    const pts = vertices(buildStl([{ group, shell: [] }], []));
    const xs = pts.map((p) => p[0]!);
    expect(Math.min(...xs)).toBeCloseTo(1050, 1);
    expect(Math.max(...xs)).toBeCloseTo(1150, 1);
  });

  it('renvoie un STL valide même sans aucun objet', () => {
    const stl = buildStl([], []);
    expect(triangles(stl)).toBe(0);
    expect(stl.byteLength).toBe(84);
  });
});
