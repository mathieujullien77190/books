import { useIsEmbed } from '@/components/shared';
import SidePanel from '@/components/SidePanel';

import type { LayoutProps } from './types';

type LibraryPanelProps = Pick<LayoutProps, 'engine' | 'snap' | 'lock'> & {
  /** Ouvert dès l'affichage (feuille du téléphone). */
  defaultOpen?: boolean;
};

/** Panneau « Bibliothèque » relié au moteur (mêmes réglages sur bureau et téléphone). */
export const LibraryPanel = ({ engine, snap, lock, defaultOpen }: LibraryPanelProps) => {
  const embed = useIsEmbed();
  return (
    <SidePanel
      hideEdit={embed}
      defaultOpen={defaultOpen}
      editLocked={lock.locked}
      onUnlockEdit={lock.unlock}
      onLockEdit={lock.relock}
      snapshot={snap}
      onAddCrate={(size) => engine?.addCrate(size)}
      onCrateSize={(id, size) => engine?.setCrateSize(id, size)}
      onCrateDims={(id, dims) => engine?.setCrateDims(id, dims)}
      onCrateFlat={(id, flat) => engine?.setCrateFlat(id, flat)}
      onCrateOverhang={(id, overhang) => engine?.setCrateOverhang(id, overhang)}
      onCrateDelete={(id) => engine?.removeCrate(id)}
      onMode={(mode) => engine?.setMode(mode)}
      onPickCrate={(id) =>
        snap.mode === 'edit' ? engine?.selectCrate(id) : engine?.focusCrate(id)
      }
      onUndo={() => engine?.undo()}
    />
  );
};
