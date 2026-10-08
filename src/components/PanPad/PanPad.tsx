'use client';

import { useEffect, useRef } from 'react';

import type { PanPadProps } from './types';

const REPEAT_MS = 40;

/** Chevron pointant vers le haut ; tourné pour les autres directions. */
const Chevron = ({ turn }: { turn: number }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5"
    style={{ transform: `rotate(${turn}deg)` }}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M6 15l6-6 6 6" />
  </svg>
);

const ARROWS: { label: string; dx: number; dy: number; turn: number; place: string }[] = [
  { label: 'Monter la vue', dx: 0, dy: 1, turn: 0, place: 'top-0.5 left-1/2 -translate-x-1/2' },
  {
    label: 'Descendre la vue',
    dx: 0,
    dy: -1,
    turn: 180,
    place: 'bottom-0.5 left-1/2 -translate-x-1/2',
  },
  {
    label: 'Décaler la vue vers la gauche',
    dx: -1,
    dy: 0,
    turn: -90,
    place: 'left-0.5 top-1/2 -translate-y-1/2',
  },
  {
    label: 'Décaler la vue vers la droite',
    dx: 1,
    dy: 0,
    turn: 90,
    place: 'right-0.5 top-1/2 -translate-y-1/2',
  },
];

/**
 * Pavé directionnel rond : quatre chevrons déplacent la vue (rester appuyé répète le mouvement),
 * la cible au centre recentre sur toutes les caisses.
 */
export const PanPad = ({ onPan, onRecenter, className = '' }: PanPadProps) => {
  const timer = useRef<number | undefined>(undefined);

  const stop = (): void => window.clearInterval(timer.current);
  useEffect(() => stop, []);

  const start = (dx: number, dy: number): void => {
    stop();
    onPan(dx, dy);
    timer.current = window.setInterval(() => onPan(dx, dy), REPEAT_MS);
  };

  return (
    <div
      className={`pointer-events-auto relative h-[120px] w-[120px] rounded-full border border-ink/10 bg-white/90 shadow-[0_10px_30px_rgba(31,42,55,0.18)] backdrop-blur-md ${className}`}
    >
      {ARROWS.map((a) => (
        <button
          key={a.label}
          type="button"
          aria-label={a.label}
          title={a.label}
          className={`absolute ${a.place} flex h-10 w-10 cursor-pointer touch-none items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink transition-colors hover:bg-accent/15 active:scale-95 active:bg-accent/30`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            start(a.dx, a.dy);
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
        >
          <Chevron turn={a.turn} />
        </button>
      ))}
      <button
        type="button"
        aria-label="Recentrer la vue"
        title="Recentrer la vue sur toutes les caisses"
        className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-ink/10 bg-white p-0 text-base shadow-sm hover:border-accent active:scale-95"
        onClick={onRecenter}
      >
        🎯
      </button>
    </div>
  );
};
