import { useState } from 'react';

import TextInput from '@/components/ui/TextInput';
import { DIMS_CM_MAX, DIMS_CM_MIN } from '@/constants';

import type { DimFieldProps } from './types';

/**
 * Cote d'une caisse transparente, en cm. La frappe reste dans un brouillon : la valeur n'est envoyée
 * au moteur qu'à la sortie du champ ou à Entrée (sinon « 25 » enverrait d'abord « 2 » : une
 * reconstruction de la caisse, une entrée d'historique et une sauvegarde par touche).
 */
export const DimField = ({ label, value, onCommit }: DimFieldProps) => {
  const [draft, setDraft] = useState(String(value));
  // le moteur a changé la valeur (annulation, autre caisse) : le brouillon la reprend
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(String(value));
  }

  const commit = (): void => {
    const cm = Math.round(Number(draft) * 2) / 2; // au demi-centimètre
    if (draft.trim() === '' || !Number.isFinite(cm)) {
      setDraft(String(value));
      return;
    }
    const next = Math.min(DIMS_CM_MAX, Math.max(DIMS_CM_MIN, cm));
    setDraft(String(next));
    if (next !== value) onCommit(next / 10);
  };

  return (
    <label className="flex items-center gap-1 text-xs text-muted">
      {label}
      <TextInput
        type="number"
        className="w-16 min-w-0 px-2 py-1.5"
        min={DIMS_CM_MIN}
        max={DIMS_CM_MAX}
        step={0.5}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      cm
    </label>
  );
};
