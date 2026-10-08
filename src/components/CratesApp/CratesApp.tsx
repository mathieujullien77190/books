'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import BookDetail from '@/components/BookDetail';
import Notepad from '@/components/Notepad';
import PanPad from '@/components/PanPad';
import SearchBar from '@/components/SearchBar';
import SidePanel from '@/components/SidePanel';
import Button from '@/components/ui/Button';

import { crateLabels } from '@/helpers';

import { DENIED_MESSAGES, DENIED_TOAST_MS } from './constants';
import { checkEditToken, unlockEdit, useCrateEngine, useIsPhone } from './helpers';
import type { CratesAppProps } from './types';

export const CratesApp = ({ className = '' }: CratesAppProps) => {
  const { holder, snapshot: snap } = useCrateEngine();
  const engine = holder.engine;
  const phone = useIsPhone();
  /** Téléphone : feuille ouverte par les deux boutons du bas (une seule à la fois). */
  /** Édition déverrouillée sur téléphone : le serveur a accepté le code, ou le jeton gardé sur l'appareil. */
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void checkEditToken().then((ok) => !cancelled && setUnlocked(ok));
    return () => {
      cancelled = true;
    };
  }, []);
  // sans le code, pas d'Édition : on revient en Lecture si on y arrive
  useEffect(() => {
    if (!unlocked && engine && snap.mode === 'edit') engine.setMode('view');
  }, [unlocked, engine, snap.mode]);
  /** Verrouillé : tant que le code d'Édition n'a pas été saisi, tout est en lecture seule. */
  const locked = !unlocked;
  const [toast, setToast] = useState('');
  const toastTimer = useRef(0);
  const denied = useCallback((): void => {
    setToast(DENIED_MESSAGES[Math.floor(Math.random() * DENIED_MESSAGES.length)] ?? '');
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), DENIED_TOAST_MS);
  }, []);
  useEffect(() => {
    engine?.setEditDeniedHandler(locked ? denied : null);
  }, [engine, locked, denied]);
  /** Téléphone : livre dont la fiche est affichée (par le bouton « Détail » sous le livre). */
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'library' | 'claude' | null>(null);
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
        onRemove={(id) => (locked ? denied() : engine?.removeBook(id))}
        onShowAll={(ids) => engine?.showBooks(ids)}
      />
      {phone ? (
        <>
          {sheet && (
            <div className="pointer-events-none fixed inset-x-4 bottom-[76px] z-20 flex max-h-[60dvh] flex-col">
              {sheet === 'library' ? (
                <SidePanel
                  defaultOpen
                  editLocked={!unlocked}
                  onUnlockEdit={async (code) => {
                    const ok = await unlockEdit(code);
                    if (ok) setUnlocked(true);
                    return ok;
                  }}
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
              ) : (
                <Notepad defaultOpen onChanged={() => engine?.reload()} />
              )}
            </div>
          )}
          {openBook && detailFor !== openBook.id && (
            <Button
              className="fixed bottom-[76px] left-1/2 z-20 h-10 -translate-x-1/2 rounded-2xl bg-white/90 px-5 text-base shadow-[0_10px_30px_rgba(31,42,55,0.14)] backdrop-blur-md"
              onClick={() => setDetailFor(openBook.id)}
            >
              📖 Détail
            </Button>
          )}
          {openBook && detailFor === openBook.id && (
            <div className="pointer-events-none fixed inset-x-4 bottom-[76px] z-20 flex max-h-[60dvh] flex-col">
              <BookDetail
                book={openBook}
                crateLabel={
                  openBook.crate ? (crateLabels(snap.crates).get(openBook.crate) ?? null) : null
                }
                allBooks={snap.books}
                readOnly={locked}
                onDenied={denied}
                onChange={(patch) => engine?.updateBook(openBook.id, patch)}
                onOpen={(id) => engine?.openBook(id)}
                onHint={(crateId) => engine?.hintCrate(crateId)}
                onClose={() => setDetailFor(null)}
              />
            </div>
          )}
          {snap.openId && (
            <>
              <Button
                className="fixed top-1/2 left-2 z-20 h-12 w-10 -translate-y-1/2 rounded-full bg-white/80 p-0 text-2xl backdrop-blur-md"
                aria-label="Livre précédent"
                disabled={!snap.hasPrev}
                onClick={() => engine?.stepBook(-1)}
              >
                ‹
              </Button>
              <Button
                className="fixed top-1/2 right-2 z-20 h-12 w-10 -translate-y-1/2 rounded-full bg-white/80 p-0 text-2xl backdrop-blur-md"
                aria-label="Livre suivant"
                disabled={!snap.hasNext}
                onClick={() => engine?.stepBook(1)}
              >
                ›
              </Button>
            </>
          )}
          <div className="fixed bottom-4 left-4 z-30 flex gap-2">
            <Button
              variant={sheet === 'library' ? 'active' : 'default'}
              className="h-11 rounded-2xl px-4 text-base shadow-[0_10px_30px_rgba(31,42,55,0.14)]"
              onClick={() => setSheet((s) => (s === 'library' ? null : 'library'))}
            >
              📚 Biblio
            </Button>
            <Button
              variant={sheet === 'claude' ? 'active' : 'default'}
              className="h-11 rounded-2xl px-4 text-base shadow-[0_10px_30px_rgba(31,42,55,0.14)]"
              onClick={() => setSheet((s) => (s === 'claude' ? null : 'claude'))}
            >
              ✨ Claude
            </Button>
          </div>
        </>
      ) : (
        <div className="pointer-events-none fixed top-[88px] right-4 bottom-[76px] z-10 flex w-[min(340px,calc(100vw-32px))] flex-col gap-3">
          <SidePanel
            editLocked={locked}
            onUnlockEdit={async (code) => {
              const ok = await unlockEdit(code);
              if (ok) setUnlocked(true);
              return ok;
            }}
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
          <Notepad className="shrink-0" onChanged={() => engine?.reload()} />
          <BookDetail
            book={openBook}
            crateLabel={
              openBook?.crate ? (crateLabels(snap.crates).get(openBook.crate) ?? null) : null
            }
            allBooks={snap.books}
            readOnly={locked}
            onDenied={denied}
            onChange={(patch) => openBook && engine?.updateBook(openBook.id, patch)}
            onOpen={(id) => engine?.openBook(id)}
            onHint={(crateId) => engine?.hintCrate(crateId)}
            onClose={() => engine?.closeBook()}
          />
        </div>
      )}
      <Button
        className="fixed right-4 bottom-4 z-10 h-11 w-11 rounded-full bg-white/90 p-0 text-xl shadow-[0_10px_30px_rgba(31,42,55,0.14)] backdrop-blur-md"
        title="Recentrer la vue sur toutes les caisses"
        aria-label="Recentrer la vue"
        onClick={() => engine?.recenter()}
      >
        🎯
      </Button>
      <PanPad
        className="fixed right-4 bottom-[72px] z-10"
        onPan={(dx, dy) => engine?.pan(dx, dy)}
      />
      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed top-[88px] left-1/2 z-40 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl bg-ink px-4 py-3 text-center text-sm text-white shadow-[0_10px_30px_rgba(31,42,55,0.3)]"
        >
          {toast}
        </div>
      )}
      <div
        ref={attachTooltip}
        className="pointer-events-none fixed z-30 translate-x-3 translate-y-3 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity duration-100"
      />
    </div>
  );
};
