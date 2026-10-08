'use client';

import { useEffect, useMemo } from 'react';

import IconButton from '@/components/ui/IconButton';
import Panel from '@/components/ui/Panel';
import { missingVolumes } from '@/helpers';

import type { ToBuyListProps } from './types';

/** Liste défilante des tomes manquants, par série : ce qu'il reste à acheter. */
export const ToBuyList = ({ books, onClose }: ToBuyListProps) => {
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of missingVolumes(books)) {
      const label = m.label.slice(m.series.length + 1);
      map.set(m.series, [...(map.get(m.series) ?? []), label]);
    }
    return [...map.entries()];
  }, [books]);
  const total = groups.reduce((n, [, labels]) => n + labels.length, 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/20 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <Panel
        role="dialog"
        aria-label="Livres à acheter"
        className="relative flex max-h-[80dvh] w-full max-w-md flex-col bg-white/95 px-4 pt-4 pb-3"
        onClick={(e) => e.stopPropagation()}
      >
        <IconButton
          className="absolute top-2 right-2 h-8 w-8"
          label="Fermer la liste"
          onClick={onClose}
        >
          ✕
        </IconButton>
        <h2 className="m-0 mb-0.5 pr-8 text-base font-semibold">Livres à acheter</h2>
        <p className="m-0 mb-2 text-xs text-muted">
          {total} tome{total > 1 ? 's' : ''} manquant{total > 1 ? 's' : ''} dans {groups.length}{' '}
          série{groups.length > 1 ? 's' : ''}
        </p>
        <ul className="m-0 min-h-0 flex-1 [scrollbar-width:thin] list-none overflow-y-auto p-0">
          {groups.map(([series, labels]) => (
            <li key={series} className="border-t border-ink/10 py-2 first:border-t-0">
              <div className="text-sm font-semibold">{series}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {labels.map((label) => (
                  <span
                    key={label}
                    className="flex h-7 min-w-7 items-center justify-center rounded-lg border border-dashed border-ink/40 bg-ink/[0.06] px-1.5 text-xs leading-none text-muted"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </li>
          ))}
          {groups.length === 0 && <li className="py-3 text-sm text-muted">Il ne manque rien.</li>}
        </ul>
      </Panel>
    </div>
  );
};
