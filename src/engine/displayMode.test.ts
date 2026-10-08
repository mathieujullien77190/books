import type * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubLocalStorage, stubWindow } from '@/test/browser';
import { makeBook } from '@/test/fixtures';
import type { Id } from '@/types';

import type { BookRig } from './books';
import { LITE_KEY, OPEN_BOOK_SCALE } from './constants';
import type { CrateRig } from './crate';
import { DisplayMode, type DisplayHost } from './displayMode';
import { Domain } from './domain';
import type { MissingPile } from './missingPile';

const books = vi.hoisted(() => ({
  applyLiteMode: vi.fn(),
  setBookResolution: vi.fn(),
  setLiteBooks: vi.fn(),
}));
vi.mock('./books', () => books);

let ls: ReturnType<typeof stubLocalStorage>;
let domain: Domain;
let bookRigs: Map<Id, BookRig>;
let crateRigs: Map<Id, CrateRig>;
let sun: { castShadow: boolean };
let open: Id | null;
let transparent: boolean;
let disposed: boolean;
let host: DisplayHost & {
  missing: { invalidate: ReturnType<typeof vi.fn> };
  touch: ReturnType<typeof vi.fn>;
  syncGhosts: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
};

const build = (): DisplayMode => {
  host = {
    isDisposed: () => disposed,
    transparent,
    aniso: 4,
    sun: sun as unknown as THREE.DirectionalLight,
    missing: { invalidate: vi.fn() } as unknown as MissingPile & {
      invalidate: ReturnType<typeof vi.fn>;
    },
    crateRigs,
    bookRigs,
    domain,
    openId: () => open,
    touch: vi.fn(),
    syncGhosts: vi.fn(),
    refresh: vi.fn(),
    emit: vi.fn(),
  } as typeof host;
  return new DisplayMode(host);
};

