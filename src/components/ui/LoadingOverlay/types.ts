import type { LoadProgress } from '@/types';

export type LoadingOverlayProps = {
  message: string;
  /** Étape en cours et part faite : une barre et ce qui se charge remplacent le message seul. */
  progress?: LoadProgress | null;
  /** Sans fond ni flou : le décor derrière reste visible. */
  bare?: boolean;
};
