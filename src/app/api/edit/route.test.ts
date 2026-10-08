import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const m = vi.hoisted(() => ({
  state: { enabled: true },
  clearFails: vi.fn(),
  isBlocked: vi.fn(),
  recordFail: vi.fn(),
  isEditToken: vi.fn(),
}));
vi.mock('@/lib/attempts', () => ({
  clearFails: m.clearFails,
  isBlocked: m.isBlocked,
  recordFail: m.recordFail,
  clientKey: (r: Request) => r.headers.get('x-forwarded-for') ?? 'inconnue',
}));
vi.mock('@/lib/edit', () => ({
  EDIT_CODE: 'sésame',
  get editEnabled() {
    return m.state.enabled;
  },
  isEditToken: m.isEditToken,
  sameSecret: (a: string, b: string) => a === b,
  signEditToken: () => 'JETON',
}));

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://x/api/edit', {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  m.state.enabled = true;
  m.isBlocked.mockResolvedValue(false);
  m.isEditToken.mockReturnValue(false);
});

describe('POST /api/edit', () => {
  it('400 sur un corps illisible', async () => {
    const res = await post('{nope');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false });
  });

  it('503 disabled quand aucun EDIT_CODE n’est défini', async () => {
    m.state.enabled = false;
    const res = await post({ code: 'sésame' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: 'disabled' });
    expect(m.isBlocked).not.toHaveBeenCalled();
  });

  it('429 too-many quand l’adresse est bloquée, même avec le bon code', async () => {
    m.isBlocked.mockResolvedValue(true);
    const res = await post({ code: 'sésame' }, { 'x-forwarded-for': '9.9.9.9' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, reason: 'too-many' });
    expect(m.isBlocked).toHaveBeenCalledWith('9.9.9.9');
    expect(m.clearFails).not.toHaveBeenCalled();
  });

  it('401 et essai compté avec un mauvais code', async () => {
    const res = await post({ code: 'faux' }, { 'x-forwarded-for': '1.1.1.1' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false });
    expect(m.recordFail).toHaveBeenCalledWith('1.1.1.1');
    expect(m.clearFails).not.toHaveBeenCalled();
  });

  it('renvoie un jeton et efface les essais avec le bon code', async () => {
    const res = await post({ code: 'sésame' }, { 'x-forwarded-for': '2.2.2.2' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, token: 'JETON' });
    expect(m.clearFails).toHaveBeenCalledWith('2.2.2.2');
    expect(m.recordFail).not.toHaveBeenCalled();
  });

  it('un code non textuel est traité comme un jeton (donc refusé ici)', async () => {
    const res = await post({ code: 12 });
    expect(res.status).toBe(401);
    expect(m.recordFail).not.toHaveBeenCalled();
  });

  it('confirme un jeton valide', async () => {
    m.isEditToken.mockReturnValue(true);
    const res = await post({ token: 'JETON' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(m.isEditToken).toHaveBeenCalledWith('JETON');
  });

  it('401 pour un jeton périmé ou un corps sans code ni jeton', async () => {
    for (const body of [{ token: 'vieux' }, {}]) {
      const res = await post(body);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ ok: false });
    }
  });
});
