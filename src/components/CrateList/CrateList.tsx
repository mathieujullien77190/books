import Badge from '@/components/ui/Badge';
import { SIZES } from '@/constants';

import { EMPTY_TEXT } from './constants';
import { dimsText } from './helpers';
import type { CrateListProps } from './types';

export const CrateList = ({ crates, labels, counts, selectedId, onPick }: CrateListProps) => {
  if (!crates.length) return <p className="m-0 text-xs text-muted">{EMPTY_TEXT}</p>;
  return (
    <ul className="m-0 max-h-[22vh] list-none overflow-auto border-t border-ink/10 p-0">
      {crates.map((c) => {
        const n = counts[c.id] ?? 0;
        return (
          <li key={c.id} className="border-b border-ink/10">
            <button
              type="button"
              className={`flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-1 py-1.5 text-left text-sm ${
                c.id === selectedId ? 'font-semibold text-accent' : 'text-ink'
              }`}
              aria-current={c.id === selectedId || undefined}
              onClick={() => onPick(c.id)}
            >
              <span className="w-8 flex-none font-semibold">{labels.get(c.id) ?? ''}</span>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {SIZES[c.size].label.toLowerCase()} · {dimsText(c)}
              </span>
              <Badge>
                {n} livre{n > 1 ? 's' : ''}
              </Badge>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
