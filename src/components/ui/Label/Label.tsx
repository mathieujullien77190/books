import { cn } from '@/components/ui/cn';

import type { LabelProps } from './types';

const CLASSES = 'mt-2.5 mb-1 block text-[11px] font-semibold tracking-wider text-muted uppercase';

/** Intitulé de champ en petites capitales (fiche livre). */
const Label = ({ as = 'label', className, children, ...rest }: LabelProps) =>
  as === 'div' ? (
    <div className={cn(CLASSES, className)}>{children}</div>
  ) : (
    <label className={cn(CLASSES, className)} {...rest}>
      {children}
    </label>
  );

export default Label;
