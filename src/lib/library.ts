import type { Db, UpdateFilter } from 'mongodb';

import { searchBooks } from '@/components/SearchBar/helpers';
import { crateLabels } from '@/helpers';
import { getDb } from '@/lib/mongodb';
import type { Book, BookKind, Crate } from '@/types';

/** Opérations sur la bibliothèque (MongoDB) appelées par les outils de Claude. */

const ASIDE = 'à côté';
const KINDS: BookKind[] = ['roman', 'bd', 'documentaire', 'guide', 'dictionnaire', 'autre'];
const MAX_RESULTS = 50;

type StoredBook = Book & { order?: number };

type Library = { crates: Crate[]; books: StoredBook[]; labels: Map<string, string> };

const load = async (db: Db): Promise<Library> => {
  const opts = { projection: { _id: 0 }, sort: { order: 1 } } as const;
  const crates = await db.collection<Crate>('crates').find({}, opts).toArray();
  const books = await db.collection<StoredBook>('books').find({}, opts).toArray();
  return { crates, books, labels: crateLabels(crates) };
};

/** Fiche courte (moins de jetons pour Claude) : champs vides omis, `details` ajoute éditeur, année et type. */
const brief = (b: Book, lib: Library, details = false) => ({
  id: b.id,
  title: b.title,
  ...(b.author ? { author: b.author } : {}),
  ...(details && b.publisher ? { publisher: b.publisher } : {}),
  ...(details && b.year ? { year: b.year } : {}),
  ...(details && b.isbn ? { isbn: b.isbn, isbn_confiance: b.isbnConfidence ?? 'moyenne' } : {}),
  ...(details && b.kind ? { kind: b.kind } : {}),
  // couleur dominante de la couverture (hex) : permet de distinguer « le jaune » parmi des titres proches
  color: b.color,
  crate: (b.crate && lib.labels.get(b.crate)) || ASIDE,
});

const crateByLabel = (lib: Library, label: string): Crate | null => {
  const wanted = label.trim().toUpperCase();
  return lib.crates.find((c) => lib.labels.get(c.id) === wanted) ?? null;
};

/** Révision de l'état : les pages ouvertes voient que la base a changé et se rechargent. */
const bumpRev = (db: Db): Promise<unknown> =>
  db
    .collection('meta')
    .updateOne({ _id: 'state' as never }, { $inc: { rev: 1 } }, { upsert: true });

/** Ordre qui place un livre juste après `anchor` dans la liste triée de tous les livres. */
const orderAfter = (all: StoredBook[], anchor?: StoredBook): number => {
  const sorted = [...all].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!anchor) return (sorted[sorted.length - 1]?.order ?? 0) + 1;
  const next = sorted[sorted.indexOf(anchor) + 1];
  return next ? ((anchor.order ?? 0) + (next.order ?? 0)) / 2 : (anchor.order ?? 0) + 1;
};

/** Livre après lequel insérer : `afterId`, sinon le dernier livre de la caisse. */
const anchorIn = (
  lib: Library,
  target: Crate | null,
  afterId?: string,
  skipId?: string,
): StoredBook | undefined => {
  if (afterId) return lib.books.find((b) => b.id === afterId);
  const inCrate = lib.books.filter(
    (b) => b.id !== skipId && (target ? b.crate === target.id : !b.crate),
  );
  return inCrate[inCrate.length - 1];
};

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- lecture ----------

export const overview = async (): Promise<string> => {
  const lib = await load(await getDb());
  const rows = lib.crates.map((c) => {
    const n = lib.books.filter((b) => b.crate === c.id).length;
    return `${lib.labels.get(c.id)} (${c.size === 'X' ? 'transparente' : c.size === 'S' ? 'petite' : c.size === 'M' ? 'moyenne' : 'grande'}, ${n} livres)`;
  });
  const aside = lib.books.filter((b) => !b.crate).length;
  return `${lib.books.length} livres. Caisses : ${rows.join(', ')}.${aside ? ` ${aside} livres posés à côté.` : ''}`;
};

export const searchLibrary = async (args: {
  query?: string;
  author?: string;
  crate?: string;
  kind?: string;
  limit?: number;
  details?: boolean;
}): Promise<unknown> => {
  const lib = await load(await getDb());
  let found = args.query?.trim() ? searchBooks(lib.books, args.query) : lib.books;
  if (args.author) found = found.filter((b) => fold(b.author ?? '').includes(fold(args.author!)));
  if (args.kind) found = found.filter((b) => b.kind === args.kind);
  if (args.crate) {
    const label = args.crate.trim().toLowerCase() === ASIDE ? null : crateByLabel(lib, args.crate);
    if (args.crate.trim().toLowerCase() !== ASIDE && !label)
      return { error: `Caisse inconnue : ${args.crate}` };
    found = found.filter((b) => (label ? b.crate === label.id : !b.crate));
  }
  const limit = Math.min(MAX_RESULTS, Math.max(1, args.limit ?? 15));
  return {
    total: found.length,
    shown: Math.min(limit, found.length),
    books: found.slice(0, limit).map((b) => brief(b, lib, args.details)),
  };
};

