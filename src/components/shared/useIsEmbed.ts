import { useSyncExternalStore } from 'react';

const subscribe = (): (() => void) => () => {};
const read = (): boolean => new URLSearchParams(window.location.search).get('embed') === '1';

/**
 * Vrai quand la bibliothèque est affichée dans le bureau d'AOC (`?embed=1`) : on y consulte et on
 * interroge Claude, mais l'Édition (code, caisses) n'est pas proposée. Faux côté serveur.
 */
export const useIsEmbed = (): boolean => useSyncExternalStore(subscribe, read, () => false);
