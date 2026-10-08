import Badge from '@/components/ui/Badge';

import type { BookListProps } from './types';

export const BookList = ({ books, labels, onOpen, onRemove }: BookListProps) => (
  <ul className="mt-1.5 max-h-[28vh] list-none overflow-auto border-t border-ink/10 p-0">
    {books.map((b) => {
      const tag = (b.crate && labels.get(b.crate)) || 'à côté';
      return (
        <li key={b.id} className="flex items-center gap-2 border-b border-ink/10 px-0.5 py-1.5">
          <span
            className="h-5 w-3 flex-none rounded-sm shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]"
            style={{ background: b.color }}
          />
          <button
            type="button"
            className="flex-1 cursor-pointer overflow-hidden border-0 bg-transparent p-0 text-left text-sm text-ellipsis whitespace-nowrap text-ink max-md:min-h-11"
            title={b.title}
            onClick={() => onOpen(b.id)}
          >
            {b.title}
          </button>
          <Badge>{tag}</Badge>
          {/* même geste qu'avant (retrait immédiat, pas de confirmation) ; le verrou d'Édition est géré plus haut */}
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent px-1.5 py-0.5 text-base leading-none text-muted hover:text-[#c0392b] max-md:min-h-11 max-md:min-w-11"
            title="Retirer"
            aria-label={`Retirer « ${b.title} » de la bibliothèque`}
            onClick={() => onRemove(b.id)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </li>
      );
    })}
  </ul>
);
