import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EDIT_TOKEN_KEY, STORE_KEY } from '@/constants';
import { stubLocalStorage, stubWindow } from '@/test/browser';
import { makeBook, makeCrate } from '@/test/fixtures';
import type { DecorState, SavedState } from '@/types';

import { SYNC_DELAY } from './constants';
import {
  Persistence,
  readEditToken,
  type PersistedState,
  type PersistenceHost,
} from './persistence';

type Reply = { ok: boolean; rev?: number; reason?: string; [k: string]: unknown };

const zeroDecor: DecorState = { mesange: { dx: 0, dy: 0, dz: 0 } };

let ls: ReturnType<typeof stubLocalStorage>;
let fetchMock: ReturnType<typeof vi.fn>;
let replies: Reply[] = [];

const reply = (data: Reply): Response => ({ json: async () => data }) as unknown as Response;

/** Hôte factice : `current` joue l'état du moteur (que `load` remplace). */
const makeHost = (over: Partial<PersistenceHost> = {}) => {
  const current: PersistedState = { crates: [], books: [], decor: zeroDecor };
  const host: PersistenceHost = {
    isDisposed: () => false,
    getState: () => current,
    load: vi.fn((s: SavedState, d: DecorState) => {
      current.crates = s.crates;
      current.books = s.books;
      current.decor = d;
    }),
    progress: vi.fn(),
    failed: vi.fn(),
    loaded: vi.fn(),
    endLoading: vi.fn(),
    ...over,
  };
  return { host, current, p: new Persistence(host) };
};

const bodyOf = (call: number) =>
  JSON.parse((fetchMock.mock.calls[call]![1] as { body: string }).body);

