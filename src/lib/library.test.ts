import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeDb, type Doc } from '@/test/fakeDb';

import {
  addBook,
  crateContents,
  deleteBook,
  moveBook,
  overview,
  searchLibrary,
  seriesGaps,
  setBookDimensions,
  swapBooks,
} from './library';

const mongo = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('@/lib/mongodb', () => mongo);

const crate = (id: string, size: string): Doc => ({ id, size, q: [0, 0, 0, 1], x: 0, z: 0, y: 0 });
const mk = (id: string, title: string, extra: Doc = {}): Doc => ({
  id,
  title,
  color: '#112233',
  summary: '',
  h: 2,
  t: 0.2,
  d: 1.4,
  crate: null,
  ...extra,
});

/** Quatre caisses (G1, P1, M1, T1) et cinq livres. */
const seed = () => ({
  crates: [crate('C1', 'L'), crate('C2', 'S'), crate('C3', 'M'), crate('C4', 'X')],
  books: [
    mk('a', 'Astérix T1', {
      crate: 'C1',
      order: 1,
      author: 'René Goscinny',
      publisher: 'Dargaud',
      year: 1961,
      kind: 'bd',
      isbn: '978-2',
      isbnConfidence: 'bonne',
    }),
    mk('b', 'Astérix T3', { crate: 'C1', order: 2, author: 'Goscinny', isbn: '978-3' }),
    mk('c', 'Le Petit Prince', { crate: 'C2', order: 3, author: 'Saint-Exupéry', kind: 'roman' }),
    mk('d', 'Zorro', { crate: null, order: 4 }),
    mk('e', 'Élégance du hérisson', { crate: 'C3', order: 5, author: 'Muriel Barbery' }),
  ],
});

const setup = (data: Record<string, Doc[]> = seed()) => {
  const fake = createFakeDb(data);
  mongo.getDb.mockResolvedValue(fake.db);
  return fake;
};

const ids = (list: Doc[]) => list.map((b) => b.id);

