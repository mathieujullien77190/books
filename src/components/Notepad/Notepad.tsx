'use client';

import { useState } from 'react';

import Panel from '@/components/ui/Panel';

import { AiTab } from './AiTab';
import type { NotepadProps } from './types';

/** Panneau « Claude » : conversation avec l'assistant de la bibliothèque. */
export const Notepad = ({
  className = '',
  defaultOpen = false,
  onChanged,
  onOpenBook,
}: NotepadProps) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Panel as="section" className={`pointer-events-auto ${className}`}>
      <div className="flex items-center justify-between gap-2 px-3.5 py-2">
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-base leading-none font-semibold tracking-[0.2px] max-md:min-h-11"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="w-5 text-center">✨</span>
          <span>Claude</span>
        </button>
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent px-1 text-xs text-muted max-md:min-h-11 max-md:min-w-11"
          aria-label={open ? 'Replier Claude' : 'Déplier Claude'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '▴' : '▾'}
        </button>
      </div>
      {open && <AiTab onChanged={onChanged} onOpenBook={onOpenBook} />}
    </Panel>
  );
};
