import { useSyncExternalStore } from 'react';

export type EmbedMode = 'bg' | 'embed' | null;

const subscribe = (): (() => void) => () => {};
const read = (): EmbedMode => {
  const v = new URLSearchParams(window.location.search).get('embed');
  return v === 'bg' ? 'bg' : v === '1' ? 'embed' : null;
};

/**
 * Bibliothèque affichée dans le bureau d'AOC : `?embed=1` (fenêtre : consultation et Claude en lecture
 * seule, sans Édition) ou `?embed=bg` (fond du bureau : la scène 3D et la fiche d'un livre ouvert,
 * rien d'autre pour ne pas gêner les icônes). Null hors d'AOC et côté serveur.
 */
export const useEmbedMode = (): EmbedMode => useSyncExternalStore(subscribe, read, () => null);

/** Affichée dans AOC, quel que soit le mode : pas d'Édition. */
export const useIsEmbed = (): boolean => useEmbedMode() !== null;
