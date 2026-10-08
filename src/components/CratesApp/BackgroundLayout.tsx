import { useEffect, useRef } from 'react';

import { BookPanel } from './BookPanel';
import type { LayoutProps } from './types';

/** Fond du bureau d'AOC : seule la fiche du livre ouvert s'affiche, à droite, sous les icônes du coin. */
export const BackgroundLayout = ({ engine, snap, labels, openBook, lock }: LayoutProps) => {
  const birdLabel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    engine?.attachBirdLabel(birdLabel.current);
    return () => engine?.attachBirdLabel(null);
  }, [engine]);
  return (
    <>
      {/* collée à la mésange par le moteur ; la flèche pointe vers elle */}
      <div
        ref={birdLabel}
        className="pointer-events-none fixed top-0 left-0 z-10 opacity-0 transition-opacity"
      >
        <span className="absolute bottom-1 left-1 flex w-max items-center gap-1.5 font-mono text-[11px] font-bold tracking-widest text-ink uppercase select-none">
          <span className="text-base leading-none">↙</span>
          mésange charbonnière
        </span>
      </div>
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
};
