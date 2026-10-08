import { crateFrame } from '@/engine/books';
import type { Crate } from '@/types';

/** Comment les livres se rangent dans cette caisse, selon son orientation. */
export const storageLabel = (c: Crate): string => {
  const fr = crateFrame(c);
  if (!fr) return 'ouverture vers le sol, inutilisable';
  return fr.mode === 'flat' ? 'livres à plat' : 'livres debout';
};
