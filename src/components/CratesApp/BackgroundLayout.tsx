import { BookPanel } from './BookPanel';
import type { LayoutProps } from './types';

/** Fond du bureau d'AOC : seule la fiche du livre ouvert s'affiche, à droite, sous les icônes du coin. */
export const BackgroundLayout = ({ engine, snap, labels, openBook, lock }: LayoutProps) => (
  <div className="pointer-events-none fixed top-[88px] right-4 bottom-[76px] z-10 flex w-[min(340px,calc(100vw-32px))] flex-col gap-3">
    <BookPanel
      engine={engine}
      snap={snap}
      labels={labels}
      openBook={openBook}
      lock={lock}
      onClose={() => engine?.closeBook()}
    />
  </div>
);
