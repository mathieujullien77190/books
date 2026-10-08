import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeBook, makeCrate } from '@/test/fixtures';
import type { Book, Crate, Id, Mode } from '@/types';

import type * as BooksModule from './books';
import type { BookRig } from './books';
import type { CrateRig } from './crate';
import { crateBounds, pileJitter, stackJitter } from './cratePlacement';
import { layoutBooks, type LayoutInput } from './layout';
import { Q_DEBOUT } from './orientation';

const textures = vi.hoisted(() => ({ ensureCover: vi.fn(), setSpineFlat: vi.fn() }));
vi.mock('./books', async (orig) => ({
  ...(await orig<typeof BooksModule>()),
  ensureCover: textures.ensureCover,
  setSpineFlat: textures.setSpineFlat,
}));

const round = (a: number[]): number[] => a.map((n) => Math.round(n * 1e4) / 1e4 + 0);

const fakeBookRig = (id: string): BookRig =>
  ({
    id,
    target: new THREE.Vector3(9, 9, 9),
    quat: new THREE.Quaternion(),
    r: 5,
    flat: false,
  }) as unknown as BookRig;

/** Rig de caisse factice posé comme le moteur le fait : au centre de l'emprise, orienté comme la caisse. */
const fakeCrateRig = (c: Crate, shell: THREE.Object3D[] = []): CrateRig => {
  const group = new THREE.Group();
  group.quaternion.fromArray(c.q);
  group.position.set(c.x, c.y + 1.75, c.z);
  group.updateMatrixWorld(true);
  return { id: c.id, group, shell } as unknown as CrateRig;
};

type Setup = {
  crates?: Crate[];
  books: Book[];
  mode?: Mode;
  held?: Id[];
  rigs?: Map<Id, CrateRig>;
  shells?: Record<Id, THREE.Object3D[]>;
};

const run = (s: Setup) => {
  const crates = s.crates ?? [];
  const crateRigs =
    s.rigs ?? new Map(crates.map((c) => [c.id, fakeCrateRig(c, s.shells?.[c.id])] as const));
  const bookRigs = new Map(s.books.map((b) => [b.id, fakeBookRig(b.id)] as const));
  const input: LayoutInput = {
    crates,
    books: s.books,
    crateRigs,
    bounds: crateBounds(crates),
    aniso: 4,
    mode: s.mode ?? 'edit',
    rigOf: (b) => bookRigs.get(b.id)!,
    isHeld: (b) => (s.held ?? []).includes(b.id),
  };
  return { result: layoutBooks(input), bookRigs, crateRigs };
};

beforeEach(() => {
  textures.ensureCover.mockReset();
  textures.setSpineFlat.mockReset().mockImplementation((rig: BookRig, flat: boolean) => {
    rig.flat = flat;
  });
});

