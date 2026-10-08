'use client';

import { useState } from 'react';

import { AiTab } from './AiTab';
import type { NotepadProps } from './types';

/** Panneau « Claude » : conversation avec l'assistant de la bibliothèque. */
export const Notepad = ({ className = '', defaultOpen = false, onChanged }: NotepadProps) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={`pointer-events-auto rounded-2xl border border-ink/10 bg-white/85 text-sm shadow-[0_10px_30px_rgba(31,42,55,0.14)] backdrop-blur-md ${className}`}
    >
      <div className="flex items-center justify-between gap-2 px-3.5 py-2">
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-base leading-none font-semibold tracking-[0.2px]"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="w-5 text-center">✨</span>
          <span>Claude</span>
        </button>
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent px-1 text-xs text-muted"
          aria-label={open ? 'Replier Claude' : 'Déplier Claude'}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '▴' : '▾'}
        </button>
      </div>
      {open && <AiTab onChanged={onChanged} />}
    </section>
  );
};
