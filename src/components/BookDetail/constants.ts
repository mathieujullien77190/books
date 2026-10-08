import type { IsbnConfidence } from '@/types';

export const LABEL =
  'mt-2.5 mb-1 block text-[11px] font-semibold tracking-wider text-muted uppercase';
export const ISBN_CONFIDENCES: { value: IsbnConfidence; label: string }[] = [
  { value: 'verifie', label: 'Vérifié' },
  { value: 'bonne', label: 'Bonne' },
  { value: 'moyenne', label: 'Moyenne' },
];

export const FIELD = 'w-full rounded-lg border border-ink/10 bg-white px-2.5 py-2 text-sm text-ink';

/** « 16 cm × 10 cm, 3 cm d'épaisseur · caisse C2 » */
export const metaText = (h: number, d: number, t: number, crateLabel: string | null): string =>
  `${Math.round(h * 10)} cm × ${Math.round(d * 10)} cm, ${Math.round(t * 10)} cm d’épaisseur · ${
    crateLabel ? `caisse ${crateLabel}` : 'à côté'
  }`;
