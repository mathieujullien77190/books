import { describe, expect, it } from 'vitest';

import type { Crate } from '@/types';

import {
  applyGravity,
  crateBounds,
  defaultCrates,
  magnet,
  nextStepPosition,
  pileJitter,
  stackJitter,
} from './cratePlacement';
import { Q_DEBOUT } from './orientation';

const crate = (id: string, x: number, z: number): Crate => ({
  id,
  size: 'M',
  q: [0, 0, 0, 1],
  x,
  z,
  y: 99,
});

describe('applyGravity', () => {
  it('pose sur le sol une caisse seule', () => {
    const [a] = [crate('a', 0, 0)];
    applyGravity([a!]);
    expect(a!.y).toBe(0);
  });

  it("pose une caisse sur celle qu'elle chevauche, posée avant elle", () => {
    const a = crate('a', 0, 0);
    const b = crate('b', 0, 0);
    applyGravity([a, b]);
    expect(a.y).toBe(0);
    expect(b.y).toBeGreaterThan(0);
  });

  it('laisse au sol deux caisses qui ne se chevauchent pas', () => {
    const a = crate('a', -20, 0);
    const b = crate('b', 20, 0);
    applyGravity([a, b]);
    expect(b.y).toBe(0);
  });

  it("dépend de l'ordre du tableau : la dernière posée atterrit dessus", () => {
    const a = crate('a', 0, 0);
    const b = crate('b', 0, 0);
    applyGravity([b, a]);
    expect(b.y).toBe(0);
    expect(a.y).toBeGreaterThan(0);
  });
});

describe('jitters déterministes', () => {
  it('donnent le même désordre pour un même id', () => {
    expect(stackJitter('abc')).toEqual(stackJitter('abc'));
    expect(pileJitter('abc')).toEqual(pileJitter('abc'));
  });

  it('donnent un désordre différent pour deux ids', () => {
    expect(stackJitter('abc')).not.toEqual(stackJitter('abd'));
    expect(pileJitter('abc')).not.toEqual(pileJitter('abd'));
  });

  it('restent dans les amplitudes annoncées', () => {
    for (const id of ['a', 'b', 'c', 'long-identifiant', '']) {
      const s = stackJitter(id);
      expect(Math.abs(s.dr)).toBeLessThan(0.08);
      expect(Math.abs(s.df)).toBeLessThan(0.05);
      expect(Math.abs(s.yaw)).toBeLessThan(0.05);
      const p = pileJitter(id);
      expect(Math.abs(p.dx)).toBeLessThan(0.05);
      expect(Math.abs(p.dz)).toBeLessThan(0.075);
      expect(Math.abs(p.yaw)).toBeLessThan(0.125);
    }
  });
});

describe('defaultCrates', () => {
  it('propose six caisses de départ, de tailles connues, au sol et à ids uniques', () => {
    const cs = defaultCrates();
    expect(cs.map((c) => c.size)).toEqual(['L', 'M', 'L', 'S', 'M', 'S']);
    expect(new Set(cs.map((c) => c.id)).size).toBe(6);
    expect(cs.every((c) => c.y === 0)).toBe(true);
  });

  it('couche la dernière petite caisse debout, les autres ouvertes devant', () => {
    const cs = defaultCrates();
    expect(cs[0]!.q).toEqual([0, 0, 0, 1]);
    expect(cs[5]!.q).toEqual(Q_DEBOUT);
    // copie : modifier une caisse ne touche pas la constante d'orientation
    const before = Q_DEBOUT[0];
    cs[5]!.q[0] = 9;
    expect(Q_DEBOUT[0]).toBe(before);
  });
});

describe('crateBounds', () => {
  it('donne une emprise par défaut sans caisse', () => {
    expect(crateBounds([])).toEqual({
      minX: -3,
      maxX: 3,
      minZ: -3,
      maxZ: 3,
      maxY: 3,
      cx: 0,
      cz: 0,
    });
  });

  it('englobe les caisses, leur hauteur et leur centre', () => {
    const b = crateBounds([
      { ...crate('a', 0, 0), y: 0 },
      { ...crate('b', 10, 4), y: 2 },
    ]);
    expect(b.minX).toBeCloseTo(-1.25);
    expect(b.maxX).toBeCloseTo(11.25);
    expect(b.minZ).toBeCloseTo(-1.1);
    expect(b.maxZ).toBeCloseTo(5.1);
    expect(b.maxY).toBeCloseTo(5.5);
    expect(b.cx).toBeCloseTo(5);
    expect(b.cz).toBeCloseTo(2);
  });
});

