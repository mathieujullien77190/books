import type * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFakeCanvas, type FakeCanvas } from '@/test/fakeCanvas';

import { AXIS_COLORS, AXIS_LABELS, buildGrid, buildWorldAxes } from './worldAxes';

let canvases: FakeCanvas[];

beforeEach(() => {
  canvases = installFakeCanvas();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('conventions d’affichage', () => {
  it('suit la convention CAO : le Y affiché est la profondeur, le Z affiché la verticale', () => {
    expect(AXIS_LABELS).toEqual({ x: 'X', y: 'Z', z: 'Y' });
    expect(AXIS_COLORS.x).toBe(0xe74c3c);
    expect(AXIS_COLORS.y).toBe(0x3498db);
    expect(AXIS_COLORS.z).toBe(0x2ecc71);
  });
});

describe('buildGrid', () => {
  it('trace une grille de 40 unités au ras du sol, translucide', () => {
    const grid = buildGrid();
    expect(grid.position.y).toBeCloseTo(0.01);
    const mat = grid.material as THREE.LineBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBe(0.45);
    // 80 carreaux : 81 lignes par sens
    expect(grid.geometry.attributes.position!.count).toBe(81 * 2 * 2);
  });
});

describe('buildWorldAxes', () => {
  const lineOf = (g: THREE.Group, i: number): THREE.Line => g.children[i * 2] as THREE.Line;
  const tagOf = (g: THREE.Group, i: number): THREE.Sprite => g.children[i * 2 + 1] as THREE.Sprite;
  const ends = (l: THREE.Line): number[] =>
    Array.from(l.geometry.attributes.position!.array).map((n) => n + 0); // sans -0

  it('crée trois axes colorés, chacun avec sa lettre, de 0 à 3 au départ', () => {
    const { group } = buildWorldAxes();
    expect(group.children).toHaveLength(6);
    expect(ends(lineOf(group, 0))).toEqual([0, 0, 0, 3, 0, 0]);
    expect(ends(lineOf(group, 1))).toEqual([0, 0, 0, 0, 3, 0]);
    expect(ends(lineOf(group, 2))).toEqual([0, 0, 0, 0, 0, 3]);
    expect((lineOf(group, 0).material as THREE.LineBasicMaterial).color.getHex()).toBe(0xe74c3c);
    // lettres dessinées sur des canevas de 64 px dans la couleur de l'axe
    expect(canvases.map((c) => c.ctx.texts())).toEqual([['X'], ['Z'], ['Y']]);
    expect(canvases[0]!.ctx.of('fillText')[0]!.fillStyle).toBe('#e74c3c');
    expect(canvases[2]!.ctx.of('fillText')[0]!.fillStyle).toBe('#2ecc71');
    expect([canvases[0]!.width, canvases[0]!.height]).toEqual([64, 64]);
  });

  it('place la lettre un peu au-delà du bout positif', () => {
    const { group } = buildWorldAxes();
    expect(tagOf(group, 0).position.toArray()).toEqual([3.45, 0, 0]);
    expect(tagOf(group, 2).position.z).toBeCloseTo(3.45);
    expect(tagOf(group, 0).renderOrder).toBe(998);
    expect(tagOf(group, 0).scale.x).toBeCloseTo(0.6);
  });

  it('étend un axe de neg à pos et déplace sa lettre', () => {
    const { group, setExtent } = buildWorldAxes();
    setExtent('z', -2, 7);
    expect(ends(lineOf(group, 2))).toEqual([0, 0, -2, 0, 0, 7]);
    expect(
      tagOf(group, 2)
        .position.toArray()
        .map((n) => n + 0),
    ).toEqual([0, 0, 7.45]);
    // les autres axes ne bougent pas
    expect(ends(lineOf(group, 0))).toEqual([0, 0, 0, 3, 0, 0]);
    // la sphère englobante suit, sinon la ligne serait coupée par le culling
    expect(lineOf(group, 2).geometry.boundingSphere!.radius).toBeGreaterThan(4);
  });

  it('dessine les axes par-dessus la scène', () => {
    const { group } = buildWorldAxes();
    const line = lineOf(group, 1);
    expect(line.renderOrder).toBe(996);
    expect((line.material as THREE.LineBasicMaterial).depthTest).toBe(false);
  });
});
