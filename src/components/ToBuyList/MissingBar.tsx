'use client';

import IconButton from '@/components/ui/IconButton';
import Panel from '@/components/ui/Panel';

type MissingBarProps = {
  browse: { label: string; index: number; total: number };
  onPrev: () => void;
  onNext: () => void;
  onList: () => void;
  onClose: () => void;
};

/** Barre du défilé des tomes manquants : ‹ › parcourent le tas en gros plan, ☰ ouvre la liste. */
const MissingBar = ({ browse, onPrev, onNext, onList, onClose }: MissingBarProps) => (
  <Panel
    role="group"
    aria-label="Livres à acheter"
    className="fixed bottom-20 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 px-2 py-1.5 max-md:bottom-[84px]"
  >
    <IconButton className="h-9 w-9 text-xl" label="Tome manquant précédent" onClick={onPrev}>
      ‹
    </IconButton>
    <div className="min-w-40 px-1 text-center leading-tight">
      <div className="text-sm font-semibold">{browse.label}</div>
      <div className="text-xs text-muted">
        à acheter · {browse.index}/{browse.total}
      </div>
    </div>
    <IconButton className="h-9 w-9 text-xl" label="Tome manquant suivant" onClick={onNext}>
      ›
    </IconButton>
    <IconButton className="h-9 w-9" label="Voir la liste des livres à acheter" onClick={onList}>
      ☰
    </IconButton>
    <IconButton className="h-9 w-9" label="Arrêter le défilé" onClick={onClose}>
      ✕
    </IconButton>
  </Panel>
);

export default MissingBar;
