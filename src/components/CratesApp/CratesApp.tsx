'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import SearchBar from '@/components/SearchBar';
import MissingBar from '@/components/ToBuyList/MissingBar';
import ToBuyList from '@/components/ToBuyList';
import IconButton from '@/components/ui/IconButton';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import Toast from '@/components/ui/Toast';

import { crateLabels } from '@/helpers';

import { FLOAT_SHADOW } from './constants';
import { DesktopLayout } from './DesktopLayout';
import { useCrateEngine, useIsPhone } from './helpers';
import { PhoneLayout } from './PhoneLayout';
import type { CratesAppProps } from './types';
import { useEditLock } from './useEditLock';

export const CratesApp = ({ className = '' }: CratesAppProps) => {
  const { holder, snapshot: snap } = useCrateEngine();
  const engine = holder.engine;
  const phone = useIsPhone();
  const { lock, toast } = useEditLock(engine, snap.mode);
  useEffect(() => {
    engine?.setCrateClickZoom(!phone); // téléphone : plus de zoom au toucher d'une caisse, seulement au pincement
  }, [engine, phone]);
  const [showBuy, setShowBuy] = useState(false);
  // identité stable : une ref inline serait détachée/rattachée à chaque rendu et recréerait le moteur
  const mountCanvas = useCallback(
    (el: HTMLCanvasElement | null) => holder.mountCanvas(el),
    [holder],
  );
  const attachTooltip = useCallback(
    (el: HTMLDivElement | null) => holder.attachTooltip(el),
    [holder],
  );

  const labels = useMemo(() => crateLabels(snap.crates), [snap.crates]);
  const openBook = snap.openId ? (snap.books.find((b) => b.id === snap.openId) ?? null) : null;
  const layout = { engine, snap, labels, openBook, lock };

  return (
    <div className={`relative h-dvh w-full overflow-hidden ${className}`}>
      <canvas ref={mountCanvas} className="block h-full w-full touch-none" />

      <SearchBar
        books={snap.books}
        labels={labels}
        onOpen={(id) => engine?.openBook(id)}
        onRemove={(id) => (lock.locked ? lock.denied() : engine?.removeBook(id))}
        onShowAll={(ids) => engine?.showBooks(ids)}
      />
      {phone ? <PhoneLayout {...layout} /> : <DesktopLayout {...layout} />}
      <IconButton
        className={`fixed right-4 bottom-4 z-10 h-11 w-11 bg-white/90 text-xl backdrop-blur-md ${FLOAT_SHADOW}`}
        label="Recentrer la vue"
        title="Recentrer la vue sur toutes les caisses"
        onClick={() => engine?.recenter()}
      >
        🎯
      </IconButton>
      {snap.loading && <LoadingOverlay message="Chargement de la bibliothèque…" />}
      {snap.missingBrowse && (
        <MissingBar
          browse={snap.missingBrowse}
          onPrev={() => engine?.stepMissing(-1)}
          onNext={() => engine?.stepMissing(1)}
          onList={() => setShowBuy(true)}
          onClose={() => engine?.endMissingBrowse()}
        />
      )}
      {showBuy && <ToBuyList books={snap.books} onClose={() => setShowBuy(false)} />}
      <Toast message={toast} />
      <div
        ref={attachTooltip}
        className="pointer-events-none fixed z-30 translate-x-3 translate-y-3 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity duration-100"
      />
    </div>
  );
};
