import Button from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

import type { IconButtonProps } from './types';

/** Bouton rond à pictogramme (✕, ‹ ›, 🎯, 🔑…) : le nom accessible est obligatoire, le titre en reprend le texte. */
const IconButton = ({ label, className, title, ...rest }: IconButtonProps) => (
  <Button
    size="icon"
    aria-label={label}
    title={title ?? label}
    className={cn('rounded-full', className)}
    {...rest}
  />
);

export default IconButton;