beforeEach(() => {
  vi.useFakeTimers();
  stubWindow();
  ls = stubLocalStorage();
  replies = [];
  fetchMock = vi.fn(async () => {
    const r = replies.shift();
    if (!r) throw new Error('réseau coupé');
    return reply(r);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    cb(0);
    return 1;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('readEditToken', () => {
  it('lit le jeton gardé dans le navigateur', () => {
    expect(readEditToken()).toBeNull();
    ls.setItem(EDIT_TOKEN_KEY, 'jeton');
    expect(readEditToken()).toBe('jeton');
  });

  it('renvoie null si le stockage est indisponible', () => {
    stubLocalStorage(true);
    expect(readEditToken()).toBeNull();
  });
});

describe('Persistence.hydrate', () => {
  it("charge l'état de la base, retient la révision et ne renvoie rien", async () => {
    const crate = makeCrate({ id: 'a' });
    const book = makeBook({ crate: 'a' });
    replies.push({
      ok: true,
      rev: 7,
      crates: [crate],
      books: [book],
      decor: { mesange: { dx: 0.1, dy: 0.2, dz: 0.3 } },
    });
    const { host, p } = makeHost();
    await p.hydrate();
    expect(fetchMock).toHaveBeenCalledWith('/api/state', { cache: 'no-store' });
    expect(host.load).toHaveBeenCalledWith(
      { crates: [crate], books: [book], messy: false },
      { mesange: { dx: 0.1, dy: 0.2, dz: 0.3 } },
    );
    expect(p.hydrated).toBe(true);
    expect(host.loaded).toHaveBeenCalledWith(true);
    expect(host.endLoading).toHaveBeenCalledTimes(1);
    // les étapes du chargement sont annoncées dans l'ordre
    expect(host.progress).toHaveBeenNthCalledWith(1, 'Lecture de la base de données…', 0.1);
    expect(host.progress).toHaveBeenNthCalledWith(
      2,
      'Construction des caisses et des livres…',
      0.45,
    );
    // état identique à celui lu : aucun envoi
    await p.push();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('complète les livres et le décor absents de la réponse', async () => {
    replies.push({ ok: true, crates: [makeCrate()] });
    const { host, p } = makeHost();
    await p.hydrate();
    expect(host.load).toHaveBeenCalledWith(
      { crates: [expect.anything()], books: [], messy: false },
      zeroDecor,
    );
  });

  it('attend deux images avant le gros travail au premier chargement seulement', async () => {
    const raf = vi.fn((cb: (t: number) => void) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', raf);
    replies.push({ ok: true, crates: [makeCrate()] }, { ok: true, crates: [makeCrate()] });
    const { p } = makeHost();
    await p.hydrate(true);
    expect(raf).toHaveBeenCalledTimes(2);
    await p.hydrate(false);
    expect(raf).toHaveBeenCalledTimes(2);
  });

  it('signale l’échec quand la base répond en erreur, sans rien charger', async () => {
    replies.push({ ok: false });
    const { host, p } = makeHost();
    await p.hydrate();
    expect(host.failed).toHaveBeenCalledTimes(1);
    expect(host.endLoading).toHaveBeenCalledTimes(1);
    expect(host.load).not.toHaveBeenCalled();
    expect(p.hydrated).toBe(false);
  });

  it("signale l'échec quand la base est injoignable, et n'envoie jamais rien ensuite", async () => {
    const { host, p } = makeHost();
    await p.hydrate();
    expect(host.failed).toHaveBeenCalledTimes(1);
    expect(host.endLoading).toHaveBeenCalledTimes(1);
    p.save();
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ne fait rien si le moteur est détruit pendant la lecture', async () => {
    replies.push({ ok: true, crates: [makeCrate()] });
    const { host, p } = makeHost({ isDisposed: () => true });
    await p.hydrate();
    expect(host.load).not.toHaveBeenCalled();
    expect(host.endLoading).not.toHaveBeenCalled();
    expect(host.failed).not.toHaveBeenCalled();
  });

  it("ne charge pas si le moteur est détruit pendant l'attente des images", async () => {
    replies.push({ ok: true, crates: [makeCrate()] });
    let disposed = false;
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      disposed = true;
      cb(0);
      return 1;
    });
    const { host, p } = makeHost({ isDisposed: () => disposed });
    await p.hydrate();
    expect(host.load).not.toHaveBeenCalled();
    expect(host.endLoading).not.toHaveBeenCalled();
  });

  it("base vide : migre la sauvegarde localStorage, l'envoie puis l'efface", async () => {
    const legacy = {
      crates: [makeCrate({ id: 'old' })],
      books: [makeBook({ id: 'ob', crate: 'old' })],
      messy: false,
    };
    ls.setItem(STORE_KEY, JSON.stringify(legacy));
    replies.push({ ok: true, rev: 3, crates: [] }, { ok: true, rev: 4 });
    const { host, p } = makeHost();
    await p.hydrate();
    expect(host.load).toHaveBeenCalledWith(
      expect.objectContaining({ crates: [expect.objectContaining({ id: 'old' })] }),
      zeroDecor,
    );
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/sync');
    expect(bodyOf(1).rev).toBe(3);
    expect(bodyOf(1).crates[0].id).toBe('old');
    expect(ls.data.has(STORE_KEY)).toBe(false);
    expect(host.loaded).toHaveBeenCalledWith(true);
  });

  it('base vide et envoi refusé : garde la sauvegarde localStorage', async () => {
    ls.setItem(STORE_KEY, JSON.stringify({ crates: [makeCrate()], books: [], messy: false }));
    replies.push({ ok: true, crates: [] }, { ok: false, reason: 'erreur' });
    const { p } = makeHost();
    await p.hydrate();
    expect(ls.data.has(STORE_KEY)).toBe(true);
    expect(p.hydrated).toBe(true);
  });

  it('base vide sans sauvegarde : propose les caisses par défaut', async () => {
    replies.push({ ok: true, crates: [] }, { ok: true, rev: 1 });
    const { host, p } = makeHost();
    await p.hydrate();
    const state = (host.load as ReturnType<typeof vi.fn>).mock.calls[0]![0] as SavedState;
    expect(state.crates).toHaveLength(6);
    expect(state.books).toEqual([]);
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/sync');
  });
});

describe('Persistence.push', () => {
  const hydrated = async (rev = 5) => {
    replies.push({ ok: true, rev, crates: [makeCrate({ id: 'a' })] });
    const h = makeHost();
    await h.p.hydrate();
    fetchMock.mockClear();
    return h;
  };

  it("envoie l'état modifié avec la révision et le jeton d'Édition", async () => {
    const { current, p } = await hydrated(5);
    ls.setItem(EDIT_TOKEN_KEY, 'tok');
    current.crates = [makeCrate({ id: 'a', x: 9 })];
    replies.push({ ok: true, rev: 6 });
    await expect(p.push()).resolves.toBe(true);
    const init = fetchMock.mock.calls[0]![1] as { method: string; headers: unknown };
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(bodyOf(0)).toMatchObject({ rev: 5, token: 'tok' });
    expect(bodyOf(0).crates[0].x).toBe(9);
    // le même état n'est pas renvoyé
    await p.push();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // la révision rendue est reprise pour l'envoi suivant
    current.books = [makeBook()];
    replies.push({ ok: true, rev: 7 });
    await p.push();
    expect(bodyOf(1).rev).toBe(6);
  });

  it("incrémente la révision locale si la réponse n'en donne pas", async () => {
    const { current, p } = await hydrated(5);
    current.books = [makeBook({ id: 'x' })];
    replies.push({ ok: true });
    await p.push();
    current.books = [makeBook({ id: 'y' })];
    replies.push({ ok: true });
    await p.push();
    expect(bodyOf(1).rev).toBe(6);
  });

  it("envoie un jeton nul sans jeton d'Édition", async () => {
    const { current, p } = await hydrated();
    current.books = [makeBook()];
    replies.push({ ok: true, rev: 6 });
    await p.push();
    expect(bodyOf(0).token).toBeNull();
  });

  it("recharge l'état de la base quand la révision est périmée", async () => {
    const { host, current, p } = await hydrated();
    current.books = [makeBook()];
    replies.push(
      { ok: false, reason: 'conflict' },
      { ok: true, rev: 9, crates: [makeCrate({ id: 'z' })] },
    );
    await expect(p.push()).resolves.toBe(false);
    await vi.waitFor(() => expect(host.loaded).toHaveBeenLastCalledWith(false));
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/state');
  });

  it('renvoie false sans recharger pour un autre refus', async () => {
    const { host, current, p } = await hydrated();
    current.books = [makeBook()];
    replies.push({ ok: false, reason: 'locked' });
    await expect(p.push()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(host.loaded).toHaveBeenCalledTimes(1);
  });

  it('renvoie false si le réseau est coupé', async () => {
    const { current, p } = await hydrated();
    current.books = [makeBook()];
    await expect(p.push()).resolves.toBe(false);
  });
});

describe('Persistence.save', () => {
  it("ne planifie rien tant que la base n'est pas lue", () => {
    const { p } = makeHost();
    p.save();
    vi.advanceTimersByTime(SYNC_DELAY * 2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('débat les envois : un seul après le délai, avec le dernier état', async () => {
    replies.push({ ok: true, rev: 1, crates: [makeCrate()] });
    const { current, p } = makeHost();
    await p.hydrate();
    fetchMock.mockClear();
    current.books = [makeBook({ title: 'un' })];
    p.save();
    vi.advanceTimersByTime(SYNC_DELAY - 100);
    current.books = [makeBook({ title: 'deux' })];
    p.save();
    vi.advanceTimersByTime(SYNC_DELAY - 100);
    expect(fetchMock).not.toHaveBeenCalled();
    replies.push({ ok: true, rev: 2 });
    vi.advanceTimersByTime(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(0).books[0].title).toBe('deux');
  });
});
