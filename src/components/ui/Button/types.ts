import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'active' | 'danger' | 'ghost';

/** md : bouton courant ; sm : petit bouton de rangée ; icon : sans marge, pour un pictogramme. */
export type ButtonSize = 'sm' | 'md' | 'icon';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Action en cours : le bouton est désactivé, annoncé occupé et affiche un petit anneau. */
  loading?: boolean;
  /** Bouton à bascule : annonce son état aux lecteurs d'écran (aria-pressed). */
  pressed?: boolean;
};