describe('layoutBooks : caisse ouverte devant, livres debout', () => {
  const crate = makeCrate({ id: 'c1' });

  it('place chaque livre dans la rangée de sa caisse, au ras de l’ouverture', () => {
    const books = [
      makeBook({ id: 'a', crate: 'c1', t: 0.3, h: 1.8, d: 1.1 }),
      makeBook({ id: 'b', crate: 'c1', t: 0.3, h: 1.8, d: 1.1 }),
    ];
    const { result, bookRigs } = run({ crates: [crate], books });
    const a = bookRigs.get('a')!;
    const b = bookRigs.get('b')!;
    // rangée : bord gauche à -1,16, premier livre centré à -1,01, jour de 0,035
    expect(a.r).toBeCloseTo(-1.01);
    expect(b.r).toBeCloseTo(-1.01 + 0.335);
    // hauteur : plancher -1,67 + h/2 depuis le centre (y = 1,75) ; profondeur au ras de l'ouverture
    expect(round(a.target.toArray())).toEqual([-1.01, 0.98, 0.45]);
    expect(a.quat.angleTo(new THREE.Quaternion())).toBeLessThan(1e-9);
    expect(textures.setSpineFlat).toHaveBeenCalledWith(a, false);
    expect(result.counts.get('c1')).toBe(2);
    expect(result.stats).toEqual({ stored: 2, loose: 0, full: 0 });
  });

  it('suit la caisse quand elle est déplacée', () => {
    const moved = makeCrate({ id: 'c1', x: 10, z: -4 });
    const { bookRigs } = run({ crates: [moved], books: [makeBook({ id: 'a', crate: 'c1' })] });
    expect(bookRigs.get('a')!.target.x).toBeCloseTo(10 - 1.01 + 0.0);
    expect(bookRigs.get('a')!.target.z).toBeCloseTo(-4 + 0.45);
  });

  it('met dans la pile « à côté » un livre qui ne rentre pas, et le compte comme plein', () => {
    const books = [
      makeBook({ id: 'ok', crate: 'c1' }),
      makeBook({ id: 'trop-haut', crate: 'c1', h: 3.6 }),
    ];
    const { result, bookRigs } = run({ crates: [crate], books });
    const out = bookRigs.get('trop-haut')!;
    expect(result.counts.get('c1')).toBe(1);
    expect(result.stats).toEqual({ stored: 1, loose: 1, full: 1 });
    // pile à droite de l'emprise (maxX 1,25 + 1,2), couchée, couverture dessus
    const pj = pileJitter('trop-haut');
    expect(out.target.x).toBeCloseTo(1.25 + 1.2 + pj.dx);
    expect(out.target.z).toBeCloseTo(0 + pj.dz);
    expect(out.target.y).toBeCloseTo(0.15);
    expect(out.r).toBeNull();
    expect(textures.ensureCover).toHaveBeenCalledWith(out, books[1], 4);
    expect(textures.setSpineFlat).toHaveBeenCalledWith(out, false);
    const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pj.yaw, Math.PI / 2));
    expect(out.quat.angleTo(expected)).toBeLessThan(1e-9);
  });

  it('un livre dépassant de la caisse (dépassement permis) est calé au fond', () => {
    const deep = makeCrate({ id: 'c1', overhang: true });
    const { bookRigs, result } = run({
      crates: [deep],
      books: [makeBook({ id: 'a', crate: 'c1', d: 2.5 })],
    });
    // fond à -1,06 ; centre = -1,06 + 0,04 + 1,25
    expect(bookRigs.get('a')!.target.z).toBeCloseTo(0.23);
    expect(result.stats.full).toBe(0);
  });

  it('un livre en main garde sa place dans le décompte mais pas sa cible', () => {
    const { result, bookRigs } = run({
      crates: [crate],
      books: [makeBook({ id: 'a', crate: 'c1' })],
      held: ['a'],
    });
    const a = bookRigs.get('a')!;
    expect(a.r).toBeCloseTo(-1.01);
    expect(a.target.toArray()).toEqual([9, 9, 9]);
    expect(result.counts.get('c1')).toBe(1);
  });
});

describe('layoutBooks : livres à plat', () => {
  it('empile les livres couchés avec un léger désordre déterministe', () => {
    const crate = makeCrate({ id: 'c1', flat: true });
    const b = makeBook({ id: 'a', crate: 'c1', t: 0.3, h: 1.8, d: 1.1 });
    const { bookRigs } = run({ crates: [crate], books: [b] });
    const rig = bookRigs.get('a')!;
    const jit = stackJitter('a');
    expect(textures.setSpineFlat).toHaveBeenCalledWith(rig, true);
    expect(textures.ensureCover).toHaveBeenCalledWith(rig, b, 4);
    // r = bord gauche + demi-largeur du livre ; u = plancher + demi-épaisseur
    expect(rig.target.x).toBeCloseTo(-1.16 + 0.9 + jit.dr);
    expect(rig.target.y).toBeCloseTo(1.75 - 1.67 + 0.15);
    // dans une pile à plat, la profondeur se cale sur le livre le plus profond : f = 0,45 + jitter
    expect(rig.target.z).toBeCloseTo(0.45 + jit.df);
    // livre couché : tourné autour de son axe local X (le yaw du désordre)
    const ref = new THREE.Quaternion()
      .setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(-1, 0, 0),
          new THREE.Vector3(0, 0, 1),
        ),
      )
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), jit.yaw));
    expect(rig.quat.angleTo(ref)).toBeLessThan(1e-9);
  });

  it('tourne les livres de 90° (flatTurn) et échange leur hauteur et leur profondeur pour le rangement', () => {
    const turned = makeCrate({ id: 'c1', flat: true, flatTurn: true });
    const straight = makeCrate({ id: 'c1', flat: true });
    // 2,3 de profondeur : trop pour la caisse (2,12) dans le sens normal ; tourné, c'est la hauteur (1,0) qui compte
    const b = makeBook({ id: 'a', crate: 'c1', h: 1.0, d: 2.3, t: 0.3 });
    const a1 = run({ crates: [straight], books: [b] });
    expect(a1.result.stats.full).toBe(1);
    const a2 = run({ crates: [turned], books: [b] });
    expect(a2.result.stats.full).toBe(0);
    const base = run({
      crates: [makeCrate({ id: 'c1', flat: true })],
      books: [makeBook({ id: 'a', crate: 'c1', h: 1.0, d: 1.0, t: 0.3 })],
    }).bookRigs.get('a')!;
    // l'orientation diffère par un quart de tour autour de l'axe X du livre (plus le désordre)
    expect(a2.bookRigs.get('a')!.quat.angleTo(base.quat)).toBeGreaterThan(1);
  });

  it('ignore flatTurn pour des livres debout', () => {
    const upright = makeCrate({ id: 'c1', flatTurn: true });
    const { bookRigs } = run({ crates: [upright], books: [makeBook({ id: 'a', crate: 'c1' })] });
    expect(bookRigs.get('a')!.quat.angleTo(new THREE.Quaternion())).toBeLessThan(1e-9);
  });
});

