import { useEffect, useRef } from 'react';

import { BookPanel } from './BookPanel';
import type { LayoutProps } from './types';

/** Fond du bureau d'AOC : fiche du livre ouvert seulement (ni recherche, ni Claude, ni réglages, ni Édition). */
export const BackgroundLayout = ({ engine, snap, labels, openBook, lock }: LayoutProps) => {
  const birdLabel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    engine?.attachBirdLabel(birdLabel.current);
    return () => engine?.attachBirdLabel(null);
  }, [engine]);
  return (
    <>
      {/* collée à la mésange par le moteur */}
      <div
        ref={birdLabel}
        className="pointer-events-none fixed top-0 left-0 z-10 opacity-0 transition-opacity"
      >
        <a
          href="https://books-zqje.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto absolute top-2 left-7 block w-max -translate-y-1/2 rounded-xl bg-white px-3 py-2 text-ink no-underline shadow-lg ring-1 ring-ink/15 hover:ring-accent"
        >
          {/* queue de la bulle, vers la mésange */}
          <span className="absolute top-1/2 -left-1.5 h-3 w-3 -translate-y-1/2 rotate-45 border-b border-l border-ink/15 bg-white" />
          <span className="relative block text-xs leading-tight font-semibold">
            https://books-zqje.vercel.app/
          </span>
        </a>
      </div>
      <p className="pointer-events-none fixed right-0 bottom-3 left-0 z-10 m-0 hidden text-center font-mono text-[11px] font-bold tracking-widest text-ink uppercase select-none md:block">
        molette enfoncée : tourner · clic droit : déplacer
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
};
