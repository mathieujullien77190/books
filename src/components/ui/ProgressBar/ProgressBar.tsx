import { cn } from '@/components/ui/cn';

import type { ProgressBarProps } from './types';

/** Barre d'avancement fine : la largeur suit `value` (0 à 1), le nom accessible dit ce qui se charge. */
const ProgressBar = ({ label, value, className }: ProgressBarProps) => {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-ink/15', className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

export default ProgressBar;
