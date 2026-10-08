import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeDb } from '@/test/fakeDb';

import { clearFails, clientKey, isBlocked, recordFail } from './attempts';

const mongo = vi.hoisted(() => ({ getDb: vi.fn(), hasMongoConfig: vi.fn() }));
vi.mock('@/lib/mongodb', () => mongo);

const WINDOW = 15 * 60 * 1000;
const fail = async (key: string, n: number) => {
  for (let i = 0; i < n; i++) await recordFail(key);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  mongo.getDb.mockReset();
  mongo.hasMongoConfig.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('clientKey', () => {
  const req = (h?: string) =>
    new Request('http://x/', { headers: h === undefined ? {} : { 'x-forwarded-for': h } });

  it('prend le premier maillon de x-forwarded-for', () => {
    expect(clientKey(req('1.2.3.4, 5.6.7.8'))).toBe('1.2.3.4');
  });

  it('retombe sur « inconnue » sans en-tête ou avec un en-tête vide', () => {
    expect(clientKey(req())).toBe('inconnue');
    expect(clientKey(req(''))).toBe('inconnue');
    expect(clientKey(req(' , 1.1.1.1'))).toBe('inconnue');
  });
});

describe('sans base (compteur en mémoire)', () => {
  beforeEach(() => mongo.hasMongoConfig.mockReturnValue(false));

  it('bloque après 8 essais ratés', async () => {
    await fail('m1', 7);
    expect(await isBlocked('m1')).toBe(false);
    await recordFail('m1');
    expect(await isBlocked('m1')).toBe(true);
    expect(await isBlocked('autre')).toBe(false);
  });

  it('libère après la fenêtre de 15 minutes et repart de zéro', async () => {
    await fail('m2', 8);
    vi.setSystemTime(1_000_000 + WINDOW - 1);
    expect(await isBlocked('m2')).toBe(true);
    vi.setSystemTime(1_000_000 + WINDOW);
    expect(await isBlocked('m2')).toBe(false);
    await recordFail('m2');
    expect(await isBlocked('m2')).toBe(false);
    await fail('m2', 7);
    expect(await isBlocked('m2')).toBe(true);
  });

  it('la fenêtre court depuis le premier échec, pas le dernier', async () => {
    await recordFail('m3');
    vi.setSystemTime(1_000_000 + WINDOW - 10);
    await fail('m3', 7);
    expect(await isBlocked('m3')).toBe(true);
    vi.setSystemTime(1_000_000 + WINDOW + 1);
    expect(await isBlocked('m3')).toBe(false);
  });

  it('clearFails efface les essais', async () => {
    await fail('m4', 8);
    await clearFails('m4');
    expect(await isBlocked('m4')).toBe(false);
    expect(mongo.getDb).not.toHaveBeenCalled();
  });
});

describe('avec base', () => {
  beforeEach(() => mongo.hasMongoConfig.mockReturnValue(true));

  it('recordFail crée puis incrémente le document', async () => {
    const { db, data } = createFakeDb();
    mongo.getDb.mockResolvedValue(db);
    await recordFail('ip');
    expect(data.edit_attempts).toEqual([{ _id: 'ip', n: 1, since: 1_000_000 }]);
    vi.setSystemTime(1_000_500);
    await recordFail('ip');
    expect(data.edit_attempts).toEqual([{ _id: 'ip', n: 2, since: 1_000_000 }]);
  });

  it('recordFail repart de 1 si le document est périmé', async () => {
    const { db, data } = createFakeDb({ edit_attempts: [{ _id: 'ip', n: 5, since: 1 }] });
    mongo.getDb.mockResolvedValue(db);
    await recordFail('ip');
    expect(data.edit_attempts).toEqual([{ _id: 'ip', n: 1, since: 1_000_000 }]);
  });

  it('isBlocked lit le compteur de la base', async () => {
    const { db } = createFakeDb({
      edit_attempts: [
        { _id: 'plein', n: 8, since: 1_000_000 },
        { _id: 'peu', n: 3, since: 1_000_000 },
        { _id: 'vieux', n: 9, since: 1 },
      ],
    });
    mongo.getDb.mockResolvedValue(db);
    expect(await isBlocked('plein')).toBe(true);
    expect(await isBlocked('peu')).toBe(false);
    expect(await isBlocked('vieux')).toBe(false);
    expect(await isBlocked('absent')).toBe(false);
  });

  it('clearFails supprime le document', async () => {
    const { db, data } = createFakeDb({ edit_attempts: [{ _id: 'ip', n: 8, since: 1_000_000 }] });
    mongo.getDb.mockResolvedValue(db);
    await clearFails('ip');
    expect(data.edit_attempts).toEqual([]);
  });

  it('base injoignable : ne bloque pas et ne lève rien', async () => {
    mongo.getDb.mockRejectedValue(new Error('down'));
    expect(await isBlocked('ip')).toBe(false);
    await expect(recordFail('ip')).resolves.toBeUndefined();
    await expect(clearFails('ip')).resolves.toBeUndefined();
    expect(mongo.getDb).toHaveBeenCalledTimes(3);
  });
});
