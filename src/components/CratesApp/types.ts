import type { CrateEngine } from '@/engine/CrateEngine';
import type { Snapshot } from '@/types';

export type CratesAppProps = {
  className?: string;
};

/** Porte le moteur (créé quand le canvas est monté) et relaie ses mises à jour à React. */
export type EngineHolder = {
  readonly engine: CrateEngine | null;
  /** Callback ref du canvas : crée le moteur au montage, le détruit au démontage. */
  mountCanvas: (el: HTMLCanvasElement | null) => (() => void) | undefined;
  /** Callback ref de l'infobulle. */
  attachTooltip: (el: HTMLElement | null) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Snapshot;
};
