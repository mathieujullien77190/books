import { cn } from '@/components/ui/cn';

import type { SpinnerProps } from './types';

const SIZES = {
  sm: 'h-3.5 w-3.5 border-2',
  md: 'h-10 w-10 border-4',
};

/** Anneau qui tourne ; décoratif (le texte voisin ou `aria-busy` porte le sens). */
const Spinner = ({ size = 'md', className }: SpinnerProps) => (
  <span
    aria-hidden="true"
    className={cn(
      'inline-block animate-spin rounded-full border-ink/15 border-t-accent',
      SIZES[size],
      className,
    )}
  />
);

export default Spinner;
