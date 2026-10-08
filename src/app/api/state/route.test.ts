import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as MongoModule from '@/lib/mongodb';
import { createFakeDb } from '@/test/fakeDb';

import { GET } from './route';

const m = vi.hoisted(() => ({ getDb: vi.fn(), hasMongoConfig: vi.fn() }));
vi.mock('@/lib/mongodb', async (orig) => ({
  ...(await orig<typeof MongoModule>()),
  getDb: m.getDb,
  hasMongoConfig: m.hasMongoConfig,
}));

beforeEach(() => {
  vi.clearAllMocks();
  m.hasMongoConfig.mockReturnValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/state', () => {
  it('répond no-db sans base configurée', async () => {
    m.hasMongoConfig.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: 'no-db' });
    expect(m.getDb).not.toHaveBeenCalled();
  });

  it('renvoie révision, caisses et livres triés, sans _id ni order, et le décor', async () => {
    const { db } = createFakeDb({
      meta: [
        { _id: 'state', rev: 4 },
        { _id: 'decor', mesange: { dx: 1, dy: 2, dz: 3 } },
      ],
      crates: [
        { _id: 'x2', id: 'c2', size: 'M', order: 1 },
        { _id: 'x1', id: 'c1', size: 'L', order: 0 },
      ],
      books: [
        { _id: 'y2', id: 'b2', title: 'Deux', order: 1 },
        { _id: 'y1', id: 'b1', title: 'Un', order: 0 },
      ],
    });
    m.getDb.mockResolvedValue(db);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      rev: 4,
      crates: [
        { id: 'c1', size: 'L' },
        { id: 'c2', size: 'M' },
      ],
      books: [
        { id: 'b1', title: 'Un' },
        { id: 'b2', title: 'Deux' },
      ],
      decor: { mesange: { dx: 1, dy: 2, dz: 3 } },
    });
  });

  it('base vide : révision 0, listes vides, pas de décor', async () => {
    m.getDb.mockResolvedValue(createFakeDb().db);
    const body = await (await GET()).json();
    expect(body).toEqual({ ok: true, rev: 0, crates: [], books: [], decor: null });
  });

  it('répond error si la base lève une exception', async () => {
    m.getDb.mockRejectedValue(new Error('down'));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: 'error' });
    expect(console.error).toHaveBeenCalled();
  });
});
