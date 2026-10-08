import { describe, expect, it } from 'vitest';

import type { Crate } from '@/types';

import { applyGravity } from './cratePlacement';

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
