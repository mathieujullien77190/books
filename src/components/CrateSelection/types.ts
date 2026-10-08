import type { Crate, CrateSize, Dims, Id } from '@/types';

export type DimFieldProps = {
  label: string;
  /** Cote actuelle, en cm (au demi-centimètre). */
  value: number;
  /** Nouvelle cote validée, en unités de scène (cm / 10). */
  onCommit: (dim: number) => void;
};

export type CrateSelectionProps = {
  crate: Crate | null;
  /** Numéro peint au fond (G1, M2, P1…). */
  label: string;
  count: number;
  onSize: (id: Id, size: CrateSize) => void;
  /** Cotes d'une caisse transparente. */
  onDims: (id: Id, dims: Dims) => void;
  /** Livres debout (false) ou à plat (true). */
  onFlat: (id: Id, flat: boolean) => void;
  /** Livres plus profonds que la caisse admis (ils dépassent devant). */
  onOverhang: (id: Id, overhang: boolean) => void;
  onDelete: (id: Id) => void;
};
