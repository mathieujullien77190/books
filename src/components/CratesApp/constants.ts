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
  browsing: false,
  hasPrev: false,
  hasNext: false,
  mode: 'view',
};

export const NOOP_SUBSCRIBE = (): (() => void) => () => {};

/** Clé localStorage du jeton d'Édition délivré par le serveur (/api/edit). */
export const EDIT_TOKEN_KEY = 'edit-token';

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
