// node .claude/skills/series-gaps/series-gaps.mjs [racine du projet]
// Lit la base MongoDB (URI dans .env.local) et affiche en JSON les séries détectées dans les titres
// des livres, les numéros possédés et ceux qui manquent entre le premier et le dernier possédé.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const { MongoClient } = createRequire(join(root, 'package.json'))('mongodb');
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };

/** { name, from, to } — `to` > `from` pour un numéro double (n°36/37). Null si le titre n'est pas numéroté. */
export const parseVolume = (title) => {
  const t = title.replace(/\s+/g, ' ').trim();
  let m;
  // « Série T.3 – Sous-titre », « Série Tome 3 », « Série Épisode 3 »
  if ((m = t.match(/^(.*?)[\s,–-]*(?:t\.?|tome|épisode|episode|vol\.?)\s*0*(\d+)\b/i)))
    return { name: m[1].trim(), from: +m[2], to: +m[2] };
  // « La Hulotte n°36/37 »
  if ((m = t.match(/^(.*?)\s*n°\s*0*(\d+)(?:\s*\/\s*(\d+))?/i)))
    return { name: m[1].trim(), from: +m[2], to: m[3] ? +m[3] : +m[2] };
  // « Série (Sous-série IV) » ou « Série IV »
  if ((m = t.match(/^(.*?)\s*\(?([A-Za-zÀ-ÿ' ]*?)\s+(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\)?\s*$/)))
    return { name: (m[2] ? m[2] : m[1]).trim() || m[1].trim(), from: ROMAN[m[3]], to: ROMAN[m[3]] };
  // « Série 12 », « Série 3 – Sous-titre »
  if ((m = t.match(/^(.*?)\s+0*(\d+)(?:\s*[–-].*)?$/)) && m[1].length > 2)
    return { name: m[1].trim(), from: +m[2], to: +m[2] };
  return null;
};

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const client = await new MongoClient(env.MONGODB_URI).connect();
try {
  const db = client.db(env.MONGODB_DB || 'bibliotheque');
  const crates = await db.collection('crates').find({}, { sort: { order: 1 } }).toArray();
  const count = {};
  const label = {};
  for (const c of crates) {
    count[c.size] = (count[c.size] ?? 0) + 1;
    label[c.id] = `${{ S: 'P', M: 'M', L: 'G', X: 'T' }[c.size]}${count[c.size]}`;
  }
  const books = await db.collection('books').find({}).toArray();

  const groups = new Map();
  const unnumbered = [];
  for (const b of books) {
    const v = parseVolume(b.title);
    if (!v || !v.name) {
      unnumbered.push(b.title);
      continue;
    }
    const key = norm(v.name);
    const g = groups.get(key) ?? { name: v.name, author: b.author ?? null, owned: new Map() };
    for (let n = v.from; n <= v.to; n++) g.owned.set(n, { title: b.title, crate: label[b.crate] ?? 'à côté' });
    groups.set(key, g);
  }

  const series = [...groups.values()]
    .map((g) => {
      const nums = [...g.owned.keys()].sort((a, b) => a - b);
      const missing = [];
      for (let n = nums[0]; n <= nums[nums.length - 1]; n++) if (!g.owned.has(n)) missing.push(n);
      const crateSet = [...new Set([...g.owned.values()].map((o) => o.crate))];
      return {
        series: g.name,
        author: g.author,
        count: nums.length,
        first: nums[0],
        last: nums[nums.length - 1],
        missingBetween: missing,
        crates: crateSet,
      };
    })
    .sort((a, b) => a.series.localeCompare(b.series));

  console.log(
    JSON.stringify(
      {
        books: books.length,
        seriesWithGaps: series.filter((s) => s.missingBetween.length),
        seriesComplete: series.filter((s) => !s.missingBetween.length && s.count >= 2),
        singles: series.filter((s) => s.count === 1).map((s) => `${s.series} ${s.first}`),
        notNumbered: unnumbered.length,
      },
      null,
      1,
    ),
  );
} finally {
  await client.close();
}
