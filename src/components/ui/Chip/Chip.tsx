import Button from '@/components/ui/Button';

import type { ChipProps } from './types';

const SHAPE =
  'flex h-9 min-w-9 items-center justify-center px-1.5 text-xs leading-none max-md:h-11 max-md:min-w-11';

/** Pastille d'un tome de série : possédé (bouton), affiché (bouton actif) ou manquant (pointillés). */
const Chip = ({ label, state, title, onClick }: ChipProps) =>
  state === 'missing' ? (
    <span
      className={`${SHAPE} cursor-default rounded-lg border border-dashed border-ink/40 bg-ink/[0.06] text-muted`}
      title={title}
    >
      {label}
    </span>
  ) : (
    <Button
      variant={state === 'current' ? 'active' : 'default'}
      pressed={state === 'current'}
      className={`${SHAPE} py-0`}
      title={title}
      onClick={state === 'owned' ? onClick : undefined}
    >
      {label}
    </Button>
  );

export default Chip;
