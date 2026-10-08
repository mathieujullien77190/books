import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const m = vi.hoisted(() => ({
  isEditToken: vi.fn(),
  hasMongoConfig: vi.fn(),
  moveBook: vi.fn(),
}));
vi.mock('@/lib/edit', () => ({ isEditToken: m.isEditToken }));
vi.mock('@/lib/mongodb', () => ({ hasMongoConfig: m.hasMongoConfig }));
vi.mock('@/lib/library', () => ({ moveBook: m.moveBook }));

const post = (body: string) =>
  POST(new Request('http://x/api/books/move', { method: 'POST', body }));
const json = (o: unknown) => post(JSON.stringify(o));

beforeEach(() => {
  vi.clearAllMocks();
  m.isEditToken.mockReturnValue(true);
  m.hasMongoConfig.mockReturnValue(true);
  m.moveBook.mockResolvedValue({ ok: true, title: 'T', from: 'P1', to: 'G1' });
});

describe('POST /api/books/move', () => {
  it('401 sans jeton valide', async () => {
    m.isEditToken.mockReturnValue(false);
    const res = await json({ token: 'x', book_id: 'a', crate: 'G1' });
    expect(res.status).toBe(401);
    expect(m.moveBook).not.toHaveBeenCalled();
  });

  it('400 quand book_id ou crate manque ou n’est pas du texte', async () => {
    for (const body of [{ crate: 'G1' }, { book_id: 'a' }, { book_id: 1, crate: 'G1' }]) {
      const res = await json({ token: 't', ...body });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(m.moveBook).not.toHaveBeenCalled();
  });

  it('déplace un livre en fin de rangée', async () => {
    const res = await json({ token: 't', book_id: 'a', crate: 'G1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, title: 'T', from: 'P1', to: 'G1' });
    expect(m.moveBook).toHaveBeenCalledWith({
      book_id: 'a',
      crate: 'G1',
      position: undefined,
      after_book_id: undefined,
    });
  });

  it('transmet position et after_book_id valides', async () => {
    await json({ token: 't', book_id: 'a', crate: 'G1', position: 3, after_book_id: 'b' });
    expect(m.moveBook).toHaveBeenCalledWith({
      book_id: 'a',
      crate: 'G1',
      position: 3,
      after_book_id: 'b',
    });
  });

  it('ignore une position non numérique ou infinie et un after_book_id non textuel', async () => {
    await json({ token: 't', book_id: 'a', crate: 'G1', position: '3', after_book_id: 7 });
    await post('{"token":"t","book_id":"a","crate":"G1","position":1e999}');
    for (const [args] of m.moveBook.mock.calls)
      expect(args).toMatchObject({ position: undefined, after_book_id: undefined });
    expect(m.moveBook).toHaveBeenCalledTimes(2);
  });

  it('404 avec la raison quand le déplacement échoue', async () => {
    m.moveBook.mockResolvedValue({ error: 'Caisse inconnue : Z9' });
    const res = await json({ token: 't', book_id: 'a', crate: 'Z9' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, reason: 'Caisse inconnue : Z9' });
  });
});
