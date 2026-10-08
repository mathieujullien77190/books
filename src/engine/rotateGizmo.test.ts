import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRotateGizmo, type RotateGizmo } from './rotateGizmo';

vi.mock('./worldAxes', () => ({ AXIS_COLORS: { x: 0xe74c3c, y: 0x3498db, z: 0x2ecc71 } }));

let g: RotateGizmo;

beforeEach(() => {
  g = buildRotateGizmo();
});

const torus = (m: THREE.Mesh): THREE.TorusGeometry => m.geometry as THREE.TorusGeometry;
/** Flèche (groupe) qui contient la zone de clic. */
const arrowOf = (hit: THREE.Mesh): THREE.Group => hit.parent as THREE.Group;
const arcOf = (hit: THREE.Mesh): THREE.Mesh => arrowOf(hit).children[0] as THREE.Mesh;
const headOf = (hit: THREE.Mesh): THREE.Mesh => arrowOf(hit).children[1] as THREE.Mesh;

describe('buildRotateGizmo', () => {
  it('démarre caché avec six zones de clic : deux sens par axe', () => {
    expect(g.group.visible).toBe(false);
    expect(g.group.children).toHaveLength(3);
    expect(g.hits).toHaveLength(6);
    const kinds = g.hits.map((h) => h.userData);
    for (const axis of ['x', 'y', 'z'])
      for (const sign of [1, -1]) expect(kinds).toContainEqual({ axis, sign });
  });

  it('la flèche d’un sens est le miroir de celle du sens opposé', () => {
    const pos = g.hits.find((h) => h.userData.axis === 'x' && h.userData.sign === 1)!;
    const neg = g.hits.find((h) => h.userData.axis === 'x' && h.userData.sign === -1)!;
    expect(arrowOf(pos).parent!.scale.x).toBe(1);
    expect(arrowOf(neg).parent!.scale.x).toBe(-1);
  });

  it('oriente le plan de chaque axe : +Z local devient l’axe du monde', () => {
    for (const [axis, expected] of [
      ['x', [1, 0, 0]],
      ['y', [0, 1, 0]],
      ['z', [0, 0, 1]],
    ] as const) {
      const hit = g.hits.find((h) => h.userData.axis === axis && h.userData.sign === 1)!;
      const holder = arrowOf(hit).parent!;
      const d = new THREE.Vector3(0, 0, 1).applyQuaternion(holder.quaternion);
      expect(d.toArray().map((n) => Math.round(n) + 0)).toEqual(expected);
    }
  });

  it('reconstruit des arcs de longueur fixe (0,55) quel que soit le rayon', () => {
    g.fit(2);
    for (const h of g.hits) {
      const t = torus(arcOf(h));
      expect(t.parameters.radius).toBe(2);
      expect(t.parameters.arc).toBeCloseTo(0.55 / 2);
    }
    g.fit(5);
    expect(torus(arcOf(g.hits[0]!)).parameters.radius).toBe(5);
    expect(torus(arcOf(g.hits[0]!)).parameters.arc).toBeCloseTo(0.55 / 5);
  });

  it('place la pointe au bout de l’arc et centre la flèche sur l’angle zéro', () => {
    g.fit(2);
    const h = g.hits[0]!;
    const arc = 0.55 / 2;
    const head = headOf(h);
    expect(head.position.x).toBeCloseTo(2 * Math.cos(arc));
    expect(head.position.y).toBeCloseTo(2 * Math.sin(arc));
    expect(head.rotation.z).toBeCloseTo(arc);
    expect(arrowOf(h).rotation.z).toBeCloseTo(-arc / 2);
  });

  it('élargit la zone de clic autour de l’arc', () => {
    g.fit(2);
    const hit = torus(g.hits[0]!);
    expect(hit.parameters.tube).toBe(0.18);
    expect(hit.parameters.arc).toBeCloseTo(0.55 / 2 + 0.2 / 2);
  });

  it('ne reconstruit rien quand le rayon ne change presque pas', () => {
    g.fit(2);
    const before = arcOf(g.hits[0]!).geometry;
    g.fit(2.0005);
    expect(arcOf(g.hits[0]!).geometry).toBe(before);
    g.fit(2.1);
    expect(arcOf(g.hits[0]!).geometry).not.toBe(before);
  });

  it('libère l’ancienne géométrie à chaque reconstruction', () => {
    g.fit(2);
    const old = arcOf(g.hits[0]!).geometry;
    const spy = vi.spyOn(old, 'dispose');
    g.fit(3);
    expect(spy).toHaveBeenCalled();
  });

  it('met en avant l’axe survolé', () => {
    const op = (axis: string): number =>
      (arcOf(g.hits.find((h) => h.userData.axis === axis)!).material as THREE.MeshBasicMaterial)
        .opacity;
    g.highlight('z');
    expect([op('x'), op('y'), op('z')]).toEqual([0.85, 0.85, 1]);
    g.highlight(null);
    expect([op('x'), op('y'), op('z')]).toEqual([0.85, 0.85, 0.85]);
  });
});
