import { useState } from 'react';

import CrateList from '@/components/CrateList';
import CrateSelection from '@/components/CrateSelection';
import Button from '@/components/ui/Button';
import { APP_NAME, SIZE_KEYS, SIZES } from '@/constants';
import { crateLabels, missingBooks } from '@/helpers';

import { MODES } from './constants';
import { statusText } from './helpers';
import type { SidePanelProps } from './types';

const H2 = ({ children }: { children: string }) => (
  <h2 className="mt-3.5 mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
    {children}
  </h2>
);

export const SidePanel = ({
  snapshot,
  onAddCrate,
  onCrateSize,
  onCrateDims,
  onCrateFlat,
  onCrateOverhang,
  onCrateDelete,
  onMode,
  onPickCrate,
  onRecenter,
  onUndo,
}: SidePanelProps) => {
  const [open, setOpen] = useState(false);
  const edit = snapshot.mode === 'edit';
  const selected = snapshot.crates.find((c) => c.id === snapshot.selectedId) ?? null;
  const labels = crateLabels(snapshot.crates);
  const gaps = missingBooks(snapshot.books);

  return (
    <aside className="pointer-events-auto w-full shrink-0 rounded-2xl border border-ink/10 bg-white/85 text-sm shadow-[0_10px_30px_rgba(31,42,55,0.12)] backdrop-blur-md">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between rounded-2xl px-3.5 py-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-base font-semibold tracking-[0.2px]">📚 {APP_NAME}</span>
        <span className="text-xs text-muted">
          {statusText(snapshot.stored, snapshot.loose, snapshot.full)} {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="max-h-[calc(100dvh-340px)] [scrollbar-width:thin] overflow-y-auto border-t border-ink/10 px-4 pt-1 pb-3">
          <div className="mt-2 flex gap-1.5">
            {MODES.map((m) => (
              <Button
                key={m.mode}
                variant={snapshot.mode === m.mode ? 'active' : 'default'}
                title={m.title}
                onClick={() => onMode(m.mode)}
              >
                {m.label}
              </Button>
            ))}
          </div>

          <H2>Caisses</H2>
          {edit && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-xs text-muted">Ajouter</span>
              {SIZE_KEYS.map((k) => (
                <Button key={k} onClick={() => onAddCrate(k)}>
                  + {SIZES[k].label}
                </Button>
              ))}
              <Button onClick={() => onAddCrate('X')} title="Volume transparent aux cotes libres">
                + {SIZES.X.label}
              </Button>
              <Button
                onClick={onUndo}
                disabled={!snapshot.canUndo}
                title="Annuler la dernière action (Ctrl+Z)"
              >
                ↶ Annuler
              </Button>
            </div>
          )}
          <CrateList
            crates={snapshot.crates}
            labels={labels}
            counts={snapshot.counts}
            selectedId={snapshot.selectedId}
            onPick={onPickCrate}
          />
          {edit && (
            <CrateSelection
              crate={selected}
              label={selected ? (labels.get(selected.id) ?? '') : ''}
              count={selected ? (snapshot.counts[selected.id] ?? 0) : 0}
              onSize={onCrateSize}
              onDims={onCrateDims}
              onFlat={onCrateFlat}
              onOverhang={onCrateOverhang}
              onDelete={onCrateDelete}
            />
          )}

          {gaps.length > 0 && (
            <>
              <H2>Livres manquants</H2>
              <ul className="mb-2 list-disc pl-4 text-xs text-ink">
                {gaps.map((g) => (
                  <li key={g.prefix}>
                    <span className="font-medium">{g.prefix}</span> : manque{' '}
                    {g.missing.map((n) => `${g.mark}${n}`).join(', ')}
                  </li>
                ))}
              </ul>
            </>
          )}

          <H2>Vue</H2>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button onClick={onRecenter}>Recentrer</Button>
            <Button onClick={() => setOpen(false)} title="Replier le panneau">
              Replier
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
};
