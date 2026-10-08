import { useCallback, useEffect, useRef, useState } from 'react';

import type { CrateEngine } from '@/engine/CrateEngine';
import type { Mode } from '@/types';

import { DENIED_MESSAGES, DENIED_TOAST_MS } from './constants';
import { EDIT_TOKEN_KEY, writeStorage } from '@/components/shared';

import { checkEditToken, unlockEdit } from './helpers';
import type { EditLock } from './types';

/**
 * Verrou d'Édition et message de refus. Déverrouillé quand le serveur accepte le code, ou le jeton
 * gardé sur l'appareil ; verrouillé, le moteur appelle `denied` à chaque tentative de modification.
 */
export const useEditLock = (
  engine: CrateEngine | null,
  mode: Mode,
): { lock: EditLock; toast: string } => {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void checkEditToken().then((ok) => !cancelled && setUnlocked(ok));
    return () => {
      cancelled = true;
    };
  }, []);
  // sans le code, pas d'Édition : on revient en Lecture si on y arrive
  useEffect(() => {
    if (!unlocked && engine && mode === 'edit') engine.setMode('view');
  }, [unlocked, engine, mode]);

  const [toast, setToast] = useState('');
  const toastTimer = useRef(0);
  const denied = useCallback((): void => {
    setToast(DENIED_MESSAGES[Math.floor(Math.random() * DENIED_MESSAGES.length)] ?? '');
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), DENIED_TOAST_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const locked = !unlocked;
  useEffect(() => {
    engine?.setEditDeniedHandler(locked ? denied : null);
  }, [engine, locked, denied]);

  const unlock = useCallback(async (code: string): Promise<boolean> => {
    const ok = await unlockEdit(code);
    if (ok) setUnlocked(true);
    return ok;
  }, []);

  /** Reverrouille l'Édition sur cet appareil : le jeton est oublié, il faudra ressaisir le code. */
  const relock = useCallback((): void => {
    writeStorage(EDIT_TOKEN_KEY, null);
    setUnlocked(false);
  }, []);

  return { lock: { locked, unlock, relock, denied }, toast };
};