beforeEach(() => mongo.getDb.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('overview', () => {
  it('décrit les caisses (taille, nombre) et les livres posés à côté', async () => {
    setup();
    expect(await overview()).toBe(
      '5 livres. Caisses : G1 (grande, 2 livres), P1 (petite, 1 livres), M1 (moyenne, 1 livres), T1 (transparente, 0 livres). 1 livres posés à côté.',
    );
  });

  it('omet la phrase « à côté » quand tout est rangé', async () => {
    setup({ crates: [crate('C1', 'M')], books: [mk('a', 'A', { crate: 'C1', order: 1 })] });
    expect(await overview()).toBe('1 livres. Caisses : M1 (moyenne, 1 livres).');
  });
});

describe('searchLibrary', () => {
  it('sans filtre, renvoie tous les livres avec une fiche courte', async () => {
    setup();
    const r = (await searchLibrary({})) as { total: number; shown: number; books: Doc[] };
    expect(r.total).toBe(5);
    expect(r.shown).toBe(5);
    expect(r.books[0]).toEqual({
      id: 'a',
      title: 'Astérix T1',
      author: 'René Goscinny',
      color: '#112233',
      crate: 'G1',
    });
    expect(r.books[3]).toEqual({ id: 'd', title: 'Zorro', color: '#112233', crate: 'à côté' });
  });

  it('une requête blanche équivaut à aucune requête', async () => {
    setup();
    const r = (await searchLibrary({ query: '   ' })) as { total: number };
    expect(r.total).toBe(5);
  });

  it('cherche sans accents ni majuscules', async () => {
    setup();
    const r = (await searchLibrary({ query: 'ELEGANCE' })) as { books: Doc[] };
    expect(ids(r.books)).toEqual(['e']);
  });

  it('filtre par auteur, sans accents ; un livre sans auteur est écarté', async () => {
    setup();
    const r = (await searchLibrary({ author: 'rene' })) as { books: Doc[] };
    expect(ids(r.books)).toEqual(['a']);
    const g = (await searchLibrary({ author: 'goscinny' })) as { books: Doc[] };
    expect(ids(g.books)).toEqual(['a', 'b']);
  });

  it('filtre par type', async () => {
    setup();
    const r = (await searchLibrary({ kind: 'roman' })) as { books: Doc[] };
    expect(ids(r.books)).toEqual(['c']);
  });

  it('filtre par caisse, étiquette insensible à la casse et aux espaces', async () => {
    setup();
    const r = (await searchLibrary({ crate: ' g1 ' })) as { books: Doc[] };
    expect(ids(r.books)).toEqual(['a', 'b']);
  });

  it('filtre « à côté »', async () => {
    setup();
    const r = (await searchLibrary({ crate: ' À CÔTÉ' })) as { books: Doc[]; total: number };
    expect(ids(r.books)).toEqual(['d']);
    expect(r.total).toBe(1);
  });

  it('signale une caisse inconnue', async () => {
    setup();
    expect(await searchLibrary({ crate: 'Z9' })).toEqual({ error: 'Caisse inconnue : Z9' });
  });

  it('combine les filtres', async () => {
    setup();
    const r = (await searchLibrary({ query: 'asterix', crate: 'G1', kind: 'bd' })) as {
      books: Doc[];
    };
    expect(ids(r.books)).toEqual(['a']);
  });

  it('borne la limite entre 1 et 50 et garde le total', async () => {
    setup();
    const two = (await searchLibrary({ limit: 2 })) as { total: number; shown: number };
    expect(two).toMatchObject({ total: 5, shown: 2 });
    const zero = (await searchLibrary({ limit: 0 })) as { shown: number; books: Doc[] };
    expect(zero.shown).toBe(1);
    expect(zero.books).toHaveLength(1);
    const big = (await searchLibrary({ limit: 500 })) as { shown: number };
    expect(big.shown).toBe(5);
  });

  it('plafonne à 50 résultats et à 15 par défaut', async () => {
    const books = Array.from({ length: 60 }, (_, i) => mk(`b${i}`, `Livre ${i}`, { order: i }));
    setup({ crates: [], books });
    const def = (await searchLibrary({})) as { total: number; shown: number };
    expect(def).toMatchObject({ total: 60, shown: 15 });
    const max = (await searchLibrary({ limit: 500 })) as { shown: number; books: Doc[] };
    expect(max.shown).toBe(50);
    expect(max.books).toHaveLength(50);
  });

  it('details ajoute éditeur, année, ISBN (confiance) et type', async () => {
    setup();
    const r = (await searchLibrary({ details: true })) as { books: Doc[] };
    expect(r.books[0]).toMatchObject({
      publisher: 'Dargaud',
      year: 1961,
      isbn: '978-2',
      isbn_confiance: 'bonne',
      kind: 'bd',
    });
    // confiance par défaut ; champs vides omis
    expect(r.books[1]).toMatchObject({ isbn: '978-3', isbn_confiance: 'moyenne' });
    expect(r.books[1]).not.toHaveProperty('publisher');
    expect(r.books[1]).not.toHaveProperty('year');
    expect(r.books[1]).not.toHaveProperty('kind');
  });

  it('sans details, ces champs sont omis', async () => {
    setup();
    const r = (await searchLibrary({ details: false })) as { books: Doc[] };
    expect(r.books[0]).not.toHaveProperty('publisher');
    expect(r.books[0]).not.toHaveProperty('isbn');
  });

  it('une caisse inconnue de la base compte comme « à côté »', async () => {
    setup({ crates: [], books: [mk('x', 'Perdu', { crate: 'fantôme', order: 1 })] });
    const r = (await searchLibrary({})) as { books: Doc[] };
    expect(r.books[0]).toMatchObject({ crate: 'à côté' });
  });
});

describe('crateContents', () => {
  it('liste les livres de la caisse dans leur ordre', async () => {
    setup();
    const r = (await crateContents('g1')) as { crate: string; size: string; books: Doc[] };
    expect(r.crate).toBe('G1');
    expect(r.size).toBe('L');
    expect(ids(r.books)).toEqual(['a', 'b']);
  });

  it('liste la pile « à côté »', async () => {
    setup();
    const r = (await crateContents(' À côté ')) as { crate: string; books: Doc[] };
    expect(r.crate).toBe('à côté');
    expect(ids(r.books)).toEqual(['d']);
  });

  it('signale une caisse inconnue', async () => {
    setup();
    expect(await crateContents('Q1')).toEqual({ error: 'Caisse inconnue : Q1' });
  });
});

describe('seriesGaps', () => {
  const series = () => ({
    crates: [],
    books: [
      mk('1', 'Astérix T1', { order: 1 }),
      mk('2', 'Astérix T3', { order: 2 }),
      mk('3', 'ASTÉRIX Tome 4', { order: 3 }),
      mk('4', 'La Hulotte n°36/37', { order: 4 }),
      mk('5', 'La Hulotte n°40', { order: 5 }),
      mk('6', 'Cités IV', { order: 6 }),
      mk('7', 'Cités II', { order: 7 }),
      mk('8', 'Bételgeuse 1', { order: 8 }),
      mk('9', 'Bételgeuse 3', { order: 9 }),
      mk('10', 'Solo T1', { order: 10 }),
      mk('11', 'Complet T1', { order: 11 }),
      mk('12', 'Complet T2', { order: 12 }),
      mk('13', 'Le Petit Prince', { order: 13 }),
      mk('14', '( IV)', { order: 14 }),
      mk('15', 'Ab 5', { order: 15 }),
      mk('16', 'Saga 12 IV', { order: 16 }),
      mk('17', 'Les (Mondes IV)', { order: 17 }),
    ],
  });

  it('liste les tomes manquants entre le premier et le dernier possédés', async () => {
    setup(series());
    const r = (await seriesGaps({})) as {
      note: string;
      withGaps: { series: string; owned: number; first: number; last: number; missing: number[] }[];
      completeCount: number;
    };
    expect(r.note).toContain('ENTRE');
    expect(r.withGaps).toEqual([
      { series: 'Astérix', owned: 3, first: 1, last: 4, missing: [2] },
      { series: 'Bételgeuse', owned: 2, first: 1, last: 3, missing: [2] },
      { series: 'Cités', owned: 2, first: 2, last: 4, missing: [3] },
      { series: 'La Hulotte', owned: 3, first: 36, last: 40, missing: [38, 39] },
    ]);
    // « Complet » est seule à être complète avec au moins deux tomes
    expect(r.completeCount).toBe(1);
  });

  it('filtre sur un nom de série et montre alors les séries à un seul tome', async () => {
    setup(series());
    const solo = (await seriesGaps({ series: 'solo' })) as {
      withGaps: unknown[];
      completeCount: number;
    };
    expect(solo.withGaps).toEqual([]);
    expect(solo.completeCount).toBe(1);
    const hul = (await seriesGaps({ series: 'HULOTTE' })) as { withGaps: { series: string }[] };
    expect(hul.withGaps.map((s) => s.series)).toEqual(['La Hulotte']);
  });

  it('lit les numéros romains avec un nom de série entre parenthèses ou après un nombre', async () => {
    setup(series());
    const r = (await seriesGaps({ series: 'saga' })) as { completeCount: number };
    expect(r.completeCount).toBe(1);
    const m = (await seriesGaps({ series: 'monde' })) as { completeCount: number };
    expect(m.completeCount).toBe(1);
  });

  it('ignore un nom vide, un titre sans numéro et un préfixe trop court', async () => {
    setup(series());
    const r = (await seriesGaps({ series: 'prince' })) as { withGaps: unknown[] };
    expect(r.withGaps).toEqual([]);
    const ab = (await seriesGaps({ series: 'ab' })) as { completeCount: number };
    expect(ab.completeCount).toBe(0);
  });

  it('une base sans livre ne donne rien', async () => {
    setup({ crates: [], books: [] });
    expect(await seriesGaps({})).toMatchObject({ withGaps: [], completeCount: 0 });
  });
});

describe('moveBook', () => {
  const rev = (d: Record<string, Doc[]>) => d.meta?.find((m) => m._id === 'state')?.rev;
  const orderOf = (d: Record<string, Doc[]>, id: string) =>
    d.books!.find((b) => b.id === id)!.order;
  const row = (d: Record<string, Doc[]>, crateId: string | null) =>
    d
      .books!.filter((b) => (b.crate ?? null) === crateId)
      .sort((x, y) => (x.order as number) - (y.order as number))
      .map((b) => b.id);

  it('refuse un livre inconnu', async () => {
    setup();
    expect(await moveBook({ book_id: 'zzz', crate: 'G1' })).toEqual({
      error: 'Livre introuvable : zzz',
    });
  });

  it('refuse une caisse inconnue', async () => {
    const { data } = setup();
    expect(await moveBook({ book_id: 'a', crate: 'Z9' })).toEqual({
      error: 'Caisse inconnue : Z9',
    });
    expect(data.meta).toBeUndefined();
  });

  it('range en fin de rangée par défaut, avec deux incréments de révision', async () => {
    const { data } = setup({ ...seed(), meta: [{ _id: 'state', rev: 5 }] });
    const r = await moveBook({ book_id: 'c', crate: 'g1' });
    expect(r).toEqual({ ok: true, title: 'Le Petit Prince', from: 'P1', to: 'G1' });
    expect(row(data, 'C1')).toEqual(['a', 'b', 'c']);
    expect(data.books!.find((b) => b.id === 'c')!.crate).toBe('C1');
    expect(rev(data)).toBe(7);
  });

  it('crée la révision si elle manque', async () => {
    const { data } = setup();
    await moveBook({ book_id: 'c', crate: 'G1' });
    expect(rev(data)).toBe(2);
  });

  it('place après un livre donné, au milieu (moyenne des ordres)', async () => {
    const { data } = setup();
    await moveBook({ book_id: 'c', crate: 'G1', after_book_id: 'a' });
    expect(row(data, 'C1')).toEqual(['a', 'c', 'b']);
    expect(orderOf(data, 'c')).toBe(1.5);
  });

  it('place après le dernier livre de la liste : ordre + 1', async () => {
    const { data } = setup();
    await moveBook({ book_id: 'a', crate: 'M1', after_book_id: 'e' });
    expect(orderOf(data, 'a')).toBe(6);
  });

  it('un after_book_id inconnu envoie le livre en fin de liste', async () => {
    const { data } = setup();
    await moveBook({ book_id: 'a', crate: 'M1', after_book_id: 'nope' });
    expect(orderOf(data, 'a')).toBe(6);
  });

  it('une caisse vide reçoit le livre après le dernier de tous', async () => {
    const { data } = setup();
    const r = await moveBook({ book_id: 'a', crate: 't1' });
    expect(r).toMatchObject({ from: 'G1', to: 'T1' });
    expect(data.books!.find((b) => b.id === 'a')).toMatchObject({ crate: 'C4', order: 6 });
  });

  it('va « à côté » en retirant le champ crate, à la fin de la pile', async () => {
    const { data } = setup();
    const r = await moveBook({ book_id: 'a', crate: 'à côté' });
    expect(r).toMatchObject({ from: 'G1', to: 'à côté' });
    const moved = data.books!.find((b) => b.id === 'a')!;
    expect(moved).not.toHaveProperty('crate');
    expect(moved.order).toBe(4.5);
    expect(row(data, null)).toEqual(['d', 'a']);
  });

  it('ne se prend pas lui-même pour ancre quand il est déjà en fin de rangée', async () => {
    const { data } = setup();
    await moveBook({ book_id: 'b', crate: 'G1' });
    expect(row(data, 'C1')).toEqual(['a', 'b']);
  });

  it('un livre sans caisse (« à côté ») a pour origine « à côté »', async () => {
    setup();
    expect(await moveBook({ book_id: 'd', crate: 'M1' })).toMatchObject({
      from: 'à côté',
      to: 'M1',
    });
  });

  describe('position', () => {
    it('en tête de rangée : avant le premier livre, au milieu de ses voisins', async () => {
      const { data } = setup();
      await moveBook({ book_id: 'e', crate: 'G1', position: 1 });
      // avant 'a' (ordre 1) ; aucun livre avant : ordre − 1
      expect(orderOf(data, 'e')).toBe(0);
      expect(row(data, 'C1')).toEqual(['e', 'a', 'b']);
    });

    it('en tête, entre deux livres de caisses différentes (moyenne)', async () => {
      const { data } = setup();
      // les livres de G1 sont a (1), b (2) ; en déplaçant 'a' ailleurs, 'b' devient premier derrière rien
      await moveBook({ book_id: 'd', crate: 'M1', position: 1 });
      // M1 contient 'e' (5) ; le livre qui le précède dans la liste est 'c' (3) : (3 + 5) / 2
      expect(orderOf(data, 'd')).toBe(4);
      expect(row(data, 'C3')).toEqual(['d', 'e']);
    });

    it('au milieu de la rangée', async () => {
      const { data } = setup();
      await moveBook({ book_id: 'e', crate: 'G1', position: 2 });
      expect(row(data, 'C1')).toEqual(['a', 'e', 'b']);
    });

    it('au-delà de la fin : en dernier', async () => {
      const { data } = setup();
      await moveBook({ book_id: 'e', crate: 'G1', position: 99 });
      expect(row(data, 'C1')).toEqual(['a', 'b', 'e']);
    });

    it('zéro, négatif ou fractionnaire : bornés au premier rang', async () => {
      const { data } = setup();
      await moveBook({ book_id: 'e', crate: 'G1', position: -3 });
      expect(row(data, 'C1')[0]).toBe('e');
      const second = setup();
      await moveBook({ book_id: 'e', crate: 'G1', position: 2.9 });
      expect(row(second.data, 'C1')).toEqual(['a', 'e', 'b']);
    });

    it('dans une caisse vide : fin de liste', async () => {
      const { data } = setup();
      await moveBook({ book_id: 'a', crate: 'T1', position: 1 });
      expect(orderOf(data, 'a')).toBe(6);
    });

    it('vers « à côté » : se place parmi les livres sans caisse', async () => {
      const { data } = setup();
      await moveBook({ book_id: 'a', crate: 'à côté', position: 1 });
      expect(row(data, null)).toEqual(['a', 'd']);
    });

    it('after_book_id l’emporte sur position', async () => {
      const { data } = setup();
      await moveBook({ book_id: 'e', crate: 'G1', position: 1, after_book_id: 'a' });
      expect(row(data, 'C1')).toEqual(['a', 'e', 'b']);
    });
  });

  describe('livres sans champ order', () => {
    const bare = () => ({
      crates: [crate('C1', 'L')],
      books: [
        mk('p', 'P', { crate: 'C1' }),
        mk('q', 'Q', { crate: 'C1' }),
        mk('r', 'R', { crate: null }),
      ],
    });

    it('après une ancre sans ordre, dont le suivant n’en a pas non plus', async () => {
      const { data } = setup(bare());
      await moveBook({ book_id: 'r', crate: 'G1', after_book_id: 'p' });
      expect(orderOf(data, 'r')).toBe(0);
    });

    it('après le dernier livre sans ordre', async () => {
      const { data } = setup(bare());
      await moveBook({ book_id: 'r', crate: 'G1', after_book_id: 'q' });
      expect(orderOf(data, 'r')).toBe(1);
    });

    it('en tête, devant un premier livre sans ordre', async () => {
      const { data } = setup(bare());
      await moveBook({ book_id: 'r', crate: 'G1', position: 1 });
      expect(orderOf(data, 'r')).toBe(-1);
    });

    it('en tête, entre un livre précédent sans ordre et le premier de la caisse', async () => {
      const { data } = setup({
        crates: [crate('C1', 'L')],
        books: [mk('p', 'P', { crate: null }), mk('q', 'Q', { crate: 'C1' }), mk('r', 'R')],
      });
      await moveBook({ book_id: 'r', crate: 'G1', position: 1 });
      expect(orderOf(data, 'r')).toBe(0);
    });

    it('en fin de rangée quand le dernier livre n’a pas d’ordre', async () => {
      const { data } = setup({ crates: [], books: [mk('p', 'P'), mk('r', 'R')] });
      await moveBook({ book_id: 'r', crate: 'à côté', after_book_id: 'zzz' });
      expect(orderOf(data, 'r')).toBe(1);
    });
  });
});

describe('swapBooks', () => {
  it('refuse un premier livre inconnu', async () => {
    setup();
    expect(await swapBooks({ book_a: 'x', book_b: 'a' })).toEqual({
      error: 'Livre introuvable : x',
    });
  });

  it('refuse un second livre inconnu', async () => {
    setup();
    expect(await swapBooks({ book_a: 'a', book_b: 'y' })).toEqual({
      error: 'Livre introuvable : y',
    });
  });

  it('refuse deux fois le même livre', async () => {
    const { data } = setup();
    expect(await swapBooks({ book_a: 'a', book_b: 'a' })).toEqual({
      error: 'Il faut deux livres différents',
    });
    expect(data.meta).toBeUndefined();
  });

  it('échange caisse et rang de deux livres rangés', async () => {
    const { data } = setup({ ...seed(), meta: [{ _id: 'state', rev: 1 }] });
    const r = await swapBooks({ book_a: 'a', book_b: 'c' });
    expect(r).toEqual({
      ok: true,
      a: { title: 'Astérix T1', from: 'G1', to: 'P1' },
      b: { title: 'Le Petit Prince', from: 'P1', to: 'G1' },
    });
    expect(data.books!.find((b) => b.id === 'a')).toMatchObject({ crate: 'C2', order: 3 });
    expect(data.books!.find((b) => b.id === 'c')).toMatchObject({ crate: 'C1', order: 1 });
    expect(data.meta![0]!.rev).toBe(3);
  });

  it('un livre « à côté » cède sa place : l’autre perd sa caisse, et inversement', async () => {
    const { data } = setup();
    const r = await swapBooks({ book_a: 'a', book_b: 'd' });
    expect(r).toMatchObject({
      a: { from: 'G1', to: 'à côté' },
      b: { from: 'à côté', to: 'G1' },
    });
    const a = data.books!.find((b) => b.id === 'a')!;
    const d = data.books!.find((b) => b.id === 'd')!;
    expect(a).not.toHaveProperty('crate');
    expect(a.order).toBe(4);
    expect(d).toMatchObject({ crate: 'C1', order: 1 });
  });

  it('utilise 0 pour un livre sans ordre', async () => {
    const { data } = setup({
      crates: [crate('C1', 'L')],
      books: [mk('p', 'P', { crate: 'C1' }), mk('q', 'Q', { crate: null })],
    });
    await swapBooks({ book_a: 'p', book_b: 'q' });
    expect(data.books!.find((b) => b.id === 'p')!.order).toBe(0);
    expect(data.books!.find((b) => b.id === 'q')).toMatchObject({ crate: 'C1', order: 0 });
  });
});

describe('addBook', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));

  it('refuse un titre vide', async () => {
    setup();
    expect(await addBook({ title: '   ', crate: 'G1' })).toEqual({ error: 'Titre vide' });
  });

  it('refuse une caisse inconnue', async () => {
    const { data } = setup();
    expect(await addBook({ title: 'X', crate: 'Z9' })).toEqual({ error: 'Caisse inconnue : Z9' });
    expect(data.books).toHaveLength(5);
  });

  it('ajoute un livre avec les valeurs par défaut en fin de caisse', async () => {
    const { data } = setup({ ...seed(), meta: [{ _id: 'state', rev: 2 }] });
    const r = await addBook({ title: '  Nouveau  ', crate: 'g1' });
    expect(r).toEqual({ ok: true, id: 'i', title: 'Nouveau', crate: 'G1', note: undefined });
    expect(data.books).toHaveLength(6);
    expect(data.books![5]).toEqual({
      id: 'i',
      title: 'Nouveau',
      color: '#c9c3b5',
      summary: '',
      h: 2,
      d: 1.4,
      t: 0.2,
      crate: 'C1',
      order: 2.5,
    });
    expect(data.meta![0]!.rev).toBe(4);
  });

  it('enregistre les champs facultatifs, dimensions en cm arrondies au mm', async () => {
    const { data } = setup();
    await addBook({
      title: 'Complet',
      crate: 'M1',
      author: 'Moi',
      publisher: 'Éd.',
      year: 2020,
      kind: 'guide',
      summary: 'Un résumé',
      height_cm: 21.04,
      depth_cm: 14,
      thickness_cm: 2.96,
    });
    expect(data.books![5]).toMatchObject({
      author: 'Moi',
      publisher: 'Éd.',
      year: 2020,
      kind: 'guide',
      summary: 'Un résumé',
      h: 2.1,
      d: 1.4,
      t: 0.3,
    });
  });

  it('ignore un type inconnu et des dimensions nulles ou négatives', async () => {
    const { data } = setup();
    await addBook({ title: 'Bizarre', crate: 'M1', kind: 'poésie', height_cm: -5, depth_cm: 0 });
    const b = data.books![5]!;
    expect(b).not.toHaveProperty('kind');
    expect(b).toMatchObject({ h: 2, d: 1.4 });
  });

  it('place après un livre donné', async () => {
    const { data } = setup();
    await addBook({ title: 'Entre', crate: 'G1', after_book_id: 'a' });
    expect(data.books![5]!.order).toBe(1.5);
  });

  it('va « à côté » sans caisse, après le dernier livre à côté', async () => {
    const { data } = setup();
    const r = await addBook({ title: 'Pile', crate: 'À côté' });
    expect(r).toMatchObject({ ok: true, crate: 'à côté' });
    expect(data.books![5]).toMatchObject({ crate: null, order: 4.5 });
  });

  it('prévient quand un titre identique existe (sans accents ni casse)', async () => {
    const { data } = setup();
    const r = (await addBook({ title: 'elegance DU herisson', crate: 'M1' })) as { note: string };
    expect(r.note).toBe('Attention : un livre au titre identique existait déjà (e).');
    expect(data.books).toHaveLength(6);
  });
});

