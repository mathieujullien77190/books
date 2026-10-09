import { describe, expect, it, vi } from 'vitest';

import { LoadState, type LoadStateHost } from './loadState';
import type { Stage } from './stage';

const setup = (disposed = false) => {
  const warmUp = vi.fn((_isDisposed: () => boolean, done: () => void) => done());
  const host: LoadStateHost = {
    stage: { warmUp } as unknown as Stage,
    isDisposed: () => disposed,
    emit: vi.fn(),
    shown: vi.fn(),
  };
  return { host, warmUp, load: new LoadState(host) };
};

describe('LoadState', () => {
  it('démarre en chargement, sans erreur', () => {
    const { load } = setup();
    expect(load.pending).toBe(true);
    expect(load.failed).toBe(false);
  });

  it("au premier chargement, réchauffe la scène avant de retirer l'indicateur", () => {
    const { host, warmUp, load } = setup();
    let done: () => void = () => {};
    warmUp.mockImplementation((_d, cb) => {
      done = cb;
    });
    load.end();
    expect(warmUp).toHaveBeenCalledTimes(1);
    // tant que le premier rendu n'est pas fait, l'indicateur reste, avec son étape
    expect(load.pending).toBe(true);
    expect(load.progress).toEqual({
      label: "Préparation de l'affichage 3D (shaders, textures)…",
      value: 0.85,
    });
    expect(host.emit).toHaveBeenCalledTimes(1);
    done();
    expect(load.pending).toBe(false);
    expect(load.progress).toBeNull();
    expect(host.emit).toHaveBeenCalledTimes(2);
    expect(host.shown).toHaveBeenCalledTimes(1);
  });

  it('transmet au stage le test de destruction du moteur', () => {
    const { warmUp, load } = setup(true);
    load.end();
    expect(warmUp.mock.calls[0]![0]()).toBe(true);
  });

  it("aux chargements suivants, retire l'indicateur sans réchauffer ni repasser en complet", () => {
    const { host, warmUp, load } = setup();
    load.end();
    load.pending = true;
    load.end();
    expect(warmUp).toHaveBeenCalledTimes(1);
    expect(load.pending).toBe(false);
    expect(host.emit).toHaveBeenCalledTimes(3);
    expect(host.shown).toHaveBeenCalledTimes(1);
  });

  it('affiche la lecture de la base au départ et suit les étapes', () => {
    const { host, load } = setup();
    expect(load.progress).toEqual({ label: 'Lecture de la base de données…', value: 0.1 });
    load.step('Construction des caisses et des livres…', 0.45);
    expect(load.progress).toEqual({
      label: 'Construction des caisses et des livres…',
      value: 0.45,
    });
    expect(host.emit).toHaveBeenCalledTimes(1);
  });

  it('ignore une étape quand le chargement est fini (rechargement de la base)', () => {
    const { host, load } = setup();
    load.end();
    const before = (host.emit as ReturnType<typeof vi.fn>).mock.calls.length;
    load.step('Lecture de la base de données…', 0.1);
    expect(load.progress).toBeNull();
    expect(host.emit).toHaveBeenCalledTimes(before);
  });
});
