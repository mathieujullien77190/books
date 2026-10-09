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

/** Messages affichés quand on tente de modifier alors que l'Édition est verrouillée. */
export const DENIED_MESSAGES = [
  '🐱 Pas touche ! Seul le Super Matou a le droit de modifier la bibliothèque.',
  '😼 Les pattes dans les poches ! Ici, on lit, on ne gribouille pas.',
  '🙀 Eh ! Qui veut toucher aux livres du Super Matou ?',
  '🐾 Petit curieux… cette porte ne s’ouvre qu’avec le mot magique.',
  '😾 Miaou non ! Les modifications sont réservées au chef de la meute.',
];

/** Durée d'affichage du message (ms). */
export const DENIED_TOAST_MS = 3200;

/** Ombre des boutons flottants posés sur la scène. */
export const FLOAT_SHADOW = 'shadow-[0_10px_30px_rgba(31,42,55,0.14)]';
