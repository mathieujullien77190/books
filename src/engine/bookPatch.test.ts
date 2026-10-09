import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubWindow } from '@/test/browser';
import { makeBook } from '@/test/fixtures';

import { BookEditor, applyBookPatch, type BookEditorHost } from './bookPatch';
import type { BookRig } from './books';
import { OPEN_BOOK_SCALE } from './constants';
import { Domain } from './domain';

const books = vi.hoisted(() => ({
  resizeBookRig: vi.fn(),
  updateBookTextures: vi.fn(),
  setBookResolution: vi.fn(),
}));
vi.mock('./books', () => books);

describe('applyBookPatch', () => {
  it('range le titre nettoyé et ignore un titre vide', () => {
    const b = makeBook({ title: 'Ancien' });
    expect(applyBookPatch(b, { title: '  Nouveau  ' })).toBe(true);
    expect(b.title).toBe('Nouveau');
    // un titre vide reste une modification demandée (textures refaites) mais ne vide pas le titre
    expect(applyBookPatch(b, { title: '   ' })).toBe(true);
    expect(b.title).toBe('Nouveau');
  });

  it('applique couleur et résumé tels quels, y compris vides', () => {
    const b = makeBook({ color: '#111111', summary: 'x' });
    expect(applyBookPatch(b, { color: '#222222' })).toBe(true);
    expect(b.color).toBe('#222222');
    expect(applyBookPatch(b, { summary: '' })).toBe(true);
    expect(b.summary).toBe('');
  });

  it('pose ou retire la couverture (chaîne vide = retirée)', () => {
    const b = makeBook();
    expect(applyBookPatch(b, { cover: '/covers/a.webp' })).toBe(true);
    expect(b.cover).toBe('/covers/a.webp');
    expect(applyBookPatch(b, { cover: '' })).toBe(true);
    expect(b.cover).toBeUndefined();
    b.cover = '/covers/a.webp';
    expect(applyBookPatch(b, { cover: undefined })).toBe(true);
    expect(b.cover).toBeUndefined();
  });

  it('nettoie auteur, éditeur et ISBN, et les retire quand ils sont vides', () => {
    const b = makeBook();
    expect(applyBookPatch(b, { author: ' A ' })).toBe(true);
    expect(applyBookPatch(b, { publisher: ' P ' })).toBe(true);
    expect(applyBookPatch(b, { isbn: ' 123 ' })).toBe(true);
    expect([b.author, b.publisher, b.isbn]).toEqual(['A', 'P', '123']);
    applyBookPatch(b, { author: '  ', publisher: '', isbn: undefined });
    expect([b.author, b.publisher, b.isbn]).toEqual([undefined, undefined, undefined]);
  });

  it("n'accepte qu'une année valide", () => {
    const b = makeBook();
    expect(applyBookPatch(b, { year: 1999 })).toBe(true);
    expect(b.year).toBe(1999);
    applyBookPatch(b, { year: 0 });
    expect(b.year).toBeUndefined();
    b.year = 2000;
    applyBookPatch(b, { year: NaN });
    expect(b.year).toBeUndefined();
    b.year = 2000;
    applyBookPatch(b, { year: Infinity });
    expect(b.year).toBeUndefined();
    b.year = 2000;
    applyBookPatch(b, { year: undefined });
    expect(b.year).toBeUndefined();
  });

  it('applique le type', () => {
    const b = makeBook();
    expect(applyBookPatch(b, { kind: 'bd' })).toBe(true);
    expect(b.kind).toBe('bd');
  });

  it("garde la fiabilité de l'ISBN seulement si le livre a un ISBN", () => {
    const b = makeBook({ isbn: '123' });
    expect(applyBookPatch(b, { isbnConfidence: 'bonne' })).toBe(true);
    expect(b.isbnConfidence).toBe('bonne');
    applyBookPatch(b, { isbn: '', isbnConfidence: 'verifie' });
    expect(b.isbn).toBeUndefined();
    expect(b.isbnConfidence).toBeUndefined();
  });

  it('ne demande aucune texture pour un patch vide', () => {
    const b = makeBook({ title: 'Inchangé' });
    expect(applyBookPatch(b, {})).toBe(false);
    expect(b.title).toBe('Inchangé');
  });
});

describe('applyBookPatch : dimensions', () => {
  it('applique hauteur, profondeur et épaisseur dans les bornes (arrondies au millième)', () => {
    const b = makeBook({ h: 2, d: 1.4, t: 0.2 });
    expect(applyBookPatch(b, { h: 2.8, d: 2.05, t: 0.3504 })).toBe(true);
    expect(b).toMatchObject({ h: 2.8, d: 2.05, t: 0.35 });
  });

  it('refuse une valeur hors bornes, non finie ou absente', () => {
    const b = makeBook({ h: 2, d: 1.4, t: 0.2 });
    expect(applyBookPatch(b, { h: 0.1, d: 9, t: 0 })).toBe(false);
    expect(applyBookPatch(b, { h: Number.NaN, d: Infinity })).toBe(false);
    expect(applyBookPatch(b, { h: undefined })).toBe(false);
    expect(b).toMatchObject({ h: 2, d: 1.4, t: 0.2 });
  });

  it('accepte exactement les bornes', () => {
    const b = makeBook({});
    expect(applyBookPatch(b, { h: 0.5, d: 5, t: 0.01 })).toBe(true);
    expect(b).toMatchObject({ h: 0.5, d: 5, t: 0.01 });
  });

  it('ne modifie que la dimension fournie', () => {
    const b = makeBook({ h: 2, d: 1.4, t: 0.2 });
    expect(applyBookPatch(b, { t: 0.4 })).toBe(true);
    expect(b).toMatchObject({ h: 2, d: 1.4, t: 0.4 });
  });
});

