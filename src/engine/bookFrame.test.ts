import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { makeBook, makeCrate } from '@/test/fixtures';
import type { Crate, Quat } from '@/types';

import { bookQuat, crateFrame, newFillState, placeInCrate, type CrateFrame } from './bookFrame';
import { Q_DEBOUT } from './orientation';

const v = (x: number, y: number, z: number): number[] => [x, y, z];
const arr = (a: THREE.Vector3): number[] => a.toArray().map((n) => Math.round(n * 1e6) / 1e6 + 0);

/** Ouverture vers le sol : quart de tour de signe opposé à Q_DEBOUT. */
const Q_OUVERTURE_BAS: Quat = new THREE.Quaternion()
  .setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
  .toArray() as Quat;

const frame = (c: Crate, tallest?: number): CrateFrame => {
  const fr = crateFrame(c, tallest);
  if (!fr) throw new Error('repère attendu');
  return fr;
};

describe('crateFrame', () => {
  it('caisse ouverte devant : livres debout, rangée le long de X', () => {
    const fr = frame(makeCrate());
    expect(arr(fr.U)).toEqual(v(0, 1, 0));
    expect(arr(fr.R)).toEqual(v(1, 0, 0));
    expect(arr(fr.F)).toEqual(v(0, 0, 1));
    expect(fr.mode).toBe('stand');
    expect(fr.front).toBe(true);
    expect(fr.innerU).toBeCloseTo(3.5 - 0.16);
    expect(fr.innerR).toBeCloseTo(2.5 - 0.16 - 0.02);
    expect(fr.innerF).toBeCloseTo(2.2 - 0.08);
    expect(fr.floor).toBeCloseTo(-1.75 + 0.08);
    expect(fr.overhang).toBe(false);
  });

  it('range à plat si la caisse est réglée ainsi', () => {
    expect(frame(makeCrate({ flat: true })).mode).toBe('flat');
  });

  it('range à plat si le plus grand livre ne passe pas sous le plafond', () => {
    expect(frame(makeCrate(), 3.4).mode).toBe('flat');
    expect(frame(makeCrate(), 3.2).mode).toBe('stand');
  });

  it('reporte le dépassement permis (overhang) seulement quand la caisse a une ouverture sur un côté', () => {
    expect(frame(makeCrate({ overhang: true })).overhang).toBe(true);
    expect(frame(makeCrate({ q: Q_DEBOUT, overhang: true })).overhang).toBe(false);
  });

  it('caisse ouverte en haut : livres debout, hauteur le long de Z, sans plafond', () => {
    const fr = frame(makeCrate({ q: Q_DEBOUT }));
    expect(arr(fr.U)).toEqual(v(0, 0, 1));
    // M est plus haute que large : la rangée suit Y
    expect(arr(fr.R)).toEqual(v(0, 1, 0));
    expect(arr(fr.F)).toEqual(v(1, 0, 0));
    expect(fr.mode).toBe('stand');
    expect(fr.innerU).toBe(Infinity);
    expect(fr.front).toBe(false);
  });

  it('caisse ouverte en haut et plus large que haute : la rangée suit X', () => {
    const c = makeCrate({ size: 'X', q: Q_DEBOUT, dims: { w: 4, h: 2, d: 3 } });
    const fr = frame(c);
    expect(arr(fr.R)).toEqual(v(1, 0, 0));
    // pas de parois pour une caisse transparente : seule la marge de 0,02 est retirée
    expect(fr.innerR).toBeCloseTo(4 - 0.02);
  });

  it('une caisse transparente range sans retrancher de parois', () => {
    const fr = frame(makeCrate({ size: 'X', dims: { w: 3, h: 3, d: 3 } }));
    expect(fr.innerU).toBeCloseTo(3);
    expect(fr.innerF).toBeCloseTo(3);
    expect(fr.floor).toBeCloseTo(-1.5);
  });

  it("renvoie null quand l'ouverture est vers le sol", () => {
    expect(crateFrame(makeCrate({ q: Q_OUVERTURE_BAS }))).toBeNull();
  });
});

describe('bookQuat', () => {
  it('garde le repère direct tel quel', () => {
    const q = bookQuat(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    );
    expect(q.angleTo(new THREE.Quaternion())).toBeLessThan(1e-9);
  });

  it("inverse l'épaisseur quand le repère serait indirect", () => {
    const q = bookQuat(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, -1),
    );
    expect(arr(new THREE.Vector3(1, 0, 0).applyQuaternion(q))).toEqual(v(-1, 0, 0));
    expect(arr(new THREE.Vector3(0, 0, 1).applyQuaternion(q))).toEqual(v(0, 0, -1));
  });
});

describe('newFillState', () => {
  it('démarre au bord gauche de la rangée', () => {
    const fr = frame(makeCrate());
    const st = newFillState(fr, 1.4);
    expect(st).toEqual({ cur: -fr.innerR / 2, pile: 0, pileH: 0, widest: 1.4 });
  });

  it('démarre à zéro sans repère', () => {
    expect(newFillState(null)).toEqual({ cur: 0, pile: 0, pileH: 0, widest: 0 });
  });
});

