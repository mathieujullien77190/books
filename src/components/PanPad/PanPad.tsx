'use client';

import { useEffect, useRef } from 'react';

import type { PanPadProps } from './types';

const REPEAT_MS = 50;

const ARROWS: { label: string; text: string; dx: number; dy: number; cell: string }[] = [
  { label: 'Monter la vue', text: '▲', dx: 0, dy: 1, cell: 'col-start-2 row-start-1' },
  {
    label: 'Décaler la vue vers la gauche',
    text: '◀',
    dx: -1,
    dy: 0,
    cell: 'col-start-1 row-start-2',
  },
  {
    label: 'Décaler la vue vers la droite',
    text: '▶',
    dx: 1,
    dy: 0,
    cell: 'col-start-3 row-start-2',
  },
  { label: 'Descendre la vue', text: '▼', dx: 0, dy: -1, cell: 'col-start-2 row-start-3' },
];

/** Croix de flèches : déplace la vue (la bibliothèque) ; rester appuyé répète le mouvement. */
export const PanPad = ({ onPan, className = '' }: PanPadProps) => {
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
      className={`pointer-events-auto grid grid-cols-3 grid-rows-3 gap-0.5 rounded-2xl bg-white/90 p-1 shadow-[0_10px_30px_rgba(31,42,55,0.14)] backdrop-blur-md ${className}`}
    >
      {ARROWS.map((a) => (
        <button
          key={a.label}
          type="button"
          aria-label={a.label}
          title={a.label}
          className={`${a.cell} h-8 w-8 cursor-pointer touch-none rounded-lg border-0 bg-transparent p-0 text-xs text-ink hover:bg-ink/10 active:bg-ink/20`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            start(a.dx, a.dy);
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
        >
          {a.text}
        </button>
      ))}
    </div>
  );
};
