import { useState, useSyncExternalStore } from 'react';

import { EDIT_TOKEN_KEY, readStorage, writeStorage } from '@/components/shared';
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
      const e = new CrateEngine(
        el,
        new URLSearchParams(window.location.search).get('embed') === 'bg',
      );
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

const PHONE_QUERY = '(max-width: 767px)';
const subscribePhone = (cb: () => void): (() => void) => {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

/** Écran de téléphone : colonne de droite remplacée par deux boutons en bas à gauche. */
export const useIsPhone = (): boolean =>
  useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );

// sans stockage, le déverrouillage ne dure que pour cette session
const readToken = (): string | null => readStorage(EDIT_TOKEN_KEY);
const writeToken = (token: string | null): void => writeStorage(EDIT_TOKEN_KEY, token || null);

const callEdit = async (
  body: { code: string } | { token: string },
): Promise<string | true | null> => {
  try {
    const res = await fetch('/api/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; token?: string };
    return data.ok ? (data.token ?? true) : null;
  } catch {
    return null;
  }
};

/** Envoie le code au serveur ; s'il est bon, garde le jeton reçu dans le localStorage. */
export const unlockEdit = async (code: string): Promise<boolean> => {
  const token = await callEdit({ code });
  if (typeof token !== 'string') return false;
  writeToken(token);
  return true;
};

/** Le jeton gardé sur l'appareil est-il toujours accepté par le serveur ? (sinon on l'oublie) */
export const checkEditToken = async (): Promise<boolean> => {
  const token = readToken();
  if (!token) return false;
  const ok = (await callEdit({ token })) === true;
  if (!ok) writeToken(null);
  return ok;
};
