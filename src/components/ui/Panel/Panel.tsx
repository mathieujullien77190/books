import { cn } from '@/components/ui/cn';

import type { PanelProps } from './types';

/** Carte arrondie, blanc translucide et floue, qui flotte au-dessus de la scène 3D. */
const Panel = ({ as: Tag = 'div', className, ...rest }: PanelProps) => (
  <Tag
    className={cn(
      'rounded-2xl border border-ink/10 bg-white/85 text-sm shadow-[0_10px_30px_rgba(31,42,55,0.14)] backdrop-blur-md',
      className,
    )}
    {...rest}
  />
);

export default Panel;
