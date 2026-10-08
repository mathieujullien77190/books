'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useEmbedMode } from '@/components/shared';
import SearchBar from '@/components/SearchBar';
import MissingBar from '@/components/ToBuyList/MissingBar';
import ToBuyList from '@/components/ToBuyList';
import Button from '@/components/ui/Button';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import Toast from '@/components/ui/Toast';

import { crateLabels } from '@/helpers';

import { FLOAT_SHADOW } from './constants';
import { BackgroundLayout } from './BackgroundLayout';
import { DesktopLayout } from './DesktopLayout';
import { useCrateEngine, useIsPhone } from './helpers';
import { PhoneLayout } from './PhoneLayout';
import type { CratesAppProps } from './types';
import { useEditLock } from './useEditLock';

export const CratesApp = ({ className = '' }: CratesAppProps) => {
  const { holder, snapshot: snap } = useCrateEngine();
  const engine = holder.engine;
  const phone = useIsPhone();
  const bg = useEmbedMode() === 'bg'; // fond du bureau d'AOC : scène seule
  // fond du bureau : page transparente pour laisser voir le bureau d'AOC derrière la scène
  useEffect(() => {
    if (!bg) return;
    const els = [document.documentElement, document.body];
    els.forEach((el) => el.style.setProperty('background', 'transparent'));
    return () => els.forEach((el) => el.style.removeProperty('background'));
  }, [bg]);
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

      {!bg && (
        <SearchBar
          books={snap.books}
          labels={labels}
          onOpen={(id) => engine?.openBook(id)}
          onRemove={(id) => (lock.locked ? lock.denied() : engine?.removeBook(id))}
          onShowAll={(ids) => engine?.showBooks(ids)}
        />
      )}
      {bg ? (
        <BackgroundLayout {...layout} />
      ) : phone ? (
        <PhoneLayout {...layout} />
      ) : (
        <DesktopLayout {...layout} />
      )}
      {!bg && (
        <Button
          className={`fixed right-4 bottom-4 z-10 h-11 rounded-full px-4 backdrop-blur-md ${FLOAT_SHADOW} ${snap.lite ? '' : 'bg-white/90'}`}
          variant={snap.lite ? 'active' : 'default'}
          pressed={snap.lite}
          title="Livres en pavés de couleur, sans caisses, mésange ni ombres : plus fluide sur un petit appareil"
          onClick={() => engine?.setLite(!snap.lite)}
        >
          ⚡ Mode léger{snap.lite ? ' : activé' : ''}
        </Button>
      )}
      {snap.loadError && !snap.loading && (
        <div
          role="alert"
          className="fixed top-1/2 left-1/2 z-40 flex w-[min(360px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-2xl bg-white p-5 text-center shadow-[0_10px_30px_rgba(31,42,55,0.3)]"
        >
          <p className="m-0 text-sm">Impossible de lire la bibliothèque (base injoignable).</p>
          <Button variant="primary" onClick={() => engine?.reload()}>
            Réessayer
          </Button>
        </div>
      )}
      {snap.loading && <LoadingOverlay message="Chargement de la bibliothèque…" bare={bg} />}
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
