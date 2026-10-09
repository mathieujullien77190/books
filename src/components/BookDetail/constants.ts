import type { IsbnConfidence } from '@/types';

/** Un ISSN (périodiques) ressemble à 1234-567X ; tout le reste est présenté comme un ISBN. */
export const ISSN_PATTERN = /^\d{4}-\d{3}[\dX]$/i;

/** Dimensions modifiables dans la fiche : `factor` convertit l'unité scène (1 = 10 cm) en cm ou en mm. */
export const DIMENSIONS = [
  { key: 'h', label: 'Hauteur (cm)', title: 'Hauteur en cm', factor: 10, step: 0.5 },
  { key: 'd', label: 'Prof. (cm)', title: 'Profondeur en cm', factor: 10, step: 0.5 },
  { key: 't', label: 'Épaisseur (mm)', title: 'Épaisseur en mm', factor: 100, step: 1 },
] as const;

export const ISBN_CONFIDENCES: { value: IsbnConfidence; label: string }[] = [
  { value: 'verifie', label: 'Vérifié' },
  { value: 'bonne', label: 'Bonne' },
  { value: 'moyenne', label: 'Moyenne' },
];

/** « 16 cm × 10 cm, 3 cm d'épaisseur · caisse C2 » */
export const metaText = (h: number, d: number, t: number, crateLabel: string | null): string =>
  `${Math.round(h * 10)} cm × ${Math.round(d * 10)} cm, ${Math.round(t * 10)} cm d’épaisseur · ${
    crateLabel ? `caisse ${crateLabel}` : 'à côté'
  }`;
