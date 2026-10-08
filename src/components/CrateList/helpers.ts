import { crateDims } from '@/helpers';
import type { Crate } from '@/types';

/** « 30 × 40 × 25 cm » */
export const dimsText = (c: Crate): string => {
  const d = crateDims(c);
  return `${Math.round(d.w * 10)} × ${Math.round(d.h * 10)} × ${Math.round(d.d * 10)} cm`;
};
