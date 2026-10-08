'use client';

import { useState } from 'react';

import { AiTab } from './AiTab';
import { NotesTab } from './NotesTab';
import { TABS } from './constants';
import type { NotepadProps, NotepadTab } from './types';

export const Notepad = ({ className = '', defaultOpen = false, onChanged }: NotepadProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<NotepadTab>('notes');

  return (
    <section
      className={`pointer-events-auto rounded-2xl border border-ink/10 bg-white/85 text-sm shadow-[0_10px_30px_rgba(31,42,55,0.14)] backdrop-blur-md ${className}`}
    >
      <div className="flex items-center justify-between gap-2 px-3.5 py-2">
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          📝 Calepin
        </button>
        <div className="flex items-center gap-1">
          {open &&
            TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`cursor-pointer rounded-md border px-2 py-0.5 text-xs ${
                  tab === t.id
                    ? 'border-ink bg-ink text-white'
                    : 'border-ink/10 bg-white text-ink hover:border-accent'
                }`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent px-1 text-xs text-muted"
            aria-label={open ? 'Replier le calepin' : 'Déplier le calepin'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? '▴' : '▾'}
          </button>
        </div>
      </div>
      {open && (tab === 'notes' ? <NotesTab /> : <AiTab onChanged={onChanged} />)}
    </section>
  );
};
