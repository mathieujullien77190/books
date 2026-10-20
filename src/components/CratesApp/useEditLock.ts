import { useCallback, useEffect, useState } from 'react';

import type { CrateEngine } from '@/engine/CrateEngine';
import type { Mode } from '@/types';

import { EDIT_TOKEN_KEY, useIsEmbed, writeStorage } from '@/components/shared';

import { checkEditToken, unlockEdit } from './helpers';
import type { EditLock } from './types';

/**
 * Verrou d'Édition. Déverrouillé quand le serveur accepte le code, ou le jeton gardé sur l'appareil.
 */
export const useEditLock = (engine: CrateEngine | null, mode: Mode): EditLock => {
  const embed = useIsEmbed(); // dans le bureau d'AOC : jamais d'Édition
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    if (embed) return;
    let cancelled = false;
    void checkEditToken().then((ok) => !cancelled && setUnlocked(ok));
    return () => {
      cancelled = true;
    };
  }, [embed]);
  // sans le code, pas d'Édition : on revient en Lecture si on y arrive
  useEffect(() => {
    if (!unlocked && engine && mode === 'edit') engine.setMode('view');
  }, [unlocked, engine, mode]);

  const locked = !unlocked;

  const unlock = useCallback(
    async (code: string): Promise<boolean> => {
      if (embed) return false;
      const ok = await unlockEdit(code);
      if (ok) setUnlocked(true);
      return ok;
    },
    [embed],
  );

  /** Reverrouille l'Édition sur cet appareil : le jeton est oublié, il faudra ressaisir le code. */
  const relock = useCallback((): void => {
    writeStorage(EDIT_TOKEN_KEY, null);
    setUnlocked(false);
  }, []);

  return { locked, unlock, relock };
};
