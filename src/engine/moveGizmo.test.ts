import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildMoveGizmo, type MoveGizmo } from './moveGizmo';

// moveGizmo importe les couleurs de worldAxes, qui dessine des lettres sur canevas : inutile ici
vi.mock('./worldAxes', () => ({ AXIS_COLORS: { x: 0xe74c3c, y: 0x3498db, z: 0x2ecc71 } }));

let g: MoveGizmo;

beforeEach(() => {
  g = buildMoveGizmo();
});

describe('buildMoveGizmo', () => {
  it('démarre caché, avec six zones de clic (une par sens de chaque axe)', () => {
    expect(g.group.visible).toBe(false);
    expect(g.group.children).toHaveLength(6);
    const kinds = g.hits.map((h) => h.userData);
    expect(kinds).toHaveLength(6);
    for (const axis of ['x', 'y', 'z']) {
      for (const sign of [1, -1]) expect(kinds).toContainEqual({ kind: 'move', axis, sign });
    }
  });

  it('range les zones de clic dans leur flèche, invisibles', () => {
    for (const h of g.hits) {
      expect((h.material as THREE.MeshBasicMaterial).visible).toBe(false);
      expect(h.parent).toBeInstanceOf(THREE.Group);
    }
  });

  it('oriente chaque flèche vers son axe et son sens', () => {
    const dirs = g.group.children.map((arrow, i) => {
      const hit = g.hits[i]!;
      const { axis, sign } = hit.userData as { axis: string; sign: number };
      // la flèche est construite le long de +Y puis tournée
      const d = new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion);
      return { axis, sign, d: d.toArray().map((n) => Math.round(n)) };
    });
    for (const { axis, sign, d } of dirs) {
      const expected = { x: [sign, 0, 0], y: [0, sign, 0], z: [0, 0, sign] }[
        axis as 'x' | 'y' | 'z'
      ];
      expect(d.map((n) => n + 0)).toEqual(expected.map((n) => n + 0));
    }
  });

  it('éloigne les flèches de l’enveloppe de la caisse (demi-cote + 0,18)', () => {
    g.fit(4, 6, 2);
    const posOf = (axis: string, sign: number): number[] => {
      const i = g.hits.findIndex((h) => h.userData.axis === axis && h.userData.sign === sign);
      return g.group.children[i]!.position.toArray().map((n) => n + 0); // sans -0
    };
    expect(posOf('x', 1)).toEqual([2.18, 0, 0]);
    expect(posOf('x', -1)).toEqual([-2.18, 0, 0]);
    expect(posOf('y', 1)).toEqual([0, 3.18, 0]);
    expect(posOf('z', -1)).toEqual([0, 0, -1.18]);
  });

  it('ne montre les flèches haut / bas que si demandé', () => {
    const vis = (sign: number): boolean => {
      const i = g.hits.findIndex((h) => h.userData.axis === 'y' && h.userData.sign === sign);
      return g.group.children[i]!.visible;
    };
    g.setVertical(true, false);
    expect([vis(1), vis(-1)]).toEqual([true, false]);
    g.setVertical(false, true);
    expect([vis(1), vis(-1)]).toEqual([false, true]);
  });

  it('activeHits écarte les zones des flèches masquées, sans toucher aux flèches horizontales', () => {
    expect(g.activeHits()).toHaveLength(6);
    g.setVertical(false, false);
    const active = g.activeHits();
    expect(active).toHaveLength(4);
    expect(active.every((h) => h.userData.axis !== 'y')).toBe(true);
    g.setVertical(true, false);
    expect(g.activeHits()).toHaveLength(5);
  });

  it('met en avant l’axe survolé et rétablit les autres', () => {
    const opacities = (): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const h of g.hits) {
        const mat = (h.parent!.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
        out[h.userData.axis] = mat.opacity;
      }
      return out;
    };
    expect(opacities()).toEqual({ x: 0.85, y: 0.85, z: 0.85 });
    g.highlight('y');
    expect(opacities()).toEqual({ x: 0.85, y: 1, z: 0.85 });
    g.highlight(null);
    expect(opacities()).toEqual({ x: 0.85, y: 0.85, z: 0.85 });
  });
});
