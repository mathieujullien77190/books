import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeDb } from '@/test/fakeDb';

const driver = vi.hoisted(() => ({ dbFn: vi.fn(), connect: vi.fn(), ctor: vi.fn() }));

vi.mock('mongodb', () => ({
  MongoClient: class {
    constructor(uri: string) {
      driver.ctor(uri);
    }
    connect() {
      return driver.connect().then(() => ({ db: driver.dbFn }));
    }
  },
}));

const load = () => import('./mongodb');

beforeEach(() => {
  vi.resetModules();
  driver.dbFn.mockReset().mockReturnValue('DB');
  driver.connect.mockReset().mockResolvedValue(undefined);
  driver.ctor.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('hasMongoConfig', () => {
  it('suit la présence de MONGODB_URI', async () => {
    const m = await load();
    vi.stubEnv('MONGODB_URI', '');
    expect(m.hasMongoConfig()).toBe(false);
    vi.stubEnv('MONGODB_URI', 'mongodb://h');
    expect(m.hasMongoConfig()).toBe(true);
  });
});

describe('getDb', () => {
  it('lève une erreur sans MONGODB_URI', async () => {
    vi.stubEnv('MONGODB_URI', '');
    const m = await load();
    await expect(m.getDb()).rejects.toThrow('MONGODB_URI manquant');
    expect(driver.ctor).not.toHaveBeenCalled();
  });

  it('partage la connexion et utilise la base par défaut', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://h');
    vi.stubEnv('MONGODB_DB', '');
    const m = await load();
    expect(await m.getDb()).toBe('DB');
    expect(await m.getDb()).toBe('DB');
    expect(driver.ctor).toHaveBeenCalledTimes(1);
    expect(driver.ctor).toHaveBeenCalledWith('mongodb://h');
    expect(driver.dbFn).toHaveBeenCalledWith('bibliotheque');
  });

  it('respecte MONGODB_DB', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://h');
    vi.stubEnv('MONGODB_DB', 'autre');
    const m = await load();
    await m.getDb();
    expect(driver.dbFn).toHaveBeenCalledWith('autre');
  });
});

describe('readRev', () => {
  it('lit la révision, 0 si le document manque', async () => {
    const m = await load();
    expect(await m.readRev(createFakeDb({ meta: [{ _id: 'state', rev: 7 }] }).db)).toBe(7);
    expect(await m.readRev(createFakeDb().db)).toBe(0);
  });
});

describe('claimRev', () => {
  it('crée la révision 1 depuis 0', async () => {
    const m = await load();
    const { db, data } = createFakeDb();
    expect(await m.claimRev(db, 0)).toBe(true);
    expect(data.meta).toEqual([{ _id: 'state', rev: 1 }]);
  });

  it('refuse depuis 0 si le document existe déjà', async () => {
    const m = await load();
    const { db, data } = createFakeDb({ meta: [{ _id: 'state', rev: 4 }] });
    expect(await m.claimRev(db, 0)).toBe(false);
    expect(data.meta).toEqual([{ _id: 'state', rev: 4 }]);
  });

  it('incrémente quand la révision correspond', async () => {
    const m = await load();
    const { db, data } = createFakeDb({ meta: [{ _id: 'state', rev: 4 }] });
    expect(await m.claimRev(db, 4)).toBe(true);
    expect(data.meta).toEqual([{ _id: 'state', rev: 5 }]);
  });

  it('refuse une révision périmée', async () => {
    const m = await load();
    const { db, data } = createFakeDb({ meta: [{ _id: 'state', rev: 4 }] });
    expect(await m.claimRev(db, 3)).toBe(false);
    expect(data.meta).toEqual([{ _id: 'state', rev: 4 }]);
  });
});

describe('replaceAll', () => {
  it('écrit chaque élément avec son rang et supprime le reste', async () => {
    const m = await load();
    const { db, data } = createFakeDb({
      books: [
        { id: 'a', title: 'vieux', order: 9 },
        { id: 'z', title: 'à supprimer', order: 1 },
      ],
    });
    await m.replaceAll(db.collection('books'), [
      { id: 'b', title: 'B' },
      { id: 'a', title: 'A' },
    ]);
    expect(data.books).toEqual([
      { id: 'a', title: 'A', order: 1 },
      { id: 'b', title: 'B', order: 0 },
    ]);
  });

  it('une liste vide supprime tout', async () => {
    const m = await load();
    const { db, data } = createFakeDb({ books: [{ id: 'a' }] });
    await m.replaceAll(db.collection('books'), []);
    expect(data.books).toEqual([]);
  });

  it('envoie un seul lot ordonné', async () => {
    const m = await load();
    const bulkWrite = vi.fn();
    await m.replaceAll({ bulkWrite } as never, [{ id: 'a' }]);
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    expect(bulkWrite.mock.calls[0]![1]).toEqual({ ordered: true });
  });
});
