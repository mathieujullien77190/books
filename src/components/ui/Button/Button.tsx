import { cn } from '@/components/ui/cn';
import Spinner from '@/components/ui/Spinner';

import type { ButtonProps, ButtonSize, ButtonVariant } from './types';

const BASE =
  'cursor-pointer border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-45';

/** Sur téléphone, les boutons courants atteignent 44 px de haut (cible tactile) ; le bureau ne change pas. */
const SIZES: Record<ButtonSize, string> = {
  md: 'rounded-lg px-2.5 py-[7px] text-sm leading-tight max-md:min-h-11',
  sm: 'rounded-lg px-1.5 py-1 text-xs leading-tight',
  icon: 'rounded-lg p-0 leading-none',
};

const VARIANTS: Record<ButtonVariant, string> = {
  default: 'border-ink/10 bg-white text-ink hover:border-accent',
  primary: 'border-accent bg-accent text-white hover:border-accent',
  active: 'border-ink bg-ink text-white',
  danger: 'border-ink/10 bg-white text-ink hover:border-[#c0392b] hover:text-[#c0392b]',
  ghost: 'border-transparent bg-transparent text-muted hover:text-ink',
};

const Button = ({
  variant = 'default',
  size = 'md',
  loading = false,
  pressed,
  className,
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    className={cn(BASE, SIZES[size], VARIANTS[variant], className)}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    aria-pressed={pressed}
    {...rest}
  >
    {loading && (
      <Spinner size="sm" className="mr-1.5 border-current/25 border-t-current align-[-2px]" />
    )}
    {children}
  </button>
);

export default Button;
