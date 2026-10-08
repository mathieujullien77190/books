import { describe, expect, it, vi } from 'vitest';

import { PAD, SIZES } from '@/constants';
import { makeBook, makeCrate } from '@/test/fixtures';

import { CrateOps, type CrateOpsHost } from './crateOps';
import { Domain } from './domain';

const setup = () => {
  const domain = new Domain();
  const host: CrateOpsHost = {
    domain,
    removeRig: vi.fn(),
    refresh: vi.fn(),
    recenter: vi.fn(),
  };
  return { domain, host, ops: new CrateOps(host) };
};

describe('CrateOps.add', () => {
  it('pose la première caisse au coin, derrière le repère, et la sélectionne', () => {
    const { domain, host, ops } = setup();
    ops.add('M');
    const c = domain.crates[0]!;
    expect(c.size).toBe('M');
    expect(c.x).toBeCloseTo(SIZES.M.w / 2 + PAD);
    expect(c.z).toBeCloseTo(-(SIZES.M.d / 2 + PAD));
    expect(c.q).toEqual([0, 0, 0, 1]);
    expect(c.dims).toBeUndefined();
    expect(domain.selectedId).toBe(c.id);
    expect(domain.history.canUndo).toBe(true);
    expect(host.refresh).toHaveBeenCalledTimes(1);
    expect(host.recenter).toHaveBeenCalledTimes(1);
  });

  it("pose les suivantes à droite de l'emprise du groupe", () => {
    const { domain, ops } = setup();
    domain.crates = [makeCrate({ id: 'a', x: 0 })];
    ops.add('L');
    const bb = { maxX: 1.25 };
    expect(domain.crates[1]!.x).toBeCloseTo(bb.maxX + SIZES.L.w / 2 + PAD);
  });

  it('donne ses cotes par défaut à une caisse transparente', () => {
    const { domain, ops } = setup();
    ops.add('X');
    expect(domain.crates[0]!.dims).toEqual({ w: SIZES.X.w, h: SIZES.X.h, d: SIZES.X.d });
  });
});

describe('CrateOps.remove', () => {
  it('retire la caisse, son rig, la sélection et vide la caisse de ses livres', () => {
    const { domain, host, ops } = setup();
    domain.crates = [makeCrate({ id: 'a' }), makeCrate({ id: 'b' })];
    domain.books = [makeBook({ id: 'l1', crate: 'a' }), makeBook({ id: 'l2', crate: 'b' })];
    domain.selectedId = 'a';
    ops.remove('a');
    expect(domain.crates.map((c) => c.id)).toEqual(['b']);
    expect(host.removeRig).toHaveBeenCalledWith('a');
    expect(domain.selectedId).toBeNull();
    expect(domain.books.map((b) => b.crate)).toEqual([null, 'b']);
    expect(domain.history.canUndo).toBe(true);
    expect(host.refresh).toHaveBeenCalled();
  });

  it('garde la sélection si une autre caisse est retirée', () => {
    const { domain, ops } = setup();
    domain.crates = [makeCrate({ id: 'a' }), makeCrate({ id: 'b' })];
    domain.selectedId = 'b';
    ops.remove('a');
    expect(domain.selectedId).toBe('b');
  });
});

describe('CrateOps.setSize', () => {
  it('change la taille et donne des cotes à une caisse devenue transparente', () => {
    const { domain, host, ops } = setup();
    domain.crates = [makeCrate({ id: 'a' })];
    ops.setSize('a', 'X');
    expect(domain.crates[0]!.size).toBe('X');
    expect(domain.crates[0]!.dims).toEqual({ ...SIZES.X });
    expect(host.refresh).toHaveBeenCalledTimes(1);
  });

  it('garde les cotes déjà réglées', () => {
    const { domain, ops } = setup();
    domain.crates = [makeCrate({ id: 'a', dims: { w: 9, h: 9, d: 9 } })];
    ops.setSize('a', 'X');
    expect(domain.crates[0]!.dims).toEqual({ w: 9, h: 9, d: 9 });
  });

  it('passe en bois sans toucher aux cotes', () => {
    const { domain, ops } = setup();
    domain.crates = [makeCrate({ id: 'a', size: 'X', dims: { w: 9, h: 9, d: 9 } })];
    ops.setSize('a', 'L');
    expect(domain.crates[0]!.size).toBe('L');
  });

  it('ne fait rien pour une caisse inconnue ou une taille identique', () => {
    const { domain, host, ops } = setup();
    domain.crates = [makeCrate({ id: 'a' })];
    ops.setSize('zzz', 'L');
    ops.setSize('a', 'M');
    expect(host.refresh).not.toHaveBeenCalled();
    expect(domain.history.canUndo).toBe(false);
  });
});