describe('setBookDimensions', () => {
  it('refuse un livre inconnu', async () => {
    setup();
    expect(await setBookDimensions({ book_id: 'x', height_cm: 20 })).toEqual({
      error: 'Livre introuvable : x',
    });
  });

  it('exige au moins une dimension', async () => {
    const { data } = setup();
    expect(await setBookDimensions({ book_id: 'a' })).toEqual({
      error: 'Aucune dimension donnée (height_cm, depth_cm ou thickness_mm).',
    });
    expect(data.meta).toBeUndefined();
  });

  it('convertit cm et mm en unités scène, garde les autres dimensions et incrémente la révision deux fois', async () => {
    const { data } = setup({ ...seed(), meta: [{ _id: 'state', rev: 4 }] });
    const r = (await setBookDimensions({
      book_id: 'a',
      height_cm: 28,
      depth_cm: 20.5,
      thickness_mm: 35,
    })) as Record<string, unknown>;
    expect(r).toMatchObject({
      ok: true,
      title: 'Astérix T1',
      height_cm: 28,
      depth_cm: 20.5,
      thickness_mm: 35,
    });
    const a = data.books!.find((b) => b.id === 'a')!;
    expect(a).toMatchObject({ h: 2.8, d: 2.05, t: 0.35 });
    expect(data.meta![0]!.rev).toBe(6);
  });

  it('ne change que la dimension donnée', async () => {
    const { data } = setup();
    const r = (await setBookDimensions({ book_id: 'b', thickness_mm: 12 })) as {
      height_cm: number;
      depth_cm: number;
    };
    expect(data.books!.find((b) => b.id === 'b')).toMatchObject({ h: 2, d: 1.4, t: 0.12 });
    expect(r).toMatchObject({ height_cm: 20, depth_cm: 14, thickness_mm: 12 });
  });

  it.each([
    [{ height_cm: 4 }, 'height_cm hors limites : entre 5 et 60 cm (reçu 4).'],
    [{ height_cm: 61 }, 'height_cm hors limites : entre 5 et 60 cm (reçu 61).'],
    [{ depth_cm: 2 }, 'depth_cm hors limites : entre 3 et 50 cm (reçu 2).'],
    [{ thickness_mm: 0 }, 'thickness_mm hors limites : entre 1 et 150 mm (reçu 0).'],
    [{ thickness_mm: 151 }, 'thickness_mm hors limites : entre 1 et 150 mm (reçu 151).'],
    [{ height_cm: Number.NaN }, 'height_cm hors limites : entre 5 et 60 cm (reçu NaN).'],
  ])('refuse tout si une dimension est hors limites %j', async (dims, error) => {
    const { data } = setup();
    expect(await setBookDimensions({ book_id: 'a', ...dims })).toEqual({ error });
    expect(data.books!.find((b) => b.id === 'a')).toMatchObject({ h: 2, d: 1.4, t: 0.2 });
    expect(data.meta).toBeUndefined();
  });

  it('accepte exactement les bornes', async () => {
    setup();
    expect(
      await setBookDimensions({ book_id: 'a', height_cm: 5, depth_cm: 50, thickness_mm: 1 }),
    ).toMatchObject({ ok: true, height_cm: 5, depth_cm: 50, thickness_mm: 1 });
  });
});

