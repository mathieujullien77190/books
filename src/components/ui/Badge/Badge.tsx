import { cn } from '@/components/ui/cn';

import type { BadgeProps } from './types';

/** Petite étiquette grise (numéro de caisse, nombre de livres). */
const Badge = ({ className, ...rest }: BadgeProps) => (
  <span
    className={cn('flex-none rounded bg-ink/5 px-1.5 py-px text-[11px] text-muted', className)}
    {...rest}
  />
);

export default Badge;
