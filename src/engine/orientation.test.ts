import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { makeCrate } from '@/test/fixtures';

import {
  AXES,
  Q_DEBOUT,
  Q_TRANCHE,
  extents,
  footprint,
  overlaps,
  quatOf,
  rotatedQuat,
  snapQuat,
} from './orientation';

/** Image d'un vecteur par un quaternion sérialisé, arrondie pour comparer sans bruit flottant. */
const apply = (q: [number, number, number, number], v: THREE.Vector3): number[] =>
  v
    .clone()
    .applyQuaternion(new THREE.Quaternion().fromArray(q))
    .toArray()
    .map((n) => Math.round(n * 1e6) / 1e6 + 0);

describe('constantes d’orientation', () => {
  it('donne les trois axes unitaires du monde', () => {
    expect(AXES.x.toArray()).toEqual([1, 0, 0]);
    expect(AXES.y.toArray()).toEqual([0, 1, 0]);
    expect(AXES.z.toArray()).toEqual([0, 0, 1]);
  });

  it('Q_TRANCHE est l’identité, Q_DEBOUT couche l’ouverture vers le haut', () => {
    expect(Q_TRANCHE).toEqual([0, 0, 0, 1]);
    // l'ouverture (+Z local) pointe en haut (+Y) une fois la caisse debout
    expect(apply(Q_DEBOUT, new THREE.Vector3(0, 0, 1))).toEqual([0, 1, 0]);
  });
});

describe('quatOf', () => {
  it('lit le quaternion de la caisse', () => {
    const q = quatOf(makeCrate({ q: Q_DEBOUT }));
    expect(q.toArray()).toEqual(Q_DEBOUT);
  });
});

describe('snapQuat', () => {
  it('recale une rotation presque d’un quart de tour sur le quart de tour exact', () => {
    const noisy = new THREE.Quaternion().setFromAxisAngle(AXES.y, Math.PI / 2 + 0.01);
    const snapped = snapQuat(noisy);
    const exact = new THREE.Quaternion().setFromAxisAngle(AXES.y, Math.PI / 2);
    expect(snapped.angleTo(exact)).toBeLessThan(1e-9);
  });
});

describe('rotatedQuat', () => {
  it('tourne la caisse d’un quart de tour autour d’un axe du monde', () => {
    const q = rotatedQuat(makeCrate(), 'y', 1);
    // +Z (ouverture) devient +X après +90° autour de Y
    expect(apply(q, new THREE.Vector3(0, 0, 1))).toEqual([1, 0, 0]);
  });

  it('le sens -1 tourne dans l’autre sens', () => {
    const q = rotatedQuat(makeCrate(), 'y', -1);
    expect(apply(q, new THREE.Vector3(0, 0, 1))).toEqual([-1, 0, 0]);
  });

  it('compose avec l’orientation actuelle, sans dérive', () => {
    let c = makeCrate();
    for (let i = 0; i < 4; i++) c = { ...c, q: rotatedQuat(c, 'x', 1) };
    expect(c.q.map((n) => Math.abs(Math.round(n * 1e6) / 1e6))).toEqual([0, 0, 0, 1]);
  });
});

describe('extents', () => {
  it('donne les cotes de la caisse alignées sur le monde (sans marge par défaut)', () => {
    expect(extents(makeCrate())).toEqual({ fx: 2.5, fy: 3.5, fz: 2.2 });
  });

  it('ajoute la marge de chaque côté', () => {
    const e = extents(makeCrate(), 0.1);
    expect(e.fx).toBeCloseTo(2.7);
    expect(e.fy).toBeCloseTo(3.7);
    expect(e.fz).toBeCloseTo(2.4);
  });

  it('échange largeur et profondeur après un quart de tour autour de la verticale', () => {
    const c = makeCrate({ q: rotatedQuat(makeCrate(), 'y', 1) });
    const e = extents(c);
    expect(e.fx).toBeCloseTo(2.2);
    expect(e.fz).toBeCloseTo(2.5);
    expect(e.fy).toBeCloseTo(3.5);
  });

  it('utilise les cotes propres d’une caisse transparente', () => {
    const c = makeCrate({ size: 'X', dims: { w: 1, h: 2, d: 3 } });
    expect(extents(c)).toEqual({ fx: 1, fy: 2, fz: 3 });
  });
});

describe('footprint et overlaps', () => {
  it('calcule l’emprise au sol centrée sur la caisse', () => {
    const fp = footprint(makeCrate({ x: 10, z: -4 }));
    expect(fp).toMatchObject({
      x0: 8.75,
      x1: 11.25,
      z0: -5.1,
      z1: -2.9,
      fx: 2.5,
      fy: 3.5,
      fz: 2.2,
    });
  });

  it('détecte le chevauchement de deux emprises', () => {
    const a = footprint(makeCrate({ x: 0 }));
    expect(overlaps(a, footprint(makeCrate({ x: 1 })))).toBe(true);
    expect(overlaps(a, footprint(makeCrate({ x: 10 })))).toBe(false);
    expect(overlaps(a, footprint(makeCrate({ z: 10 })))).toBe(false);
  });

  it('ignore un simple frôlement (caisses collées)', () => {
    const a = footprint(makeCrate({ x: 0 }));
    const b = footprint(makeCrate({ x: 2.5 }));
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(a, footprint(makeCrate({ x: 2.4 })))).toBe(true);
    // une tolérance plus large rend un recouvrement plus net nécessaire
    expect(overlaps(a, footprint(makeCrate({ x: 2.4 })), 0.5)).toBe(false);
  });

  it('exige aussi un recouvrement sur Z (mêmes x, z éloignés par un seul côté)', () => {
    const a = footprint(makeCrate());
    expect(overlaps(a, footprint(makeCrate({ x: 0.5, z: 5 })))).toBe(false);
    expect(overlaps(footprint(makeCrate({ x: 5 })), footprint(makeCrate({ x: 0, z: 0.5 })))).toBe(
      false,
    );
  });
});
