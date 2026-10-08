export type ChipProps = {
  label: string;
  /** current : tome affiché ; owned : tome possédé (ouvre sa fiche) ; missing : tome absent de la bibliothèque. */
  state: 'current' | 'owned' | 'missing';
  title?: string;
  /** Clic sur un tome possédé (ignoré pour current et missing). */
  onClick?: () => void;
};
