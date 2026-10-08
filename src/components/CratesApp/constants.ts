import type { Snapshot } from '@/types';

/** Instantané rendu côté serveur et avant la création du moteur. */
export const EMPTY_SNAPSHOT: Snapshot = {
  crates: [],
  books: [],
  messy: false,
  selectedId: null,
  openId: null,
  openSide: 'front',
  counts: {},
  stored: 0,
  loose: 0,
  full: 0,
  canUndo: false,
  mode: 'view',
};

export const NOOP_SUBSCRIBE = (): (() => void) => () => {};
