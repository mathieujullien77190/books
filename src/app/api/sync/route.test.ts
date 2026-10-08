import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as MongoModule from '@/lib/mongodb';
import { createFakeDb } from '@/test/fakeDb';

import { POST } from './route';

const m = vi.hoisted(() => ({
  getDb: vi.fn(),
  hasMongoConfig: vi.fn(),
  isEditToken: vi.fn(),
}));
vi.mock('@/lib/mongodb', async (orig) => ({
  ...(await orig<typeof MongoModule>()),
  getDb: m.getDb,
  hasMongoConfig: m.hasMongoConfig,
}));
vi.mock('@/lib/edit', () => ({ isEditToken: m.isEditToken }));

const post = (body: unknown) =>
  POST(
    new Request('http://x/api/sync', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const setup = (data: Parameters<typeof createFakeDb>[0] = {}) => {
  const fake = createFakeDb(data);
  m.getDb.mockResolvedValue(fake.db);
  return fake;
};

beforeEach(() => {
  vi.clearAllMocks();
  m.hasMongoConfig.mockReturnValue(true);
  m.isEditToken.mockReturnValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/sync : refus', () => {
  it('no-db sans base configurée', async () => {
    m.hasMongoConfig.mockReturnValue(false);
    const res = await post({});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: 'no-db' });
  });

  it('error sur un corps illisible', async () => {
    const res = await post('{nope');
    expect(await res.json()).toEqual({ ok: false, reason: 'error' });
    expect(console.error).toHaveBeenCalled();
  });

  it("401 locked sans jeton d'Édition valide", async () => {
    m.isEditToken.mockReturnValue(false);
    const { data } = setup({ books: [{ id: 'a' }] });
    const res = await post({ token: 'x', rev: 0, books: [] });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, reason: 'locked' });
    expect(m.isEditToken).toHaveBeenCalledWith('x');
    expect(data.books).toEqual([{ id: 'a' }]);
  });

  it.each([
    ['crates qui n’est pas un tableau', { crates: 'x' }],
    ['livre sans id', { books: [{ title: 'a' }] }],
    ['id vide', { books: [{ id: '' }] }],
    ['id non textuel', { crates: [{ id: 3 }] }],
    ['élément nul', { books: [null] }],
    ['ids dupliqués', { books: [{ id: 'a' }, { id: 'a' }] }],
    ['crates invalides, books valides', { crates: [{}], books: [{ id: 'a' }] }],
    ['crates valides, books invalides', { crates: [{ id: 'c' }], books: [{}] }],
  ])('400 invalid : %s', async (_, body) => {
    const { data } = setup({ meta: [{ _id: 'state', rev: 1 }] });
    const res = await post({ token: 't', rev: 1, ...body });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'invalid' });
    expect(data.meta).toEqual([{ _id: 'state', rev: 1 }]);
  });

  it('conflict quand la révision est périmée, sans rien écrire', async () => {
    const { data } = setup({ meta: [{ _id: 'state', rev: 5 }], books: [{ id: 'old' }] });
    const res = await post({ token: 't', rev: 4, books: [{ id: 'new' }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: 'conflict' });
    expect(data.books).toEqual([{ id: 'old' }]);
    expect(data.meta).toEqual([{ _id: 'state', rev: 5 }]);
  });

  it('error si la base lève une exception', async () => {
    m.getDb.mockRejectedValue(new Error('down'));
    const res = await post({ token: 't', rev: 0 });
    expect(await res.json()).toEqual({ ok: false, reason: 'error' });
  });
});

describe('POST /api/sync : écriture', () => {
  it('remplace caisses et livres avec leur rang et incrémente la révision', async () => {
    const { data } = setup({
      meta: [{ _id: 'state', rev: 2 }],
      crates: [{ id: 'old', order: 0 }],
      books: [{ id: 'old', order: 0 }],
    });
    const res = await post({
      token: 't',
      rev: 2,
      crates: [{ id: 'c2' }, { id: 'c1' }],
      books: [{ id: 'b1', title: 'Un' }],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rev: 3 });
    expect(data.crates).toEqual([
      { id: 'c2', order: 0 },
      { id: 'c1', order: 1 },
    ]);
    expect(data.books).toEqual([{ id: 'b1', title: 'Un', order: 0 }]);
    expect(data.meta).toEqual([{ _id: 'state', rev: 3 }]);
  });

  it('une base neuve : rev absent compte pour 0 et crée la révision 1', async () => {
    const { data } = setup();
    const res = await post({ token: 't', books: [{ id: 'a' }] });
    expect(await res.json()).toEqual({ ok: true, rev: 1 });
    expect(data.meta).toEqual([{ _id: 'state', rev: 1 }]);
    expect(data.books).toEqual([{ id: 'a', order: 0 }]);
  });

  it('ne touche que ce qui est envoyé : crates seules', async () => {
    const { data } = setup({ meta: [{ _id: 'state', rev: 1 }], books: [{ id: 'keep' }] });
    await post({ token: 't', rev: 1, crates: [{ id: 'c' }] });
    expect(data.crates).toEqual([{ id: 'c', order: 0 }]);
    expect(data.books).toEqual([{ id: 'keep' }]);
  });

  it('ne touche que ce qui est envoyé : books seuls', async () => {
    const { data } = setup({ meta: [{ _id: 'state', rev: 1 }], crates: [{ id: 'keep' }] });
    await post({ token: 't', rev: 1, books: [{ id: 'b' }] });
    expect(data.crates).toEqual([{ id: 'keep' }]);
    expect(data.books).toEqual([{ id: 'b', order: 0 }]);
  });

  it('une liste vide est valide et vide la collection', async () => {
    const { data } = setup({ meta: [{ _id: 'state', rev: 1 }], books: [{ id: 'a' }] });
    const res = await post({ token: 't', rev: 1, books: [] });
    expect(await res.json()).toEqual({ ok: true, rev: 2 });
    expect(data.books).toEqual([]);
  });

  it('enregistre le décor de la mésange', async () => {
    const { data } = setup({ meta: [{ _id: 'state', rev: 1 }] });
    await post({ token: 't', rev: 1, decor: { mesange: { dx: 1.5, dy: -2, dz: 0 } } });
    expect(data.meta).toContainEqual({ _id: 'decor', mesange: { dx: 1.5, dy: -2, dz: 0 } });
  });

  it('remplace un décor existant et neutralise les valeurs non numériques', async () => {
    const { data } = setup({
      meta: [
        { _id: 'state', rev: 1 },
        { _id: 'decor', mesange: { dx: 9, dy: 9, dz: 9 } },
      ],
    });
    await post({
      token: 't',
      rev: 1,
      // 1e999 devient Infinity au parsing
      decor: JSON.parse('{"mesange":{"dx":"3","dy":1e999,"dz":null}}'),
    });
    const decor = data.meta!.find((d) => d._id === 'decor');
    expect(decor).toEqual({ _id: 'decor', mesange: { dx: 0, dy: 0, dz: 0 } });
  });

  it('ignore un décor sans mésange', async () => {
    const { data } = setup({ meta: [{ _id: 'state', rev: 1 }] });
    await post({ token: 't', rev: 1, decor: {} });
    expect(data.meta).toEqual([{ _id: 'state', rev: 2 }]);
  });
});
