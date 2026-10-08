/** Valeur acceptée par `cn` : une classe, ou rien (faux, null, undefined) pour l'ignorer. */
export type ClassValue = string | false | null | undefined;

/** Familles d'utilitaires Tailwind qui se contredisent : la dernière classe écrite gagne. */
const GROUPS: [group: string, test: RegExp][] = [
  ['rounded', /^rounded(-(none|sm|md|lg|xl|2xl|3xl|full|\[.+\]))?$/],
  ['p', /^p-/],
  ['px', /^px-/],
  ['py', /^py-/],
  ['pt', /^pt-/],
  ['pb', /^pb-/],
  ['pl', /^pl-/],
  ['pr', /^pr-/],
  ['h', /^h-/],
  ['w', /^w-/],
  ['min-h', /^min-h-/],
  ['min-w', /^min-w-/],
  ['text-size', /^text-(xs|sm|base|lg|xl|[2-9]xl|\[\d+(\.\d+)?(px|rem)\])$/],
  [
    'text-color',
    /^text-(ink|muted|accent|white|black|bg|current|transparent|\[#[0-9a-fA-F]+\])(\/.+)?$/,
  ],
  ['bg', /^bg-(ink|white|accent|bg|black|transparent|\[#[0-9a-fA-F]+\])(\/.+)?$/],
  ['border-color', /^border-(ink|accent|white|current|transparent|\[#[0-9a-fA-F]+\])(\/.+)?$/],
  ['border-t-color', /^border-t-(ink|accent|white|current|transparent)(\/.+)?$/],
  ['shadow', /^shadow(-|$)/],
  ['leading', /^leading-/],
  ['font-weight', /^font-(normal|medium|semibold|bold)$/],
];

/** Une classe courte (p, px…) écrase aussi les classes plus fines posées avant elle. */
const CLEARS: Record<string, string[]> = {
  p: ['px', 'py', 'pt', 'pb', 'pl', 'pr'],
  px: ['pl', 'pr'],
  py: ['pt', 'pb'],
};

/** Sépare « md:hover:px-2 » en variantes (« md:hover: ») et utilitaire (« px-2 »), sans couper les crochets. */
const split = (cls: string): [variants: string, utility: string] => {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < cls.length; i++) {
    const c = cls[i];
    if (c === '[') depth++;
    else if (c === ']') depth--;
    else if (c === ':' && depth === 0) cut = i;
  }
  return [cls.slice(0, cut + 1), cls.slice(cut + 1)];
};

const groupOf = (utility: string): string | null => {
  const bare = utility.replace(/^!|!$/g, '');
  for (const [group, test] of GROUPS) if (test.test(bare)) return group;
  return null;
};

/**
 * Assemble des classes et résout les conflits connus (rounded, p/px/py, h, w, text-*, bg, shadow…) :
 * à variante égale, la dernière gagne, quel que soit l'ordre de la feuille de style.
 * Version minimale de tailwind-merge, limitée à ce que l'appli utilise.
 */
export const cn = (...values: ClassValue[]): string => {
  const kept: { cls: string; variants: string; group: string | null }[] = [];
  for (const value of values) {
    if (!value) continue;
    for (const cls of value.split(/\s+/)) {
      if (!cls) continue;
      const [variants, utility] = split(cls);
      const group = groupOf(utility);
      if (group) {
        const gone = [group, ...(CLEARS[group] ?? [])];
        for (let i = kept.length - 1; i >= 0; i--) {
          const k = kept[i]!;
          if (k.variants === variants && k.group && gone.includes(k.group)) kept.splice(i, 1);
        }
      }
      kept.push({ cls, variants, group });
    }
  }
  return kept.map((k) => k.cls).join(' ');
};
