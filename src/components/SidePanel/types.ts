import type { CrateSize, Dims, Id, Mode, Snapshot } from '@/types';

export type SidePanelProps = {
  /** Édition verrouillée : le bouton Édition est grisé, un champ « Code » + OK s'affiche dessous. */
  editLocked?: boolean;
  /** Envoie le code au serveur ; vrai s'il est accepté. */
  onUnlockEdit?: (code: string) => Promise<boolean>;
  /** Ouvert dès l'affichage (feuille du téléphone) ; replié par défaut. */
  defaultOpen?: boolean;
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
  onUndo: () => void;
};
