import { describe, expect, it } from 'vitest';

import { makeBook, makeCrate } from '@/test/fixtures';
import type { SavedState } from '@/types';

import { HISTORY_MAX } from './constants';
import { History } from './history';

const state = (title: string): SavedState => ({
  crates: [makeCrate()],
  books: [makeBook({ title })],
  messy: false,
});

describe('History', () => {
  it("n'a rien à annuler au départ", () => {
    const h = new History();
    expect(h.canUndo).toBe(false);
    expect(h.pop()).toBeUndefined();
  });

  it('rend les états du plus récent au plus ancien', () => {
    const h = new History();
    h.push(state('a'));
    h.push(state('b'));
    expect(h.canUndo).toBe(true);
    expect(h.pop()?.books[0]?.title).toBe('b');
    expect(h.pop()?.books[0]?.title).toBe('a');
    expect(h.canUndo).toBe(false);
  });

  it("garde une copie profonde : modifier l'original ensuite ne change pas l'historique", () => {
    const h = new History();
    const s = state('a');
    h.push(s);
    s.books[0]!.title = 'modifié';
    s.crates[0]!.x = 99;
    const back = h.pop()!;
    expect(back.books[0]?.title).toBe('a');
    expect(back.crates[0]?.x).toBe(0);
    expect(back).not.toBe(s);
  });

  it('oublie les plus anciens états au-delà de la limite', () => {
    const h = new History();
    for (let i = 0; i < HISTORY_MAX + 5; i++) h.push(state(`t${i}`));
    const titles: string[] = [];
    for (let s = h.pop(); s; s = h.pop()) titles.push(s.books[0]!.title);
    expect(titles).toHaveLength(HISTORY_MAX);
    expect(titles[0]).toBe(`t${HISTORY_MAX + 4}`);
    expect(titles.at(-1)).toBe('t5');
  });

  it('se vide avec clear', () => {
    const h = new History();
    h.push(state('a'));
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.pop()).toBeUndefined();
  });
});