describe('magnet', () => {
  const big = (x: number, z: number): Crate => ({ ...crate('big', x, z), size: 'L', y: 0 });

  it('cale sur la grille une caisse seule loin de tout', () => {
    const c = crate('c', 0, 0);
    expect(magnet([c], c, 7.1, -5.2)).toEqual([7, -5]);
  });

  it('colle le cadre de la caisse sur les axes du repère (côté positif puis négatif)', () => {
    const c = crate('c', 0, 0);
    // fx = 2.5, fz = 2.2 : bord du cadre à ±1,25 / ±1,1
    expect(magnet([c], c, 1.2, 1.0)).toEqual([1.25, 1.1]);
    expect(magnet([c], c, -1.2, -1.0)).toEqual([-1.25, -1.1]);
  });

  it('se colle sur le flanc d’une autre caisse et se cale sur l’une de ses trois positions en Z', () => {
    const c = crate('c', 0, 0);
    const o = big(0, 0); // x de -1,5 à 1,5, z de -1,25 à 1,25
    expect(magnet([o, c], c, 2.7, 0.1)).toEqual([2.75, 0.15]);
    expect(magnet([o, c], c, -2.7, -0.1)).toEqual([-2.75, -0.15]);
  });

  it('se colle devant ou derrière une autre caisse et se cale sur l’une de ses trois positions en X', () => {
    const c = crate('c', 0, 0);
    const o = big(0, 0);
    expect(magnet([o, c], c, 0.2, 2.3)).toEqual([0.25, 2.35]);
    expect(magnet([o, c], c, 0.2, -2.3)).toEqual([0.25, -2.35]);
  });

  it('pose la caisse sur une autre dont elle recouvre le centre, calée en X et en Z', () => {
    const c = crate('c', 0, 0);
    const o = big(0, 0);
    expect(magnet([o, c], c, 0.1, 0.1)).toEqual([0, 0.15]);
  });

  it('ignore le contact latéral quand les caisses ne se recouvrent pas sur l’autre axe', () => {
    const c = crate('c', 0, 0);
    const o = big(0, 0);
    // collée au flanc en X mais loin en Z : aucun calage en Z, la valeur reste celle de la grille
    expect(magnet([o, c], c, 2.7, 6.1)).toEqual([2.75, 6]);
    // collée devant en Z mais loin en X
    expect(magnet([o, c], c, 6.1, 2.3)).toEqual([6, 2.35]);
  });

  it('n’aimante pas sur une caisse trop éloignée (au-delà du seuil)', () => {
    const c = crate('c', 0, 0);
    const o = big(20, 20);
    expect(magnet([o, c], c, 5.1, 5.1)).toEqual([5, 5]);
  });

  it('arrondit au millième', () => {
    const c = crate('c', 0, 0);
    const [x] = magnet([c], c, 3.0004, 0);
    expect(x).toBe(3);
  });
});

describe('nextStepPosition', () => {
  it('avance d’un cran de grille ou jusqu’au bord du cadre sur les axes, selon le plus proche', () => {
    const c = crate('c', 0.2, 0.2);
    expect(nextStepPosition([c], c, 'x', 1)).toBe(0.5);
    expect(nextStepPosition([c], c, 'x', -1)).toBe(0);
    expect(nextStepPosition([c], c, 'z', 1)).toBe(0.5);
    expect(nextStepPosition([c], c, 'z', -1)).toBe(0);
  });

  it('s’arrête au contact d’une autre caisse', () => {
    const o = crate('o', 5.2, 0); // flanc gauche à 3,95 : collée, le centre est à 2,7
    const c = crate('c', 2.55, 0);
    expect(nextStepPosition([c, o], c, 'x', 1)).toBe(2.7);
  });

  it('prend aussi en compte les autres caisses sur l’axe Z', () => {
    const c = crate('c', 0, 2.4);
    const o = crate('o', 0, 0); // z de -1,1 à 1,1 : collée côté +Z, le centre est à 2,2
    expect(nextStepPosition([c, o], c, 'z', -1)).toBe(2.2);
  });

  it('retombe sur un pas de grille quand aucune position ne dépasse la courante (flottants extrêmes)', () => {
    const c = crate('c', 1e17, 0);
    expect(nextStepPosition([c], c, 'x', 1)).toBe(1e17);
  });
});
