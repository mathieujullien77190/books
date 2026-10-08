import type { ButtonProps, ButtonVariant } from './types';

const BASE =
  'cursor-pointer rounded-lg border px-2.5 py-[7px] text-sm leading-tight transition-colors disabled:cursor-default disabled:opacity-45';

const VARIANTS: Record<ButtonVariant, string> = {
  default: 'border-ink/10 bg-white text-ink hover:border-accent',
  primary: 'border-accent bg-accent text-white hover:border-accent',
  active: 'border-ink bg-ink text-white',
  danger: 'border-ink/10 bg-white text-ink hover:border-[#c0392b] hover:text-[#c0392b]',
  ghost: 'border-transparent bg-transparent text-muted hover:text-ink',
};

const Button = ({ variant = 'default', className = '', type = 'button', ...rest }: ButtonProps) => (
  <button type={type} className={`${BASE} ${VARIANTS[variant]} ${className}`} {...rest} />
);

export default Button;
