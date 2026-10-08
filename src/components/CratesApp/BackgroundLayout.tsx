import { BookPanel } from './BookPanel';
import type { LayoutProps } from './types';

/** Fond du bureau d'AOC : seule la fiche du livre ouvert s'affiche, à droite, sous les icônes du coin. */
export const BackgroundLayout = ({ engine, snap, labels, openBook, lock }: LayoutProps) => (
  <>
    <p className="pointer-events-none fixed bottom-3 left-4 z-10 m-0 font-mono text-[11px] tracking-widest text-ink/45 uppercase select-none">
      <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent align-middle" />
      ceci est ma vraie bibliothèque · ne foutez pas le dawa
    </p>
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
  </>
);
