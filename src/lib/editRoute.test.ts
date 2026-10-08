import { beforeEach, describe, expect, it, vi } from 'vitest';

import { editRoute } from './editRoute';

const mocks = vi.hoisted(() => ({ isEditToken: vi.fn(), hasMongoConfig: vi.fn() }));
vi.mock('@/lib/edit', () => ({ isEditToken: mocks.isEditToken }));
vi.mock('@/lib/mongodb', () => ({ hasMongoConfig: mocks.hasMongoConfig }));

const post = (body: string) => new Request('http://x/api', { method: 'POST', body });
const handle = vi.fn();
const route = editRoute(handle);

beforeEach(() => {
  handle.mockReset();
  mocks.isEditToken.mockReturnValue(true);
  mocks.hasMongoConfig.mockReturnValue(true);
});

describe('editRoute', () => {
  it("400 sur un corps qui n'est pas du JSON", async () => {
    const res = await route(post('pas du json'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'invalid' });
    expect(handle).not.toHaveBeenCalled();
  });

  it("401 sans jeton d'Édition valide", async () => {
    mocks.isEditToken.mockReturnValue(false);
    const res = await route(post(JSON.stringify({ token: 'x' })));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, reason: 'locked' });
    expect(mocks.isEditToken).toHaveBeenCalledWith('x');
    expect(handle).not.toHaveBeenCalled();
  });

  it('503 sans base configurée', async () => {
    mocks.hasMongoConfig.mockReturnValue(false);
    const res = await route(post('{}'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: 'no-db' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('400 quand handle juge les champs invalides', async () => {
    handle.mockResolvedValue(null);
    const res = await route(post('{}'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'invalid' });
  });

  it('200 avec le résultat de handle quand ok', async () => {
    handle.mockResolvedValue({ ok: true, title: 'T' });
    const res = await route(post(JSON.stringify({ a: 1 })));
    expect(handle).toHaveBeenCalledWith({ a: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, title: 'T' });
  });

  it('404 avec la raison quand handle renvoie une erreur', async () => {
    handle.mockResolvedValue({ error: 'Livre introuvable : z' });
    const res = await route(post('{}'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, reason: 'Livre introuvable : z' });
  });
});
