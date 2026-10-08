import type { LabelHTMLAttributes } from 'react';

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  /** « div » pour un intitulé qui n'est lié à aucun champ (ex. titre d'une série). */
  as?: 'label' | 'div';
};
