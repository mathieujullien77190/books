import Button from '@/components/ui/Button';
import { SIZES } from '@/constants';
import { crateDims } from '@/helpers';

import { DimField } from './DimField';
import { ALL_SIZE_KEYS, DIM_FIELDS, EMPTY_TEXT, ROTATE_HINT } from './constants';
import { storageLabel } from './helpers';
import type { CrateSelectionProps } from './types';

const BOX = 'mt-1.5 rounded-[10px] border border-dashed border-ink/10 px-2.5 py-2';

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
        {ALL_SIZE_KEYS.map((k) => (
          <Button
            key={k}
            variant={k === crate.size ? 'active' : 'default'}
            pressed={k === crate.size}
            onClick={() => onSize(crate.id, k)}
          >
            {SIZES[k].label}
          </Button>
        ))}
        <span className="mr-0.5 ml-1 text-xs text-muted">Livres</span>
        <Button
          variant={crate.flat ? 'default' : 'active'}
          pressed={!crate.flat}
          onClick={() => onFlat(crate.id, false)}
        >
          Debout
        </Button>
        <Button
          variant={crate.flat ? 'active' : 'default'}
          pressed={!!crate.flat}
          onClick={() => onFlat(crate.id, true)}
        >
          À plat
        </Button>
        <Button
          variant={crate.overhang ? 'active' : 'default'}
          pressed={!!crate.overhang}
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
            <DimField
              key={key}
              label={l}
              value={Math.round(dims[key] * 20) / 2}
              onCommit={(v) => onDims(crate.id, { ...dims, [key]: v })}
            />
          ))}
        </div>
      )}
      <p className="m-0 text-xs text-muted">{ROTATE_HINT}</p>
    </div>
  );
};
