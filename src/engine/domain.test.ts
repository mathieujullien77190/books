import { describe, expect, it } from 'vitest';

import { makeBook, makeCrate } from '@/test/fixtures';

import { Domain } from './domain';

describe('Domain', () => {
  it('démarre vide, en lecture, sans sélection', () => {
    const d = new Domain();
    expect(d.crates).toEqual([]);
    expect(d.books).toEqual([]);
    expect(d.selectedId).toBeNull();
    expect(d.mode).toBe('view');
    expect(d.stats).toEqual({ stored: 0, loose: 0, full: 0 });
    expect(d.counts.size).toBe(0);
  });

  it('retrouve une caisse par son id', () => {
    const d = new Domain();
    d.crates = [makeCrate({ id: 'a' }), makeCrate({ id: 'b', x: 4 })];
    expect(d.crate('b')?.x).toBe(4);
    expect(d.crate('zzz')).toBeUndefined();
  });

  it("calcule l'emprise des caisses (valeurs par défaut sans caisse)", () => {
    const d = new Domain();
    expect(d.bounds().maxX).toBe(3);
    d.crates = [makeCrate({ x: 10 })];
    expect(d.bounds().cx).toBeCloseTo(10);
  });

  it("mémorise une copie de l'état dans l'historique", () => {
    const d = new Domain();
    d.crates = [makeCrate({ x: 1 })];
    d.books = [makeBook()];
    d.pushHistory();
    d.crates[0]!.x = 50;
    expect(d.history.canUndo).toBe(true);
    const back = d.history.pop()!;
    expect(back.crates[0]?.x).toBe(1);
    expect(back.books).toHaveLength(1);
    expect(back.messy).toBe(false);
  });

  it('remplace caisses et livres en gardant une sélection encore valide', () => {
    const d = new Domain();
    d.selectedId = 'a';
    d.replace({ crates: [makeCrate({ id: 'a' })], books: [makeBook()], messy: false });
    expect(d.selectedId).toBe('a');
    expect(d.books).toHaveLength(1);
  });

  it('efface la sélection si la caisse a disparu', () => {
    const d = new Domain();
    d.selectedId = 'a';
    d.replace({ crates: [makeCrate({ id: 'b' })], books: [], messy: false });
    expect(d.selectedId).toBeNull();
  });

  it('ne touche pas à une sélection vide', () => {
    const d = new Domain();
    d.replace({ crates: [], books: [], messy: false });
    expect(d.selectedId).toBeNull();
  });
});
