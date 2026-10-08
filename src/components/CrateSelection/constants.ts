import { SIZE_KEYS } from '@/constants';
import type { CrateSize } from '@/types';

/** Toutes les tailles proposées : les caisses en bois, puis la transparente. */
export const ALL_SIZE_KEYS: CrateSize[] = [...SIZE_KEYS, 'X'];

/** Champs de cotes d'une caisse transparente, dans l'ordre d'affichage. */
export const DIM_FIELDS: { key: 'w' | 'h' | 'd'; label: string }[] = [
  { key: 'w', label: 'Larg.' },
  { key: 'h', label: 'Haut.' },
  { key: 'd', label: 'Prof.' },
];
export const ROTATE_HINT =
  'Flèches droites : déplacer la caisse d’un cran (5 cm, ou jusqu’au contact) ; bleue vers le haut = passer au sommet de la pile. Flèches courbes : un quart de tour. Suppr : supprimer la caisse.';
