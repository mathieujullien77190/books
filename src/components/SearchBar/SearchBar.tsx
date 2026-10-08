'use client';

import { useMemo, useState } from 'react';

import BookList from '@/components/BookList';
import Panel from '@/components/ui/Panel';

import { MAX_RESULTS, SEARCH_MIN } from './constants';
import { searchBooks } from './helpers';
import type { SearchBarProps } from './types';

const Magnifier = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
  </svg>
);

export const SearchBar = ({ books, labels, onOpen, onRemove, onShowAll }: SearchBarProps) => {
  const [query, setQuery] = useState('');
  const q = query.trim();
  const results = useMemo(
    () => (q.length < SEARCH_MIN ? [] : searchBooks(books, q).slice(0, MAX_RESULTS)),
    [books, q],
  );

  const clear = (): void => setQuery('');

  const open = (id: string): void => {
    onOpen(id);
    clear();
  };

  const validate = (): void => {
    if (q.length < SEARCH_MIN) return;
    const matches = searchBooks(books, q);
    if (!matches.length) return;
    onShowAll(matches.map((b) => b.id));
    clear();
  };

  return (
    <div className="pointer-events-none fixed top-4 right-4 left-4 z-20">
      <div className="pointer-events-auto relative">
        <input
          type="search"
          className="h-14 w-full rounded-2xl border border-ink/10 bg-white/90 pr-16 pl-6 text-xl text-ink shadow-[0_10px_30px_rgba(31,42,55,0.14)] backdrop-blur-md outline-none placeholder:text-muted focus:border-accent [&::-webkit-search-cancel-button]:hidden"
          placeholder="Rechercher un livre, un auteur, un éditeur…"
          aria-label="Rechercher un livre"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') clear();
            else if (e.key === 'Enter') validate();
          }}
        />
        {query && (
          <button
            type="button"
            className="absolute top-1/2 right-14 -translate-y-1/2 cursor-pointer border-0 bg-transparent p-1 text-xl leading-none text-muted hover:text-ink"
            title="Effacer la recherche (Échap)"
            aria-label="Effacer la recherche"
            onClick={clear}
          >
            ×
          </button>
        )}
        <button
          type="button"
          className="absolute top-1/2 right-4 -translate-y-1/2 cursor-pointer border-0 bg-transparent p-1 text-muted hover:text-ink"
          title="Afficher tous les résultats devant soi (Entrée)"
          aria-label="Rechercher"
          onClick={validate}
        >
          <Magnifier />
        </button>
      </div>
      {q.length >= SEARCH_MIN && (
        <Panel className="pointer-events-auto mt-2 bg-white/95 px-5 py-3" aria-live="polite">
          {results.length === 0 ? (
            <p className="m-0 py-1 text-muted">Aucun livre ne correspond.</p>
          ) : (
            <>
              <p className="m-0 pb-1 text-xs text-muted">
                {results.length >= MAX_RESULTS
                  ? `${MAX_RESULTS}+ résultats`
                  : `${results.length} résultat${results.length > 1 ? 's' : ''}`}
              </p>
              <BookList books={results} labels={labels} onOpen={open} onRemove={onRemove} />
            </>
          )}
        </Panel>
      )}
    </div>
  );
};
