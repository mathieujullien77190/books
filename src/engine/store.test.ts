import { describe, expect, it, vi } from 'vitest';

import { makeBook, makeCrate } from '@/test/fixtures';
import type { Book, Crate } from '@/types';

import { Store, type SnapshotSource } from './store';

const source = (
  crates: Crate[],
  books: Book[],
  extra: Partial<SnapshotSource> = {},
): SnapshotSource => ({
  crates,
  books,
  loading: false,
  loadError: false,
  lite: false,
  selectedId: null,
  openId: null,
  openSide: 'front',
  counts: {},
  stored: 0,
  loose: 0,
  full: 0,
  canUndo: false,
  browsing: false,
  hasPrev: false,
  hasNext: false,
  missingBrowse: null,
  mode: 'view',
  ...extra,
});

describe('Store', () => {
  it("construit l'instantané initial avec des copies des données", () => {
    const crates = [makeCrate()];
    const books = [makeBook()];
    const store = new Store(() => source(crates, books));
    const snap = store.getSnapshot();
    expect(snap.crates).toEqual(crates);
    expect(snap.crates[0]).not.toBe(crates[0]);
    expect(snap.books[0]).not.toBe(books[0]);
    expect(snap.messy).toBe(false);
    expect(snap.mode).toBe('view');
  });

  it('garde les mêmes tableaux tant que les données ne sont pas marquées modifiées', () => {
    let selected: string | null = null;
    const crates = [makeCrate()];
    const store = new Store(() => source(crates, [], { selectedId: selected }));
    const first = store.getSnapshot();
    selected = 'c1';
    store.emit();
    const second = store.getSnapshot();
    expect(second).not.toBe(first);
    expect(second.selectedId).toBe('c1');
    expect(second.crates).toBe(first.crates);
    expect(second.books).toBe(first.books);
  });

  it('recopie les données après markData', () => {
    const crates = [makeCrate()];
    const store = new Store(() => source(crates, []));
    const first = store.getSnapshot();
    crates[0]!.x = 7;
    store.markData();
    store.emit();
    const second = store.getSnapshot();
    expect(second.crates).not.toBe(first.crates);
    expect(second.crates[0]?.x).toBe(7);
    expect(first.crates[0]?.x).toBe(0);
  });

  it('prévient les abonnés à chaque emit, jusqu’au désabonnement', () => {
    const store = new Store(() => source([], []));
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.emit();
    store.emit();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    store.emit();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