describe('placeInCrate (debout)', () => {
  it('range les livres côte à côte avec un petit jour', () => {
    const fr = frame(makeCrate());
    const st = newFillState(fr);
    const a = placeInCrate(fr, st, makeBook({ t: 0.3, h: 1.8 }))!;
    expect(a[0]).toBeCloseTo(-fr.innerR / 2 + 0.15);
    expect(a[1]).toBeCloseTo(fr.floor + 0.9);
    const b = placeInCrate(fr, st, makeBook({ t: 0.3, h: 1.8 }))!;
    // jour de 0,035 entre deux livres épais
    expect(b[0] - a[0]).toBeCloseTo(0.3 + 0.035);
  });

  it('réduit le jour pour un livre fin', () => {
    const fr = frame(makeCrate());
    const st = newFillState(fr);
    placeInCrate(fr, st, makeBook({ t: 0.04 }));
    expect(st.cur).toBeCloseTo(-fr.innerR / 2 + 0.04 + 0.02);
  });

  it('refuse un livre trop profond pour la caisse', () => {
    const fr = frame(makeCrate());
    expect(placeInCrate(fr, newFillState(fr), makeBook({ d: 2.5 }))).toBeNull();
  });

  it('accepte un livre trop profond si la caisse autorise le dépassement', () => {
    const fr = frame(makeCrate({ overhang: true }));
    expect(placeInCrate(fr, newFillState(fr), makeBook({ d: 2.5 }))).not.toBeNull();
  });

  it('refuse un livre plus haut que le plafond', () => {
    const fr = frame(makeCrate());
    expect(placeInCrate(fr, newFillState(fr), makeBook({ h: 3.6 }))).toBeNull();
  });

  it('refuse un livre quand la rangée est pleine', () => {
    const fr = frame(makeCrate());
    const st = newFillState(fr);
    let placed = 0;
    while (placeInCrate(fr, st, makeBook({ t: 0.5 }))) placed++;
    // 2,32 de large : quatre livres de 0,5 avec jour 0,035 tiennent, pas cinq
    expect(placed).toBe(4);
  });

  it('range un livre debout dans une caisse ouverte en haut (plafond infini)', () => {
    const fr = frame(makeCrate({ q: Q_DEBOUT }));
    expect(placeInCrate(fr, newFillState(fr), makeBook({ h: 20 }))).not.toBeNull();
  });
});

describe('placeInCrate (à plat)', () => {
  const flat = (over: Partial<Crate> = {}): CrateFrame => frame(makeCrate({ flat: true, ...over }));

  it('empile les livres couchés, le premier posé sur le plancher', () => {
    const fr = flat();
    const st = newFillState(fr, 1.8);
    const a = placeInCrate(fr, st, makeBook({ t: 0.3, h: 1.8 }))!;
    expect(a[0]).toBeCloseTo(-fr.innerR / 2 + 0.9);
    expect(a[1]).toBeCloseTo(fr.floor + 0.15);
    const b = placeInCrate(fr, st, makeBook({ t: 0.3, h: 1.8 }))!;
    expect(b[1]).toBeCloseTo(fr.floor + 0.3 + 0.15);
    expect(b[0]).toBeCloseTo(a[0]);
  });

  it('centre un petit livre sur la largeur du plus grand de la pile', () => {
    const fr = flat();
    const st = newFillState(fr, 2);
    const a = placeInCrate(fr, st, makeBook({ h: 1.0 }))!;
    expect(a[0]).toBeCloseTo(-fr.innerR / 2 + 1);
  });

  it('refuse un livre plus haut que la largeur de pile', () => {
    const fr = flat();
    expect(placeInCrate(fr, newFillState(fr), makeBook({ h: 2.4 }))).toBeNull();
  });

  it('refuse quand la pile unique est pleine', () => {
    const fr = flat();
    const st = newFillState(fr, 1.8);
    let placed = 0;
    while (placeInCrate(fr, st, makeBook({ t: 0.5 }))) placed++;
    // hauteur utile 3,34 - 0,02 : six livres de 0,5
    expect(placed).toBe(6);
  });

  it('passe à la pile suivante dans une caisse assez large', () => {
    const fr = frame(makeCrate({ size: 'X', dims: { w: 6, h: 1, d: 3 }, flat: true }));
    const st = newFillState(fr, 1.8);
    const a = placeInCrate(fr, st, makeBook({ t: 0.5 }))!;
    const b = placeInCrate(fr, st, makeBook({ t: 0.5 }))!;
    const c = placeInCrate(fr, st, makeBook({ t: 0.5 }));
    // hauteur utile 0,98 : un seul livre de 0,5 par pile ; deux piles de 2,99 de large, puis plus de place
    expect(b[0]).toBeGreaterThan(a[0]);
    expect(a[1]).toBeCloseTo(fr.floor + 0.25);
    expect(b[1]).toBeCloseTo(fr.floor + 0.25);
    expect(c).toBeNull();
    expect(st.pile).toBe(2);
  });

  it('une petite caisse compte au moins une pile', () => {
    const fr = frame(makeCrate({ size: 'S', flat: true }));
    expect(placeInCrate(fr, newFillState(fr, 1.5), makeBook({ h: 1.5 }))).not.toBeNull();
  });
});
