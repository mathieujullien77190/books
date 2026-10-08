'use client';

import { useEffect, useRef, useState } from 'react';

import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';

import { FLOAT_SHADOW } from './constants';

type ViewMenuProps = {
  onRecenter: () => void;
  /** Mode léger (pavés de couleur) actif. */
  turbo: boolean;
  onToggleTurbo: () => void;
};

/** Menu du téléphone, en bas à droite : « Centrer » la vue et « Turbo » (mode léger, plus fluide). */
export const ViewMenu = ({ onRecenter, turbo, onToggleTurbo }: ViewMenuProps) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // se referme d'un toucher à côté ou avec Échap
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={root} className="fixed right-4 bottom-4 z-10 flex flex-col items-end gap-2">
      {open && (
        <div
          role="menu"
          className={`flex flex-col gap-1.5 rounded-2xl bg-white/95 p-2 backdrop-blur-md ${FLOAT_SHADOW}`}
        >
          <Button
            role="menuitem"
            className="justify-start"
            onClick={() => {
              onRecenter();
              setOpen(false);
            }}
          >
            🎯 Centrer
          </Button>
          <Button
            role="menuitemcheckbox"
            aria-checked={turbo}
            pressed={turbo}
            variant={turbo ? 'active' : 'default'}
            className="justify-start"
            title="Livres en pavés de couleur, sans mésange ni ombres : plus fluide"
            onClick={() => {
              onToggleTurbo();
              setOpen(false);
            }}
          >
            ⚡ Turbo
          </Button>
        </div>
      )}
      <IconButton
        className={`h-11 w-11 bg-white/90 text-xl backdrop-blur-md ${FLOAT_SHADOW} ${open ? 'border-ink' : ''}`}
        label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ☰
      </IconButton>
    </div>
  );
};