const addBooks = (n: number): void => {
  for (let i = 0; i < n; i++) {
    const b = makeBook({ id: `b${i}` });
    domain.books.push(b);
    bookRigs.set(b.id, { id: b.id } as BookRig);
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  stubWindow();
  ls = stubLocalStorage();
  Object.values(books).forEach((f) => f.mockReset());
  domain = new Domain();
  bookRigs = new Map();
  crateRigs = new Map([
    ['c1', { group: { visible: true } } as unknown as CrateRig],
    ['c2', { group: { visible: true } } as unknown as CrateRig],
  ]);
  sun = { castShadow: false };
  open = null;
  transparent = false;
  disposed = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const crateVisibility = (): boolean[] => [...crateRigs.values()].map((r) => r.group.visible);

describe('DisplayMode : démarrage', () => {
  it('commence en léger avec les livres en pavés, quel que soit le choix gardé', () => {
    const d = build();
    expect(d.lite).toBe(true);
    expect(d.choice).toBe(false);
    expect(books.setLiteBooks).toHaveBeenCalledWith(true);
  });

  it('relit le choix de la personne', () => {
    ls.setItem(LITE_KEY, '1');
    expect(build().choice).toBe(true);
    ls.setItem(LITE_KEY, '0');
    expect(build().choice).toBe(false);
  });

  it('retombe sur le complet si le stockage est indisponible', () => {
    stubLocalStorage(true);
    expect(build().choice).toBe(false);
  });
});

describe('DisplayMode.set', () => {
  it('garde le choix, passe en complet et restaure caisses et ombres', () => {
    const d = build();
    addBooks(2);
    d.set(false);
    expect(ls.getItem(LITE_KEY)).toBe('0');
    expect(d.choice).toBe(false);
    expect(d.lite).toBe(false);
    expect(books.setLiteBooks).toHaveBeenLastCalledWith(false);
    expect(sun.castShadow).toBe(true);
    expect(crateVisibility()).toEqual([true, true]);
    expect(books.applyLiteMode).toHaveBeenCalledTimes(2);
    expect(books.applyLiteMode).toHaveBeenCalledWith(bookRigs.get('b0'), domain.books[0], 4);
    expect(host.missing.invalidate).toHaveBeenCalled();
    expect(host.syncGhosts).toHaveBeenCalled();
    expect(host.refresh).toHaveBeenCalled();
  });

  it('passe en léger : caisses cachées, soleil sans ombre', () => {
    const d = build();
    d.set(false);
    sun.castShadow = true;
    d.set(true);
    expect(ls.getItem(LITE_KEY)).toBe('1');
    expect(d.lite).toBe(true);
    expect(d.choice).toBe(true);
    expect(sun.castShadow).toBe(false);
    expect(crateVisibility()).toEqual([false, false]);
  });

  it('ne donne pas d’ombre au soleil d’une scène posée sur un autre décor', () => {
    transparent = true;
    const d = build();
    d.set(false);
    expect(sun.castShadow).toBe(false);
  });

  it('dans le mode déjà actif, prévient seulement l’interface', () => {
    const d = build();
    d.set(true);
    expect(host.emit).toHaveBeenCalledTimes(1);
    expect(host.refresh).not.toHaveBeenCalled();
    expect(books.applyLiteMode).not.toHaveBeenCalled();
    expect(d.choice).toBe(true);
  });

  it('tolère un stockage indisponible : le choix vaut pour la visite', () => {
    const d = build();
    stubLocalStorage(true);
    d.set(false);
    expect(d.choice).toBe(false);
    expect(d.lite).toBe(false);
  });

  it('ignore les rigs sans fiche de livre', () => {
    const d = build();
    bookRigs.set('orphelin', { id: 'orphelin' } as BookRig);
    d.set(false);
    expect(books.applyLiteMode).not.toHaveBeenCalled();
  });

  it('redessine le livre sorti en double résolution', () => {
    const d = build();
    addBooks(1);
    open = 'b0';
    d.set(false);
    expect(books.setBookResolution).toHaveBeenCalledWith(
      bookRigs.get('b0'),
      domain.books[0],
      4,
      OPEN_BOOK_SCALE,
    );
  });

  it('ne redessine rien si le livre sorti n’a plus de fiche ou de rig', () => {
    const d = build();
    addBooks(1);
    open = 'inconnu';
    d.set(false);
    open = 'b0';
    bookRigs.delete('b0');
    d.set(true);
    expect(books.setBookResolution).not.toHaveBeenCalled();
  });
});

describe('DisplayMode.upgrade', () => {
  it('ne fait rien si la personne a choisi le mode léger', () => {
    ls.setItem(LITE_KEY, '1');
    const d = build();
    books.setLiteBooks.mockClear();
    d.upgrade();
    vi.advanceTimersByTime(10_000);
    expect(d.lite).toBe(true);
    expect(books.applyLiteMode).not.toHaveBeenCalled();
    expect(books.setLiteBooks).not.toHaveBeenCalled();
  });

  it('attend 150 ms puis passe au complet par lots de 12 livres', () => {
    const d = build();
    addBooks(30);
    d.upgrade();
    // les livres créés d'ici là sont déjà complets
    expect(books.setLiteBooks).toHaveBeenLastCalledWith(false);
    expect(d.lite).toBe(true);
    vi.advanceTimersByTime(149);
    expect(books.applyLiteMode).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(books.applyLiteMode).toHaveBeenCalledTimes(12);
    expect(host.touch).toHaveBeenCalledTimes(1);
    expect(d.lite).toBe(true);
    vi.advanceTimersByTime(16);
    expect(books.applyLiteMode).toHaveBeenCalledTimes(24);
    vi.advanceTimersByTime(16);
    expect(books.applyLiteMode).toHaveBeenCalledTimes(30);
    // dernier lot : caisses, ombres, puis tas des manquants
    expect(d.lite).toBe(false);
    expect(sun.castShadow).toBe(true);
    expect(crateVisibility()).toEqual([true, true]);
    expect(host.refresh).toHaveBeenCalledTimes(1);
    expect(host.missing.invalidate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(books.applyLiteMode).toHaveBeenCalledTimes(30);
  });

  it('passe tout de suite au complet quand il n’y a aucun livre', () => {
    const d = build();
    d.upgrade();
    vi.advanceTimersByTime(150);
    expect(d.lite).toBe(false);
    expect(host.touch).toHaveBeenCalledTimes(1);
  });

  it('saute les livres disparus pendant la montée', () => {
    const d = build();
    addBooks(3);
    d.upgrade();
    bookRigs.delete('b0');
    domain.books = domain.books.filter((b) => b.id !== 'b1');
    vi.advanceTimersByTime(150);
    expect(books.applyLiteMode).toHaveBeenCalledTimes(1);
    expect(books.applyLiteMode).toHaveBeenCalledWith(bookRigs.get('b2'), domain.books[1], 4);
  });

  it('s’arrête si le moteur est détruit', () => {
    const d = build();
    addBooks(30);
    d.upgrade();
    vi.advanceTimersByTime(150);
    disposed = true;
    vi.advanceTimersByTime(1000);
    expect(books.applyLiteMode).toHaveBeenCalledTimes(12);
    expect(d.lite).toBe(true);
  });

  it('est interrompue par un choix de la personne', () => {
    const d = build();
    addBooks(30);
    d.upgrade();
    vi.advanceTimersByTime(150);
    d.set(true);
    const calls = books.applyLiteMode.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(books.applyLiteMode.mock.calls.length).toBe(calls);
    expect(d.lite).toBe(true);
  });

  it('une nouvelle montée remplace la précédente', () => {
    const d = build();
    addBooks(30);
    d.upgrade();
    d.upgrade();
    vi.advanceTimersByTime(10_000);
    expect(d.lite).toBe(false);
    // les deux minuteurs démarrent, mais seul le dernier traite les livres (30 passes, pas 60)
    expect(books.applyLiteMode).toHaveBeenCalledTimes(30);
  });
});
