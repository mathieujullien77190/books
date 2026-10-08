import type { HTMLAttributes } from 'react';

export type PanelProps = HTMLAttributes<HTMLElement> & {
  /** Balise rendue : aside (panneau latéral), section ou div. */
  as?: 'aside' | 'section' | 'div';
};