describe('BookEditor', () => {
  let domain: Domain;
  let changed: ReturnType<typeof vi.fn>;
  let relayout: ReturnType<typeof vi.fn>;
  let rigs: Map<string, BookRig>;
  let openId: string | null;

  const makeEditor = (): BookEditor => {
    const host: BookEditorHost = {
      domain,
      rigOf: (id) => rigs.get(id),
      openId: () => openId,
      aniso: 4,
      changed,
      relayout,
    };
    return new BookEditor(host);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    stubWindow();
    books.updateBookTextures.mockClear();
    books.setBookResolution.mockClear();
    books.resizeBookRig.mockClear();
    domain = new Domain();
    domain.books = [makeBook({ id: 'a', title: 'A' }), makeBook({ id: 'b', title: 'B' })];
    changed = vi.fn();
    relayout = vi.fn();
    rigs = new Map();
    openId = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('modifie le livre, prévient le moteur et mémorise un état annulable', () => {
    const ed = makeEditor();
    ed.update('a', { title: 'Nouveau' });
    expect(domain.books[0]!.title).toBe('Nouveau');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(domain.history.canUndo).toBe(true);
  });

  it('redimensionne le pavé et refait la disposition quand une dimension change', () => {
    const rig = { id: 'a' } as BookRig;
    rigs.set('a', rig);
    const ed = makeEditor();
    ed.update('a', { h: 2.9 });
    expect(domain.books[0]!.h).toBe(2.9);
    expect(books.resizeBookRig).toHaveBeenCalledWith(rig, domain.books[0]);
    expect(relayout).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('refait la disposition même sans pavé construit, et ignore une valeur refusée', () => {
    const ed = makeEditor();
    ed.update('a', { d: 1.8 });
    expect(books.resizeBookRig).not.toHaveBeenCalled();
    expect(relayout).toHaveBeenCalledTimes(1);
    relayout.mockClear();
    ed.update('a', { t: 99 });
    expect(relayout).not.toHaveBeenCalled();
  });

  it('ne refait pas la disposition pour un champ sans dimension', () => {
    const ed = makeEditor();
    ed.update('a', { title: 'X' });
    expect(relayout).not.toHaveBeenCalled();
  });

  it('ignore un livre inconnu', () => {
    const ed = makeEditor();
    ed.update('zzz', { title: 'x' });
    expect(changed).not.toHaveBeenCalled();
    expect(domain.history.canUndo).toBe(false);
  });

  it("regroupe une saisie suivie sur le même livre en une seule entrée d'historique", () => {
    const ed = makeEditor();
    ed.update('a', { title: 'N' });
    vi.advanceTimersByTime(1000);
    ed.update('a', { title: 'No' });
    vi.advanceTimersByTime(1000);
    ed.update('a', { title: 'Nou' });
    domain.history.pop();
    expect(domain.history.canUndo).toBe(false);
  });

  it("ouvre une nouvelle entrée après une pause de plus d'1,5 s ou pour un autre livre", () => {
    const ed = makeEditor();
    ed.update('a', { title: 'N' });
    vi.advanceTimersByTime(1600);
    ed.update('a', { title: 'No' });
    ed.update('b', { title: 'X' });
    let n = 0;
    while (domain.history.canUndo) {
      domain.history.pop();
      n++;
    }
    expect(n).toBe(3);
  });

  it('reset termine la saisie en cours : la modification suivante ouvre une entrée', () => {
    const ed = makeEditor();
    ed.update('a', { title: 'N' });
    ed.reset();
    ed.update('a', { title: 'No' });
    let n = 0;
    while (domain.history.canUndo) {
      domain.history.pop();
      n++;
    }
    expect(n).toBe(2);
  });

  it('refait les textures après une pause de 250 ms, une seule fois pour une rafale', () => {
    const rig = { id: 'a' } as BookRig;
    rigs.set('a', rig);
    const ed = makeEditor();
    ed.update('a', { title: 'N' });
    vi.advanceTimersByTime(200);
    ed.update('a', { title: 'No' });
    vi.advanceTimersByTime(200);
    expect(books.updateBookTextures).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(books.updateBookTextures).toHaveBeenCalledTimes(1);
    expect(books.updateBookTextures).toHaveBeenCalledWith(rig, domain.books[0], 4);
    expect(books.setBookResolution).not.toHaveBeenCalled();
  });

  it('redessine aussi le livre sorti en double résolution', () => {
    const rig = { id: 'a' } as BookRig;
    rigs.set('a', rig);
    openId = 'a';
    makeEditor().update('a', { color: '#abcdef' });
    vi.advanceTimersByTime(250);
    expect(books.setBookResolution).toHaveBeenCalledWith(rig, domain.books[0], 4, OPEN_BOOK_SCALE);
  });

  it("ne dessine rien si le rig du livre n'existe plus à l'échéance", () => {
    makeEditor().update('a', { title: 'N' });
    vi.advanceTimersByTime(250);
    expect(books.updateBookTextures).not.toHaveBeenCalled();
  });

  it("ne planifie aucune texture si le patch n'en change aucune", () => {
    rigs.set('a', { id: 'a' } as BookRig);
    makeEditor().update('a', {});
    vi.advanceTimersByTime(500);
    expect(books.updateBookTextures).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('dispose annule le dessin en attente', () => {
    rigs.set('a', { id: 'a' } as BookRig);
    const ed = makeEditor();
    ed.update('a', { title: 'N' });
    ed.dispose();
    vi.advanceTimersByTime(500);
    expect(books.updateBookTextures).not.toHaveBeenCalled();
  });
});