describe('CrateOps.setFlat', () => {
  it("bascule le rangement à plat et n'agit pas si rien ne change", () => {
    const { domain, host, ops } = setup();
    domain.crates = [makeCrate({ id: 'a' })];
    ops.setFlat('a', false);
    ops.setFlat('zzz', true);
    expect(host.refresh).not.toHaveBeenCalled();
    ops.setFlat('a', true);
    expect(domain.crates[0]!.flat).toBe(true);
    expect(host.refresh).toHaveBeenCalledTimes(1);
    ops.setFlat('a', true);
    expect(host.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('CrateOps.setOverhang', () => {
  it("autorise puis retire le dépassement (champ absent plutôt que false) et n'agit pas si rien ne change", () => {
    const { domain, host, ops } = setup();
    domain.crates = [makeCrate({ id: 'a' })];
    ops.setOverhang('a', false);
    ops.setOverhang('zzz', true);
    expect(host.refresh).not.toHaveBeenCalled();
    ops.setOverhang('a', true);
    expect(domain.crates[0]!.overhang).toBe(true);
    ops.setOverhang('a', false);
    expect(domain.crates[0]!.overhang).toBeUndefined();
    expect(host.refresh).toHaveBeenCalledTimes(2);
  });
});

describe('CrateOps.setDims', () => {
  it("règle les cotes d'une caisse transparente, en copie", () => {
    const { domain, host, ops } = setup();
    domain.crates = [makeCrate({ id: 'a', size: 'X' })];
    const dims = { w: 4, h: 5, d: 6 };
    ops.setDims('a', dims);
    expect(domain.crates[0]!.dims).toEqual(dims);
    expect(domain.crates[0]!.dims).not.toBe(dims);
    expect(host.refresh).toHaveBeenCalledTimes(1);
  });

  it('ignore une caisse en bois ou inconnue', () => {
    const { domain, host, ops } = setup();
    domain.crates = [makeCrate({ id: 'a' })];
    ops.setDims('a', { w: 1, h: 1, d: 1 });
    ops.setDims('zzz', { w: 1, h: 1, d: 1 });
    expect(domain.crates[0]!.dims).toBeUndefined();
    expect(host.refresh).not.toHaveBeenCalled();
  });
});

describe('CrateOps.rotate', () => {
  it("tourne la caisse d'un quart de tour", () => {
    const { domain, host, ops } = setup();
    domain.crates = [makeCrate({ id: 'a' })];
    ops.rotate('a', 'y', 1);
    const q = domain.crates[0]!.q;
    expect(q[1]).toBeCloseTo(Math.SQRT1_2);
    expect(q[3]).toBeCloseTo(Math.SQRT1_2);
    expect(host.refresh).toHaveBeenCalledTimes(1);
    expect(domain.history.canUndo).toBe(true);
  });

  it('ignore une caisse inconnue', () => {
    const { host, ops } = setup();
    ops.rotate('zzz', 'y', 1);
    expect(host.refresh).not.toHaveBeenCalled();
  });
});

describe('CrateOps.step', () => {
  it("déplace d'un cran sur X et sur Z sans changer l'ordre d'empilement", () => {
    const { domain, host, ops } = setup();
    domain.crates = [makeCrate({ id: 'a', x: 0.2, z: 0.2 }), makeCrate({ id: 'b', x: 20 })];
    ops.step('a', 'x', 1);
    expect(domain.crates[0]!.x).toBe(0.5);
    ops.step('a', 'z', -1);
    expect(domain.crates[0]!.z).toBe(0);
    expect(domain.crates.map((c) => c.id)).toEqual(['a', 'b']);
    expect(host.refresh).toHaveBeenCalledTimes(2);
    expect(domain.history.canUndo).toBe(true);
  });

  it("monter amène la caisse au sommet de l'ordre d'empilement", () => {
    const { domain, host, ops } = setup();
    domain.crates = [makeCrate({ id: 'a' }), makeCrate({ id: 'b' }), makeCrate({ id: 'c' })];
    ops.step('a', 'y', 1);
    expect(domain.crates.map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(host.refresh).toHaveBeenCalledTimes(1);
  });

  it('refuse de descendre et ignore une caisse inconnue', () => {
    const { domain, host, ops } = setup();
    domain.crates = [makeCrate({ id: 'a' }), makeCrate({ id: 'b' })];
    ops.step('a', 'y', -1);
    ops.step('zzz', 'x', 1);
    expect(domain.crates.map((c) => c.id)).toEqual(['a', 'b']);
    expect(host.refresh).not.toHaveBeenCalled();
    expect(domain.history.canUndo).toBe(false);
  });
});
