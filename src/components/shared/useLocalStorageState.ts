import { useCallback, useState } from 'react';

import { readStorage, writeStorage } from './storage';

type Options = {
  /** Refuse une valeur stockée inconnue (on retombe sur la valeur par défaut). */
  validate?: (value: string) => boolean;
  /** Transforme la valeur avant de la stocker (ex. trim) ; une chaîne vide efface l'entrée. */
  normalize?: (value: string) => string;
};

/** État texte gardé dans le localStorage : lu une fois au montage, écrit à chaque changement. */
export const useLocalStorageState = (
  key: string,
  fallback: string,
  { validate, normalize }: Options = {},
): readonly [string, (next: string) => void] => {
  const [value, setValue] = useState(() => {
    const stored = readStorage(key);
    return stored !== null && (!validate || validate(stored)) ? stored : fallback;
  });
  const update = useCallback(
    (next: string): void => {
      setValue(next);
      const kept = normalize ? normalize(next) : next;
      writeStorage(key, kept || null);
    },
    [key, normalize],
  );
  return [value, update];
};
