import Button from '@/components/ui/Button';
import { DIMS_CM_MAX, DIMS_CM_MIN, SIZE_KEYS, SIZES } from '@/constants';
import { crateDims } from '@/helpers';

import { DIM_FIELDS, EMPTY_TEXT, ROTATE_HINT } from './constants';
import { storageLabel } from './helpers';
import type { CrateSelectionProps } from './types';

const BOX = 'mt-1.5 rounded-[10px] border border-dashed border-ink/10 px-2.5 py-2';
const INPUT = 'w-16 min-w-0 rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-sm text-ink';

export const CrateSelection = ({
  crate,
  label,
  count,
  onSize,
  onDims,
  onFlat,
  onOverhang,
  onDelete,
}: CrateSelectionProps) => {
  if (!crate) return <div className={`${BOX} text-xs text-muted`}>{EMPTY_TEXT}</div>;
  const dims = crateDims(crate);
  return (
    <div className={BOX}>
      <div className="mb-1.5 font-semibold">
        Caisse {label} · {SIZES[crate.size].label.toLowerCase()} · {count} livre
        {count > 1 ? 's' : ''}{' '}
        <span className="font-normal text-muted">· {storageLabel(crate)}</span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-xs text-muted">Taille</span>
        {[...SIZE_KEYS, 'X' as const].map((k) => (
          <Button
            key={k}
            variant={k === crate.size ? 'active' : 'default'}
            onClick={() => onSize(crate.id, k)}
          >
            {SIZES[k].label}
          </Button>
        ))}
        {
          <>
            <span className="mr-0.5 ml-1 text-xs text-muted">Livres</span>
            <Button
              variant={crate.flat ? 'default' : 'active'}
              onClick={() => onFlat(crate.id, false)}
            >
              Debout
            </Button>
            <Button
              variant={crate.flat ? 'active' : 'default'}
              onClick={() => onFlat(crate.id, true)}
            >
              À plat
            </Button>
          </>
        }
        <Button
          variant={crate.overhang ? 'active' : 'default'}
          title="Les livres plus profonds que la caisse y entrent et dépassent devant"
          onClick={() => onOverhang(crate.id, !crate.overhang)}
        >
          Dépassent
        </Button>
        <Button variant="danger" onClick={() => onDelete(crate.id)}>
          Supprimer
        </Button>
      </div>
      {crate.size === 'X' && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {DIM_FIELDS.map(({ key, label: l }) => (
            <label key={key} className="flex items-center gap-1 text-xs text-muted">
              {l}
              <input
                type="number"
                className={INPUT}
                min={DIMS_CM_MIN}
                max={DIMS_CM_MAX}
                step={0.5}
                value={Math.round(dims[key] * 20) / 2}
                onChange={(e) => {
                  const cm = Math.round(Number(e.target.value) * 2) / 2; // au demi-centimètre
                  if (!Number.isFinite(cm)) return;
                  const v = Math.min(DIMS_CM_MAX, Math.max(DIMS_CM_MIN, cm)) / 10;
                  onDims(crate.id, { ...dims, [key]: v });
                }}
              />
              cm
            </label>
          ))}
        </div>
      )}
      <p className="m-0 text-xs text-muted">{ROTATE_HINT}</p>
    </div>
  );
};
