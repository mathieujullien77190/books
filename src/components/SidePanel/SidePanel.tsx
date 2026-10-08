import { useState } from 'react';

import CrateList from '@/components/CrateList';
import CrateSelection from '@/components/CrateSelection';
import Button from '@/components/ui/Button';
import { APP_NAME, SIZE_KEYS, SIZES } from '@/constants';
import { crateLabels } from '@/helpers';

import { MODES } from './constants';
import { statusText } from './helpers';
import type { SidePanelProps } from './types';

const H2 = ({ children }: { children: string }) => (
  <h2 className="mt-3.5 mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
    {children}
  </h2>
);

export const SidePanel = ({
  defaultOpen = false,
  editLocked = false,
  onUnlockEdit,
  snapshot,
  onAddCrate,
  onCrateSize,
  onCrateDims,
  onCrateFlat,
  onCrateOverhang,
  onCrateDelete,
  onMode,
  onPickCrate,
  onUndo,
}: SidePanelProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const [wrongCode, setWrongCode] = useState(false);
  const edit = snapshot.mode === 'edit';
  const selected = snapshot.crates.find((c) => c.id === snapshot.selectedId) ?? null;
  const labels = crateLabels(snapshot.crates);

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
                title={
                  editLocked && m.mode === 'edit'
                    ? 'Verrouillé : saisis le code ci-dessous'
                    : m.title
                }
                disabled={editLocked && m.mode === 'edit'}
                onClick={() => onMode(m.mode)}
              >
                {m.label}
              </Button>
            ))}
          </div>
          {editLocked && (
            <form
              className="mt-1.5"
              onSubmit={async (e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem('editCode') as HTMLInputElement;
                const ok = await onUnlockEdit?.(input.value);
                setWrongCode(!ok);
                input.value = '';
              }}
            >
              <div className="flex items-center gap-1.5">
                <label htmlFor="editCode" className="text-xs text-muted">
                  Code
                </label>
                <input
                  id="editCode"
                  name="editCode"
                  type="password"
                  className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 text-sm text-ink"
                  autoComplete="off"
                  onChange={() => setWrongCode(false)}
                />
                <Button type="submit">OK</Button>
              </div>
              {wrongCode && <p className="m-0 mt-1 text-xs text-[#c0392b]">Code incorrect.</p>}
            </form>
          )}

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
        </div>
      )}
    </aside>
  );
};
