import { useState, useSyncExternalStore } from 'react';

import { CrateEngine } from '@/engine/CrateEngine';
import type { Snapshot } from '@/types';

import { EMPTY_SNAPSHOT } from './constants';
import type { EngineHolder } from './types';

const createHolder = (): EngineHolder => {
  let engine: CrateEngine | null = null;
  let tooltip: HTMLElement | null = null;
  let unsubscribe: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const l of listeners) l();
  };
  const setEngine = (e: CrateEngine | null): void => {
    unsubscribe?.();
    engine = e;
    unsubscribe = e ? e.subscribe(notify) : null;
    e?.attachTooltip(tooltip);
    notify();
  };
  return {
    get engine() {
      return engine;
    },
    mountCanvas: (el) => {
      if (!el || engine) return undefined; // déjà monté : ne jamais recréer le moteur
      const e = new CrateEngine(el);
      setEngine(e);
      return () => {
        e.dispose();
        setEngine(null);
      };
    },
    attachTooltip: (el) => {
      tooltip = el;
      engine?.attachTooltip(el);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => engine?.getSnapshot() ?? EMPTY_SNAPSHOT,
  };
};

const getServerSnapshot = (): Snapshot => EMPTY_SNAPSHOT;

/** Moteur three.js lié au canvas, et son état synchronisé avec React (vide côté serveur). */
export const useCrateEngine = (): { holder: EngineHolder; snapshot: Snapshot } => {
  const [holder] = useState(createHolder);
  const snapshot = useSyncExternalStore(holder.subscribe, holder.getSnapshot, getServerSnapshot);
  return { holder, snapshot };
};
