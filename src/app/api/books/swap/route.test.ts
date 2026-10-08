import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const m = vi.hoisted(() => ({
  isEditToken: vi.fn(),
  hasMongoConfig: vi.fn(),
  swapBooks: vi.fn(),
}));
vi.mock('@/lib/edit', () => ({ isEditToken: m.isEditToken }));
vi.mock('@/lib/mongodb', () => ({ hasMongoConfig: m.hasMongoConfig }));
vi.mock('@/lib/library', () => ({ swapBooks: m.swapBooks }));

const json = (o: unknown) =>
  POST(new Request('http://x/api/books/swap', { method: 'POST', body: JSON.stringify(o) }));

beforeEach(() => {
  vi.clearAllMocks();
  m.isEditToken.mockReturnValue(true);
  m.hasMongoConfig.mockReturnValue(true);
  m.swapBooks.mockResolvedValue({ ok: true });
});

describe('POST /api/books/swap', () => {
  it('401 sans jeton valide', async () => {
    m.isEditToken.mockReturnValue(false);
    const res = await json({ token: 'x', book_a: 'a', book_b: 'b' });
    expect(res.status).toBe(401);
    expect(m.swapBooks).not.toHaveBeenCalled();
  });

  it('400 quand un identifiant manque ou n’est pas du texte', async () => {
    for (const body of [{ book_a: 'a' }, { book_b: 'b' }, { book_a: 'a', book_b: 2 }]) {
      const res = await json({ token: 't', ...body });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(m.swapBooks).not.toHaveBeenCalled();
  });

  it('échange deux livres', async () => {
    const res = await json({ token: 't', book_a: 'a', book_b: 'b' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(m.swapBooks).toHaveBeenCalledWith({ book_a: 'a', book_b: 'b' });
  });

  it('404 avec la raison quand l’échange échoue', async () => {
    m.swapBooks.mockResolvedValue({ error: 'Livre introuvable : b' });
    const res = await json({ token: 't', book_a: 'a', book_b: 'b' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, reason: 'Livre introuvable : b' });
  });
});
