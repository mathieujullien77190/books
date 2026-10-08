import type { CrateSize, Dims, Id, Mode, Snapshot } from '@/types';

export type SidePanelProps = {
  snapshot: Snapshot;
  onAddCrate: (size: CrateSize) => void;
  onCrateSize: (id: Id, size: CrateSize) => void;
  onCrateDims: (id: Id, dims: Dims) => void;
  onCrateFlat: (id: Id, flat: boolean) => void;
  onCrateOverhang: (id: Id, overhang: boolean) => void;
  onCrateDelete: (id: Id) => void;
  onMode: (mode: Mode) => void;
  /** Clic sur une caisse de la liste : sélection (édition) ou cadrage (bibliothèque). */
  onPickCrate: (id: Id) => void;
  onRecenter: () => void;
  onUndo: () => void;
};
