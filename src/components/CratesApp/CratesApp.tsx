'use client';

import { useCallback } from 'react';

import BookDetail from '@/components/BookDetail';
import Notepad from '@/components/Notepad';
import SearchBar from '@/components/SearchBar';
import SidePanel from '@/components/SidePanel';
import Button from '@/components/ui/Button';

import { crateLabels } from '@/helpers';

import { useCrateEngine } from './helpers';
import type { CratesAppProps } from './types';

export const CratesApp = ({ className = '' }: CratesAppProps) => {
  const { holder, snapshot: snap } = useCrateEngine();
  const engine = holder.engine;
  // identité stable : une ref inline serait détachée/rattachée à chaque rendu et recréerait le moteur
  const mountCanvas = useCallback(
    (el: HTMLCanvasElement | null) => holder.mountCanvas(el),
    [holder],
  );
  const attachTooltip = useCallback(
    (el: HTMLDivElement | null) => holder.attachTooltip(el),
    [holder],
  );

  const openBook = snap.openId ? (snap.books.find((b) => b.id === snap.openId) ?? null) : null;

  return (
    <div className={`relative h-dvh w-full overflow-hidden ${className}`}>
      <canvas ref={mountCanvas} className="block h-full w-full touch-none" />

      <SearchBar
        books={snap.books}
        labels={crateLabels(snap.crates)}
        onOpen={(id) => engine?.openBook(id)}
        onRemove={(id) => engine?.removeBook(id)}
        onShowAll={(ids) => engine?.showBooks(ids)}
      />
      <div className="pointer-events-none fixed top-[88px] right-4 bottom-[76px] z-10 flex w-[min(340px,calc(100vw-32px))] flex-col gap-3">
        <SidePanel
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
          onRecenter={() => engine?.recenter()}
          onUndo={() => engine?.undo()}
        />
        <Notepad className="shrink-0" />
        <BookDetail
          book={openBook}
          crateLabel={
            openBook?.crate ? (crateLabels(snap.crates).get(openBook.crate) ?? null) : null
          }
          allBooks={snap.books}
          onChange={(patch) => openBook && engine?.updateBook(openBook.id, patch)}
          onOpen={(id) => engine?.openBook(id)}
          onHint={(crateId) => engine?.hintCrate(crateId)}
          onClose={() => engine?.closeBook()}
        />
      </div>
      <Button
        className="fixed right-4 bottom-4 z-10 h-11 w-11 rounded-full bg-white/90 p-0 text-xl shadow-[0_10px_30px_rgba(31,42,55,0.14)] backdrop-blur-md"
        title="Recentrer la vue sur toutes les caisses"
        aria-label="Recentrer la vue"
        onClick={() => engine?.recenter()}
      >
        🎯
      </Button>
      <div
        ref={attachTooltip}
        className="pointer-events-none fixed z-30 translate-x-3 translate-y-3 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity duration-100"
      />
    </div>
  );
};