export const crateContents = async (label: string): Promise<unknown> => {
  const lib = await load(await getDb());
  if (label.trim().toLowerCase() === ASIDE)
    return { crate: ASIDE, books: lib.books.filter((b) => !b.crate).map((b) => brief(b, lib)) };
  const crate = crateByLabel(lib, label);
  if (!crate) return { error: `Caisse inconnue : ${label}` };
  return {
    crate: lib.labels.get(crate.id),
    size: crate.size,
    // ordre de rangement : le premier est le plus à gauche (ou le plus bas d'une pile)
    books: lib.books.filter((b) => b.crate === crate.id).map((b) => brief(b, lib)),
  };
};

const ROMAN: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
};

/** Tome(s) d'un titre : « Série T.3 », « Série n°36/37 », « Série IV », « Série 12 ». Null si non numéroté. */
const parseVolume = (title: string): { name: string; from: number; to: number } | null => {
  const t = title.replace(/\s+/g, ' ').trim();
  let m = t.match(/^(.*?)[\s,–-]*(?:t\.?|tome|épisode|episode|vol\.?)\s*0*(\d+)\b/i);
  if (m) return { name: m[1]!.trim(), from: +m[2]!, to: +m[2]! };
  m = t.match(/^(.*?)\s*n°\s*0*(\d+)(?:\s*\/\s*(\d+))?/i);
  if (m) return { name: m[1]!.trim(), from: +m[2]!, to: m[3] ? +m[3] : +m[2]! };
  m = t.match(/^(.*?)\s*\(?([A-Za-zÀ-ÿ' ]*?)\s+(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\)?\s*$/);
  if (m) {
    const n = ROMAN[m[3]!]!;
    return { name: (m[2] ? m[2] : m[1]!).trim() || m[1]!.trim(), from: n, to: n };
  }
  m = t.match(/^(.*?)\s+0*(\d+)(?:\s*[–-].*)?$/);
  if (m && m[1]!.length > 2) return { name: m[1]!.trim(), from: +m[2]!, to: +m[2]! };
  return null;
};

/** Séries numérotées et tomes manquants entre le premier et le dernier possédés (calcul serveur : un seul appel). */
export const seriesGaps = async (args: { series?: string }): Promise<unknown> => {
  const lib = await load(await getDb());
  const groups = new Map<string, { name: string; owned: Set<number> }>();
  for (const b of lib.books) {
    const v = parseVolume(b.title);
    if (!v || !v.name) continue;
    const key = fold(v.name)
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const g = groups.get(key) ?? { name: v.name, owned: new Set<number>() };
    for (let n = v.from; n <= v.to; n++) g.owned.add(n);
    groups.set(key, g);
  }
  const wanted = args.series ? fold(args.series) : '';
  const series = [...groups.values()]
    .filter((g) => !wanted || fold(g.name).includes(wanted))
    .map((g) => {
      const nums = [...g.owned].sort((a, b) => a - b);
      const missing: number[] = [];
      for (let n = nums[0]!; n <= nums[nums.length - 1]!; n++) if (!g.owned.has(n)) missing.push(n);
      return {
        series: g.name,
        owned: nums.length,
        first: nums[0],
        last: nums[nums.length - 1],
        missing,
      };
    })
    .filter((s) => s.owned >= 2 || wanted)
    .sort((a, b) => a.series.localeCompare(b.series));
  return {
    note: "Tomes manquants ENTRE le premier et le dernier possédés ; le nombre total de tomes d'une série vient de tes connaissances, pas de la base.",
    withGaps: series.filter((s) => s.missing.length),
    completeCount: series.filter((s) => !s.missing.length).length,
  };
};

// ---------- écriture (jamais appelées sans le code d'Édition) ----------

/** Ordre qui place un livre au rang `position` (1 = premier) parmi les livres de la caisse cible. */
const orderAtPosition = (
  lib: Library,
  target: Crate | null,
  skipId: string,
  position: number,
): number => {
  const others = lib.books.filter((b) => b.id !== skipId);
  const inCrate = others.filter((b) => (target ? b.crate === target.id : !b.crate));
  const idx = Math.min(Math.max(Math.floor(position) - 1, 0), inCrate.length);
  if (idx > 0) return orderAfter(others, inCrate[idx - 1]);
  const first = inCrate[0];
  if (!first) return orderAfter(others, undefined);
  const sorted = [...others].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const before = sorted[sorted.indexOf(first) - 1];
  return before ? ((before.order ?? 0) + (first.order ?? 0)) / 2 : (first.order ?? 0) - 1;
};

export const moveBook = async (args: {
  book_id: string;
  crate: string;
  after_book_id?: string;
  position?: number;
}): Promise<unknown> => {
  const db = await getDb();
  const lib = await load(db);
  const book = lib.books.find((b) => b.id === args.book_id);
  if (!book) return { error: `Livre introuvable : ${args.book_id}` };
  const aside = args.crate.trim().toLowerCase() === ASIDE;
  const target = aside ? null : crateByLabel(lib, args.crate);
  if (!aside && !target) return { error: `Caisse inconnue : ${args.crate}` };
  const from = brief(book, lib).crate;
  const order =
    args.position !== undefined && !args.after_book_id
      ? orderAtPosition(lib, target, book.id, args.position)
      : orderAfter(
          lib.books.filter((b) => b.id !== book.id),
          anchorIn(lib, target, args.after_book_id, book.id),
        );
  await bumpRev(db);
  await db
    .collection<Book>('books')
    .updateOne(
      { id: book.id },
      target ? { $set: { crate: target.id, order } } : { $set: { order }, $unset: { crate: '' } },
    );
  await bumpRev(db);
  return { ok: true, title: book.title, from, to: aside ? ASIDE : lib.labels.get(target!.id) };
};

/** Échange la place de deux livres : chacun prend la caisse et le rang de l'autre. */
export const swapBooks = async (args: { book_a: string; book_b: string }): Promise<unknown> => {
  const db = await getDb();
  const lib = await load(db);
  const a = lib.books.find((b) => b.id === args.book_a);
  const b = lib.books.find((x) => x.id === args.book_b);
  if (!a) return { error: `Livre introuvable : ${args.book_a}` };
  if (!b) return { error: `Livre introuvable : ${args.book_b}` };
  if (a.id === b.id) return { error: 'Il faut deux livres différents' };
  const put = (from: StoredBook): UpdateFilter<Book> =>
    from.crate
      ? { $set: { crate: from.crate, order: from.order ?? 0 } }
      : { $set: { order: from.order ?? 0 }, $unset: { crate: '' } };
  const at = { a: brief(a, lib).crate, b: brief(b, lib).crate };
  await bumpRev(db);
  await db.collection<Book>('books').updateOne({ id: a.id }, put(b));
  await db.collection<Book>('books').updateOne({ id: b.id }, put(a));
  await bumpRev(db);
  return {
    ok: true,
    a: { title: a.title, from: at.a, to: at.b },
    b: { title: b.title, from: at.b, to: at.a },
  };
};

export const addBook = async (args: {
  title: string;
  crate: string;
  author?: string;
  publisher?: string;
  year?: number;
  kind?: string;
  summary?: string;
  height_cm?: number;
  depth_cm?: number;
  thickness_cm?: number;
  after_book_id?: string;
}): Promise<unknown> => {
  const db = await getDb();
  const lib = await load(db);
  const title = args.title.trim();
  if (!title) return { error: 'Titre vide' };
  const aside = args.crate.trim().toLowerCase() === ASIDE;
  const target = aside ? null : crateByLabel(lib, args.crate);
  if (!aside && !target) return { error: `Caisse inconnue : ${args.crate}` };
  const duplicate = lib.books.find((b) => fold(b.title) === fold(title));
  const anchor = anchorIn(lib, target, args.after_book_id);
  const cm = (v: number | undefined, fallback: number): number =>
    v && v > 0 ? Math.round(v) / 10 : fallback;
  const book: Book & { order: number } = {
    id: Math.random().toString(36).slice(2, 9),
    title,
    color: '#c9c3b5',
    summary: args.summary ?? '',
    h: cm(args.height_cm, 2.0),
    d: cm(args.depth_cm, 1.4),
    t: cm(args.thickness_cm, 0.2),
    crate: target ? target.id : null,
    order: orderAfter(lib.books, anchor),
    ...(args.author ? { author: args.author } : {}),
    ...(args.publisher ? { publisher: args.publisher } : {}),
    ...(args.year ? { year: args.year } : {}),
    ...(args.kind && KINDS.includes(args.kind as BookKind) ? { kind: args.kind as BookKind } : {}),
  };
  await bumpRev(db);
  await db.collection('books').insertOne({ ...book });
  await bumpRev(db);
  return {
    ok: true,
    id: book.id,
    title,
    crate: aside ? ASIDE : lib.labels.get(target!.id),
    note: duplicate
      ? `Attention : un livre au titre identique existait déjà (${duplicate.id}).`
      : undefined,
  };
};

export const deleteBook = async (args: {
  book_id: string;
  confirmed?: boolean;
}): Promise<unknown> => {
  const db = await getDb();
  const lib = await load(db);
  const book = lib.books.find((b) => b.id === args.book_id);
  if (!book) return { error: `Livre introuvable : ${args.book_id}` };
  if (args.confirmed !== true)
    return {
      error:
        "Suppression non confirmée. Demande d'abord à l'utilisateur de confirmer, puis rappelle avec confirmed: true.",
    };
  await bumpRev(db);
  await db.collection<Book>('books').deleteOne({ id: book.id });
  await bumpRev(db);
  return { ok: true, deleted: book.title, was_in: brief(book, lib).crate };
};
