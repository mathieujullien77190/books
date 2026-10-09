export type ProgressBarProps = {
  /** Ce qui se charge, annoncé aux lecteurs d'écran. */
  label: string;
  /** Part faite, de 0 à 1. */
  value: number;
  className?: string;
};
