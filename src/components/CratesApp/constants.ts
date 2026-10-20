import type { Snapshot } from '@/types';

/** Instantané rendu côté serveur et avant la création du moteur. */
export const EMPTY_SNAPSHOT: Snapshot = {
  crates: [],
  books: [],
  messy: false,
  loading: true,
  loadError: false,
  progress: null,
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
};

/** Ombre des boutons flottants posés sur la scène. */
export const FLOAT_SHADOW = 'shadow-[0_10px_30px_rgba(31,42,55,0.14)]';
