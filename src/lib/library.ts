import type { Db } from 'mongodb';

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

const brief = (b: Book, lib: Library) => ({
  id: b.id,
  title: b.title,
  author: b.author ?? null,
  publisher: b.publisher ?? null,
  year: b.year ?? null,
  kind: b.kind ?? null,
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
  const limit = Math.min(MAX_RESULTS, Math.max(1, args.limit ?? 25));
  return {
    total: found.length,
    shown: Math.min(limit, found.length),
    books: found.slice(0, limit).map((b) => brief(b, lib)),
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

// ---------- écriture (jamais appelées sans le code d'Édition) ----------

export const moveBook = async (args: {
  book_id: string;
  crate: string;
  after_book_id?: string;
}): Promise<unknown> => {
  const db = await getDb();
  const lib = await load(db);
  const book = lib.books.find((b) => b.id === args.book_id);
  if (!book) return { error: `Livre introuvable : ${args.book_id}` };
  const aside = args.crate.trim().toLowerCase() === ASIDE;
  const target = aside ? null : crateByLabel(lib, args.crate);
  if (!aside && !target) return { error: `Caisse inconnue : ${args.crate}` };
  const from = brief(book, lib).crate;
  const anchor = anchorIn(lib, target, args.after_book_id, book.id);
  const order = orderAfter(
    lib.books.filter((b) => b.id !== book.id),
    anchor,
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
