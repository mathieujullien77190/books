import { afterEach, describe, expect, it, vi } from 'vitest';

const load = async (env: { code?: string; secret?: string }) => {
  vi.resetModules();
  vi.stubEnv('EDIT_CODE', env.code as string);
  vi.stubEnv('EDIT_SECRET', env.secret as string);
  return import('./edit');
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('edit : code défini', () => {
  it("active l'Édition et signe un jeton hexadécimal stable", async () => {
    const e = await load({ code: 'abc', secret: 's3cret' });
    expect(e.EDIT_CODE).toBe('abc');
    expect(e.editEnabled).toBe(true);
    expect(e.signEditToken()).toMatch(/^[0-9a-f]{64}$/);
    expect(e.signEditToken()).toBe(e.signEditToken());
  });

  it('accepte son propre jeton et refuse le reste', async () => {
    const e = await load({ code: 'abc', secret: 's3cret' });
    expect(e.isEditToken(e.signEditToken())).toBe(true);
    expect(e.isEditToken('faux')).toBe(false);
    expect(e.isEditToken(42)).toBe(false);
    expect(e.isEditToken(undefined)).toBe(false);
  });

  it('EDIT_SECRET fixe la clé : le jeton ne dépend pas du code', async () => {
    const a = await load({ code: 'un', secret: 'k' });
    const ta = a.signEditToken();
    const b = await load({ code: 'deux', secret: 'k' });
    expect(b.signEditToken()).toBe(ta);
    const c = await load({ code: 'un', secret: 'autre' });
    expect(c.signEditToken()).not.toBe(ta);
  });

  it('sans EDIT_SECRET, la clé dérive du code', async () => {
    const a = await load({ code: 'un' });
    const ta = a.signEditToken();
    expect((await load({ code: 'un' })).signEditToken()).toBe(ta);
    expect((await load({ code: 'deux' })).signEditToken()).not.toBe(ta);
  });
});

describe('edit : code absent', () => {
  it("désactive l'Édition : même le jeton signé est refusé", async () => {
    const e = await load({});
    expect(e.EDIT_CODE).toBe('');
    expect(e.editEnabled).toBe(false);
    expect(e.isEditToken(e.signEditToken())).toBe(false);
  });
});

describe('sameSecret', () => {
  it('compare deux chaînes de même longueur', async () => {
    const e = await load({ code: 'x' });
    expect(e.sameSecret('abc', 'abc')).toBe(true);
    expect(e.sameSecret('abc', 'abd')).toBe(false);
  });

  it('refuse deux longueurs différentes', async () => {
    const e = await load({ code: 'x' });
    expect(e.sameSecret('abc', 'abcd')).toBe(false);
  });
});
