import type { BookKind, CrateSize } from '@/types';

export const APP_NAME = 'Bibliothèque';
export const APP_DESCRIPTION = 'Range tes livres dans des caisses en bois, en 3D.';

/** Clé localStorage. v3 : nouvelles tailles de caisses, plus de livres d'exemple. */
export const STORE_KEY = 'crates-books-v3';

/** Clé localStorage du jeton d'Édition (le serveur refuse l'écriture sans lui). */
export const EDIT_TOKEN_KEY = 'edit-token';

/** Échelle : 1 unité = 10 cm. w = largeur (X), h = hauteur (Y), d = profondeur (Z). */
export const SIZES: Record<CrateSize, { label: string; w: number; h: number; d: number }> = {
  S: { label: 'Petite', w: 2.0, h: 3.0, d: 2.0 }, // 20 larg × 30 haut × 20 prof
  M: { label: 'Moyenne', w: 2.5, h: 3.5, d: 2.2 }, // 25 larg × 35 haut × 22 prof
  L: { label: 'Grande', w: 3.0, h: 4.0, d: 2.5 }, // 30 larg × 40 haut × 25 prof
  X: { label: 'Transparente', w: 3.0, h: 3.0, d: 3.0 }, // cotes par défaut, modifiables par caisse
};
/** Tailles de caisses en bois (boutons de taille). */
export const SIZE_KEYS: CrateSize[] = ['S', 'M', 'L'];
/** Lettre peinte au fond des caisses : P(etite), M(oyenne), G(rande), T(ransparente). */
export const SIZE_LETTERS: Record<CrateSize, string> = { S: 'P', M: 'M', L: 'G', X: 'T' };
/** Bornes des cotes d'une caisse transparente, en cm. */
export const DIMS_CM_MIN = 1;
export const DIMS_CM_MAX = 500;

/** Menuiserie : planches de 8 mm, lattes, jours, montants d'angle, marge de l'armature métal. */
export const PLANK = 0.08;
export const SLAT = 0.55;
export const GAP = 0.08;
export const POST = 0.14;
/**
 * Enveloppe de référence d'une caisse = le bois nu (marge 0) : cadre de sélection, aimantation,
 * empilement et repos au sol se calent sur les cotes du bois. L'armature métal dépasse de 4,5 mm
 * et s'interpénètre légèrement entre caisses collées, c'est voulu.
 */
export const PAD = 0;
/** Cadre de sélection : exactement le bois de la caisse (= PAD). */
export const OUTLINE_PAD = PAD;

/** Pas de déplacement des caisses sur la grille : 0,5 unité = 5 cm (un carreau au sol). */
export const GRID_STEP = 0.5;

export const MAX_BOOK_H = 2.1;
export const MAX_BOOK_D = 1.2;
export const BOOK_TITLE_MAX = 60;

/** Type d'un livre, affiché dans la fiche et utilisable en filtre plus tard. */
export const BOOK_KINDS: { kind: BookKind; label: string }[] = [
  { kind: 'roman', label: 'Roman' },
  { kind: 'bd', label: 'BD' },
  { kind: 'documentaire', label: 'Documentaire' },
  { kind: 'guide', label: 'Guide' },
  { kind: 'dictionnaire', label: 'Dictionnaire' },
  { kind: 'autre', label: 'Autre' },
];

/**
 * Bornes des dimensions d'un livre (unités scène : 1 = 10 cm, épaisseur comprise) : hauteur 5 à 60 cm,
 * profondeur 3 à 50 cm, épaisseur 1 à 150 mm. Au-delà, la saisie ou l'outil de Claude est refusé.
 */
export const BOOK_LIMITS = {
  h: [0.5, 6],
  d: [0.3, 5],
  t: [0.01, 1.5],
} as const;

export const SCENE_BG = 0xdfe9f3;
