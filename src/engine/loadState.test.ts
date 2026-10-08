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
    // tant que le premier rendu n'est pas fait, l'indicateur reste
    expect(load.pending).toBe(true);
    expect(host.emit).not.toHaveBeenCalled();
    done();
    expect(load.pending).toBe(false);
    expect(host.emit).toHaveBeenCalledTimes(1);
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
    expect(host.emit).toHaveBeenCalledTimes(2);
    expect(host.shown).toHaveBeenCalledTimes(1);
  });
});