describe('layoutBooks : caisse ouverte en haut', () => {
  it('range debout, sans décalage de profondeur', () => {
    const crate = makeCrate({ id: 'c1', q: Q_DEBOUT });
    const { bookRigs, result } = run({
      crates: [crate],
      books: [makeBook({ id: 'a', crate: 'c1', h: 1.8, t: 0.3 })],
    });
    const rig = bookRigs.get('a')!;
    expect(result.counts.get('c1')).toBe(1);
    expect(rig.r).not.toBeNull();
    expect(textures.setSpineFlat).toHaveBeenCalledWith(rig, false);
    expect(rig.target.toArray().every(Number.isFinite)).toBe(true);
  });
});

describe('layoutBooks : sans caisse utilisable', () => {
  it('une caisse ouverte vers le sol envoie ses livres dans la pile sans les compter comme pleins', () => {
    const down = makeCrate({
      id: 'c1',
      q: new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
        .toArray() as Crate['q'],
    });
    const { result, bookRigs } = run({
      crates: [down],
      books: [makeBook({ id: 'a', crate: 'c1' })],
    });
    expect(result.stats).toEqual({ stored: 0, loose: 1, full: 0 });
    expect(result.counts.get('c1')).toBe(0);
    expect(bookRigs.get('a')!.r).toBeNull();
  });

  it('un livre sans caisse, ou dont la caisse n’a pas de rig, va dans la pile', () => {
    const crate = makeCrate({ id: 'c1' });
    const { result, bookRigs } = run({
      crates: [crate],
      books: [
        makeBook({ id: 'libre', crate: null, t: 0.5 }),
        makeBook({ id: 'orphelin', crate: 'inconnue', t: 0.25 }),
      ],
    });
    expect(result.stats).toEqual({ stored: 0, loose: 2, full: 0 });
    // ils s'empilent l'un sur l'autre
    expect(bookRigs.get('libre')!.target.y).toBeCloseTo(0.25);
    expect(bookRigs.get('orphelin')!.target.y).toBeCloseTo(0.5 + 0.125);
  });

  it('un livre libre en main compte dans la pile mais ne bouge pas', () => {
    const { result, bookRigs } = run({
      books: [makeBook({ id: 'main', t: 0.4 }), makeBook({ id: 'autre', t: 0.2 })],
      held: ['main'],
    });
    expect(bookRigs.get('main')!.target.toArray()).toEqual([9, 9, 9]);
    // l'épaisseur du livre en main est réservée dans la pile
    expect(bookRigs.get('autre')!.target.y).toBeCloseTo(0.4 + 0.1);
    expect(result.stats).toEqual({ stored: 0, loose: 2, full: 0 });
  });

  it('ignore les livres d’une caisse qui a un rig mais n’existe plus dans la liste', () => {
    const ghost = makeCrate({ id: 'fantome' });
    const { result, bookRigs } = run({
      crates: [],
      rigs: new Map([['fantome', fakeCrateRig(ghost)]]),
      books: [makeBook({ id: 'a', crate: 'fantome' })],
    });
    expect(bookRigs.get('a')!.target.toArray()).toEqual([9, 9, 9]);
    // comportement actuel : ni rangé ni dans la pile, il est quand même compté dans « rangés »
    expect(result.stats).toEqual({ stored: 1, loose: 0, full: 0 });
  });

  it('sans livre, tout est à zéro', () => {
    const { result } = run({ crates: [makeCrate({ id: 'c1' })], books: [] });
    expect(result.counts.get('c1')).toBe(0);
    expect(result.stats).toEqual({ stored: 0, loose: 0, full: 0 });
  });
});

describe('layoutBooks : coque des espaces transparents', () => {
  it('la cache en lecture et la montre en édition ; ignore les caisses sans coque ou sans rig', () => {
    const x = makeCrate({ id: 'x', size: 'X', dims: { w: 3, h: 3, d: 3 } });
    const wood = makeCrate({ id: 'w', x: 6 });
    const noRig = makeCrate({ id: 'n', x: 12 });
    const shell = [new THREE.Object3D(), new THREE.Object3D()];
    const rigs = new Map<Id, CrateRig>([
      ['x', fakeCrateRig(x, shell)],
      ['w', fakeCrateRig(wood)],
    ]);
    run({ crates: [x, wood, noRig], rigs, books: [], mode: 'view' });
    expect(shell.map((o) => o.visible)).toEqual([false, false]);
    run({ crates: [x, wood, noRig], rigs, books: [], mode: 'edit' });
    expect(shell.map((o) => o.visible)).toEqual([true, true]);
  });
});
