/** Clé localStorage du jeton d'Édition délivré par le serveur (/api/edit). */
export { EDIT_TOKEN_KEY } from '@/constants';

/** Clé localStorage de la clé API de la personne (propre à chaque navigateur, jamais en base). */
export const KEY_STORAGE = 'anthropic-api-key';

/** Clé localStorage du modèle choisi pour Claude. */
export const MODEL_STORAGE = 'ai-model';

/** Lit le localStorage ; null si la clé est absente ou le stockage indisponible (navigation privée…). */
export const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Écrit (ou efface si la valeur est null) ; sans stockage, la valeur ne vaut que pour la session. */
export const writeStorage = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // stockage indisponible : on ignore
  }
};
