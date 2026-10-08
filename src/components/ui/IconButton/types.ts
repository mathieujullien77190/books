import type { ButtonProps } from '@/components/ui/Button/types';

export type IconButtonProps = Omit<ButtonProps, 'size' | 'aria-label'> & {
  /** Nom accessible (lecteur d'écran) ; sert aussi d'infobulle si `title` est absent. */
  label: string;
};
