import type { CrateEngine } from '@/engine/CrateEngine';
import type { Book, Id, Snapshot } from '@/types';

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

/** Verrou d'Édition : tant que le code n'a pas été saisi, tout est en lecture seule. */
export type EditLock = {
  locked: boolean;
  /** Envoie le code au serveur ; vrai s'il est accepté (l'Édition est alors déverrouillée). */
  unlock: (code: string) => Promise<boolean>;
  /** Tentative de modification refusée : affiche le message du Super Matou. */
  denied: () => void;
};

/** Ce que reçoivent les deux mises en page (bureau, téléphone). */
export type LayoutProps = {
  engine: CrateEngine | null;
  snap: Snapshot;
  /** Numéro de chaque caisse (G1, M2…) par id. */
  labels: Map<Id, string>;
  /** Livre sorti, dont la fiche peut s'afficher. */
  openBook: Book | null;
  lock: EditLock;
};
