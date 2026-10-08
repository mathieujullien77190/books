import { GRID_STEP, SIZE_LETTERS, SIZES, STORE_KEY } from '@/constants';
import type { Book, Crate, Dims, Id, SavedState } from '@/types';

export const uid = (): Id => Math.random().toString(36).slice(2, 9);

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** Cotes d'une caisse : les siennes si elle est transparente, sinon celles de sa taille. */
export const crateDims = (c: Pick<Crate, 'size' | 'dims'>): Dims =>
  (c.size === 'X' && c.dims) || SIZES[c.size];

/** Numéro de chaque caisse : lettre de taille + rang parmi les caisses de cette taille (G1, G2, M1, P1…). */
export const crateLabels = (crates: Crate[]): Map<Id, string> => {
  const count: Partial<Record<Crate['size'], number>> = {};
  const labels = new Map<Id, string>();
  for (const c of crates) {
    const n = (count[c.size] ?? 0) + 1;
    count[c.size] = n;
    labels.set(c.id, `${SIZE_LETTERS[c.size]}${n}`);
  }
  return labels;
};

export const snap = (v: number, step = GRID_STEP): number => Math.round(v / step) * step;

/** Ancienne sauvegarde localStorage, lue une seule fois pour la migrer vers MongoDB. */
export const loadLegacyState = (): SavedState | null => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SavedState>;
    if (!Array.isArray(s.crates) || !s.crates.length || !Array.isArray(s.books)) return null;
    return {
      crates: s.crates.filter((c) => c && SIZES[c.size] && Array.isArray(c.q)),
      books: s.books.map((b) => ({ ...b, summary: b.summary ?? '', crate: b.crate ?? null })),
      messy: !!s.messy,
    };
  } catch {
    return null;
  }
};

export const clearLegacyState = (): void => {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // stockage indisponible : rien à effacer
  }
};

/** Numéro dans une série : `last` > `num` pour un numéro double (36/37) ; `mark` préfixe l'affichage. */
export type Volume = { prefix: string; num: number; last: number; mark: 'T' | 'n°' };

/** Repère un numéro de tome à la fin du titre (T3, Tome 3, T.3, Épisode 3, n°36/37, ou juste un
 * chiffre final). */
export const parseVolume = (title: string): Volume | null => {
  const m = title.match(
    /^(.*?)[\s,–-]*(?:t\.?|tome|épisode|episode|vol\.?)\s*0*(\d+)\s*(?:[–-].*)?$/i,
  );
  if (m) return { prefix: m[1]!.trim(), num: +m[2]!, last: +m[2]!, mark: 'T' };
  const mn = title.match(/^(.*?)\s*(?:n°|nº)\s*0*(\d+)(?:\s*\/\s*(\d+))?\s*(?:[–-].*)?$/i);
  if (mn && mn[1]!.trim()) {
    const num = +mn[2]!;
    return { prefix: mn[1]!.trim(), num, last: mn[3] ? +mn[3] : num, mark: 'n°' };
  }
  const m2 = title.match(/^(.*?)\s+0*(\d+)$/);
  if (m2 && m2[1]!.length > 2)
    return { prefix: m2[1]!.trim(), num: +m2[2]!, last: +m2[2]!, mark: 'T' };
  return null;
};

/** Libellé court d'un numéro : « T3 », « n°36/37 ». */
export const volumeLabel = (v: Volume): string =>
  `${v.mark}${v.num}${v.last > v.num ? `/${v.last}` : ''}`;

export type MissingSeries = {
  prefix: string;
  mark: Volume['mark'];
  have: number[];
  missing: number[];
};

/** Pour chaque série détectée dans la bibliothèque, les numéros de tome absents entre le premier
 * et le dernier possédé (ex. T1, T2, T4 → manque T3). */
export const missingBooks = (books: Book[]): MissingSeries[] => {
  const groups = new Map<string, { prefix: string; mark: Volume['mark']; nums: Set<number> }>();
  for (const b of books) {
    const v = parseVolume(b.title);
    if (!v) continue;
    const key = v.prefix.toLowerCase();
    const g = groups.get(key) ?? { prefix: v.prefix, mark: v.mark, nums: new Set<number>() };
    for (let n = v.num; n <= v.last; n++) g.nums.add(n);
    groups.set(key, g);
  }
  const out: MissingSeries[] = [];
  for (const { prefix, mark, nums } of groups.values()) {
    if (nums.size < 2) continue;
    const have = [...nums].sort((a, b) => a - b);
    const missing: number[] = [];
    for (let n = have[0]!; n <= have[have.length - 1]!; n++) if (!nums.has(n)) missing.push(n);
    if (missing.length) out.push({ prefix, mark, have, missing });
  }
  return out.sort((a, b) => a.prefix.localeCompare(b.prefix));
};