describe('deleteBook', () => {
  it('refuse un livre inconnu', async () => {
    setup();
    expect(await deleteBook({ book_id: 'x', confirmed: true })).toEqual({
      error: 'Livre introuvable : x',
    });
  });

  it('refuse sans confirmation explicite', async () => {
    const { data } = setup();
    for (const confirmed of [undefined, false]) {
      const r = (await deleteBook({ book_id: 'a', confirmed })) as { error: string };
      expect(r.error).toContain('Suppression non confirmée');
    }
    expect(data.books).toHaveLength(5);
    expect(data.meta).toBeUndefined();
  });

  it('supprime un livre confirmé et incrémente la révision deux fois', async () => {
    const { data } = setup({ ...seed(), meta: [{ _id: 'state', rev: 9 }] });
    expect(await deleteBook({ book_id: 'a', confirmed: true })).toEqual({
      ok: true,
      deleted: 'Astérix T1',
      was_in: 'G1',
    });
    expect(ids(data.books!)).toEqual(['b', 'c', 'd', 'e']);
    expect(data.meta![0]!.rev).toBe(11);
  });

  it('indique « à côté » pour un livre sans caisse', async () => {
    setup();
    expect(await deleteBook({ book_id: 'd', confirmed: true })).toMatchObject({ was_in: 'à côté' });
  });
});
