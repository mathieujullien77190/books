import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeBook } from '@/test/fixtures';
import type { Book, Id } from '@/types';

import type { BookRig } from './books';
import { OPEN_BOOK_SCALE } from './constants';
import { Domain } from './domain';
import { OpenBook, type OpenBookHost } from './openBook';

const books = vi.hoisted(() => ({ ensureCover: vi.fn(), setBookResolution: vi.fn() }));
vi.mock('./books', () => books);

const fakeRig = (id: string): BookRig =>
  ({
    id,
    mesh: new THREE.Mesh(),
    target: new THREE.Vector3(1, 2, 3),
    quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1),
  }) as unknown as BookRig;

let domain: Domain;
let rigs: Map<Id, BookRig>;
let stored: Set<Id>;
let portrait: boolean;
let host: OpenBookHost;
let ob: OpenBook;

const inLayer = (rig: BookRig, layer: number): boolean => rig.mesh.layers.isEnabled(layer);

/** Quatre livres : trois dans la caisse « c1 », un libre. */
const libraryOf = (): Book[] => [
  makeBook({ id: 'a', crate: 'c1' }),
  makeBook({ id: 'b', crate: 'c1' }),
  makeBook({ id: 'c', crate: 'c1' }),
  makeBook({ id: 'x', crate: null }),
  makeBook({ id: 'y', crate: 'disparue' }),
];

beforeEach(() => {
  books.ensureCover.mockReset();
  books.setBookResolution.mockReset();
  domain = new Domain();
  domain.books = libraryOf();
  rigs = new Map(domain.books.map((b) => [b.id, fakeRig(b.id)] as const));
  stored = new Set(['c1']);
  portrait = false;
  host = {
    domain,
    bookRigs: rigs,
    hasCrate: (id) => stored.has(id),
    aniso: 4,
    isPortrait: () => portrait,
    clearHint: vi.fn(),
    layoutBooks: vi.fn(),
    refresh: vi.fn(),
    emit: vi.fn(),
  };
  ob = new OpenBook(host);
  vi.spyOn(performance, 'now').mockReturnValue(1234);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OpenBook.open', () => {
  it('sort le livre : couche 1, sans ombre, en double résolution, côté couverture', () => {
    ob.back = true;
    ob.open('b');
    const rig = rigs.get('b')!;
    expect(ob.id).toBe('b');
    expect(ob.back).toBe(false);
    expect(inLayer(rig, 1)).toBe(true);
    expect(inLayer(rig, 0)).toBe(false);
    expect(rig.mesh.castShadow).toBe(false);
    expect(books.setBookResolution).toHaveBeenCalledWith(rig, domain.books[1], 4, OPEN_BOOK_SCALE);
    expect(host.refresh).toHaveBeenCalledTimes(1);
  });

  it('ignore un livre sans rig', () => {
    ob.open('inconnu');
    expect(ob.id).toBeNull();
    expect(host.refresh).not.toHaveBeenCalled();
  });

  it('range d’abord le livre déjà sorti, sans rafraîchir deux fois', () => {
    ob.open('a');
    const first = rigs.get('a')!;
    ob.open('b');
    expect(inLayer(first, 0)).toBe(true);
    expect(inLayer(first, 1)).toBe(false);
    expect(first.mesh.castShadow).toBe(true);
    expect(books.setBookResolution).toHaveBeenCalledWith(first, domain.books[0], 4, 1);
    expect(ob.id).toBe('b');
    // « a » puis « b » : un rafraîchissement chacun, pas de troisième venu de close()
    expect(host.refresh).toHaveBeenCalledTimes(2);
  });

  it('rouvrir le même livre ne le range pas', () => {
    ob.open('a');
    ob.open('a');
    expect(books.setBookResolution).toHaveBeenCalledTimes(2);
    expect(books.setBookResolution.mock.calls.every((c) => c[3] === OPEN_BOOK_SCALE)).toBe(true);
  });

  it('sort le rig même si la fiche du livre a disparu', () => {
    domain.books = domain.books.filter((b) => b.id !== 'a');
    ob.open('a');
    expect(ob.id).toBe('a');
    expect(books.setBookResolution).not.toHaveBeenCalled();
  });
});

describe('OpenBook.close', () => {
  it('range le livre, éteint la surbrillance, oublie la recherche et rafraîchit', () => {
    ob.open('a');
    ob.resultIds = ['a', 'b'];
    vi.mocked(host.refresh).mockClear();
    const rig = rigs.get('a')!;
    ob.close();
    expect(ob.id).toBeNull();
    expect(inLayer(rig, 0)).toBe(true);
    expect(rig.mesh.castShadow).toBe(true);
    expect(books.setBookResolution).toHaveBeenLastCalledWith(rig, domain.books[0], 4, 1);
    expect(host.clearHint).toHaveBeenCalledTimes(1);
    expect(ob.resultIds).toBeNull();
    expect(host.refresh).toHaveBeenCalledTimes(1);
  });

  it('close(false) garde la recherche en cours et ne rafraîchit pas', () => {
    ob.open('a');
    ob.resultIds = ['a', 'b'];
    vi.mocked(host.refresh).mockClear();
    ob.close(false);
    expect(ob.id).toBeNull();
    expect(ob.resultIds).toEqual(['a', 'b']);
    expect(host.refresh).not.toHaveBeenCalled();
  });

  it('ne touche pas au rig d’un livre en train de sortir de l’écran', () => {
    ob.open('a');
    const rig = rigs.get('a')!;
    ob.showcase.exiting = { rig, dir: 1, start: 0 };
    books.setBookResolution.mockClear();
    ob.close();
    expect(inLayer(rig, 1)).toBe(true);
    expect(books.setBookResolution).not.toHaveBeenCalled();
    expect(ob.id).toBeNull();
  });

  it('ferme sans erreur quand rien n’est ouvert ou que le rig a disparu', () => {
    ob.close();
    expect(host.clearHint).toHaveBeenCalledTimes(1);
    ob.open('a');
    rigs.delete('a');
    expect(() => ob.close()).not.toThrow();
    expect(ob.id).toBeNull();
  });

  it('range le rig même si la fiche du livre a disparu', () => {
    ob.open('a');
    domain.books = [];
    books.setBookResolution.mockClear();
    ob.close();
    expect(inLayer(rigs.get('a')!, 0)).toBe(true);
    expect(books.setBookResolution).not.toHaveBeenCalled();
  });
});

describe('OpenBook.flip', () => {
  it('retourne le livre sorti : couverture, puis dos, puis couverture', () => {
    ob.open('a');
    ob.flip();
    expect(ob.back).toBe(true);
    ob.flip();
    expect(ob.back).toBe(false);
    expect(host.emit).toHaveBeenCalledTimes(2);
  });

  it('ne fait rien sans livre sorti', () => {
    ob.flip();
    expect(ob.back).toBe(false);
    expect(host.emit).not.toHaveBeenCalled();
  });
});

describe('OpenBook.showResults', () => {
  it('ouvre le premier résultat et garde la liste pour le parcours', () => {
    ob.showResults(['c', 'a']);
    expect(ob.id).toBe('c');
    expect(ob.resultIds).toEqual(['c', 'a']);
  });

  it('ignore une liste vide', () => {
    ob.showResults([]);
    expect(ob.id).toBeNull();
    expect(ob.resultIds).toBeNull();
  });
});

describe('OpenBook.updateNeighbors', () => {
  it('prend les voisins du livre dans sa caisse et les passe au premier plan', () => {
    ob.open('b');
    ob.updateNeighbors();
    expect(ob.showcase.neighbors).toEqual(['a', 'c']);
    for (const id of ['a', 'c']) {
      const rig = rigs.get(id)!;
      expect(inLayer(rig, 1)).toBe(true);
      expect(rig.mesh.castShadow).toBe(false);
    }
    const bk = (id: string) => domain.books.find((b) => b.id === id);
    expect(books.ensureCover).toHaveBeenCalledWith(rigs.get('a'), bk('a'), 4, true);
    expect(books.ensureCover).toHaveBeenCalledWith(rigs.get('c'), bk('c'), 4, true);
  });

  it('aux extrémités de la caisse, le voisin manquant est null', () => {
    ob.open('a');
    ob.updateNeighbors();
    expect(ob.showcase.neighbors).toEqual([null, 'b']);
    ob.open('c');
    ob.updateNeighbors();
    expect(ob.showcase.neighbors).toEqual(['b', null]);
  });

  it('remet à leur place les anciens voisins qui ne le sont plus, et garde ceux qui le restent', () => {
    ob.open('b');
    ob.updateNeighbors();
    ob.open('c');
    ob.updateNeighbors();
    expect(ob.showcase.neighbors).toEqual(['b', null]);
    // « a » n'est plus voisin : retour dans la scène
    expect(inLayer(rigs.get('a')!, 0)).toBe(true);
    expect(rigs.get('a')!.mesh.castShadow).toBe(true);
    // « b » le reste (de l'autre côté) : toujours au premier plan
    expect(inLayer(rigs.get('b')!, 1)).toBe(true);
  });

  it('pour un livre libre, les voisins sont les autres livres hors caisse', () => {
    ob.open('x');
    ob.updateNeighbors();
    // « y » dépend d'une caisse qui n'existe plus : il est lui aussi « à côté »
    expect(ob.showcase.neighbors).toEqual([null, 'y']);
  });

  it('un livre dont la caisse a disparu a pour voisins les livres hors caisse', () => {
    ob.open('y');
    ob.updateNeighbors();
    expect(ob.showcase.neighbors).toEqual(['x', null]);
  });

  it('suit l’ordre d’une recherche quand le livre en fait partie', () => {
    ob.showResults(['c', 'x', 'a']);
    ob.updateNeighbors();
    expect(ob.showcase.neighbors).toEqual([null, 'x']);
    ob.open('x');
    ob.updateNeighbors();
    expect(ob.showcase.neighbors).toEqual(['c', 'a']);
  });

  it('saute dans une recherche les identifiants qui ne sont plus des livres', () => {
    ob.showResults(['c', 'fantome', 'a']);
    ob.updateNeighbors();
    expect(ob.showcase.neighbors).toEqual([null, 'a']);
  });

  it('revient aux voisins de la caisse si le livre n’est pas dans la recherche', () => {
    ob.resultIds = ['x', 'y'];
    ob.open('b');
    ob.updateNeighbors();
    expect(ob.showcase.neighbors).toEqual(['a', 'c']);
  });

  it('sans livre sorti, il n’y a plus de voisins', () => {
    ob.open('b');
    ob.updateNeighbors();
    ob.close();
    ob.updateNeighbors();
    expect(ob.showcase.neighbors).toEqual([null, null]);
    expect(inLayer(rigs.get('a')!, 0)).toBe(true);
  });

  it('en portrait, calcule les voisins sans les sortir de la scène', () => {
    portrait = true;
    ob.open('b');
    books.ensureCover.mockClear();
    ob.updateNeighbors();
    expect(ob.showcase.neighbors).toEqual(['a', 'c']);
    expect(inLayer(rigs.get('a')!, 0)).toBe(true);
    expect(books.ensureCover).not.toHaveBeenCalled();
  });

  it('ignore un voisin dont le rig n’existe pas', () => {
    rigs.delete('c');
    ob.open('b');
    expect(() => ob.updateNeighbors()).not.toThrow();
    expect(ob.showcase.neighbors).toEqual(['a', 'c']);
  });
});

describe('OpenBook.step', () => {
  beforeEach(() => {
    ob.open('b');
    ob.updateNeighbors();
  });

  it('passe au livre précédent ou suivant', () => {
    ob.step(1);
    expect(ob.id).toBe('c');
    ob.updateNeighbors();
    ob.step(-1);
    expect(ob.id).toBe('b');
    expect(ob.showcase.exiting).toBeNull();
  });

  it('ne fait rien sans voisin de ce côté', () => {
    ob.open('a');
    ob.updateNeighbors();
    ob.step(-1);
    expect(ob.id).toBe('a');
  });

  it('en portrait, fait sortir le livre actuel du côté opposé et arriver le suivant', () => {
    portrait = true;
    ob.updateNeighbors();
    const out = rigs.get('b')!;
    ob.step(1);
    expect(ob.id).toBe('c');
    expect(ob.showcase.exiting).toEqual({ rig: out, dir: 1, start: 1234 });
    expect(ob.showcase.enterDir).toBe(1);
  });

  it('en portrait, termine d’abord la sortie précédente', () => {
    portrait = true;
    ob.updateNeighbors();
    const earlier = rigs.get('a')!;
    ob.showcase.exiting = { rig: earlier, dir: -1, start: 0 };
    ob.step(1);
    expect(host.layoutBooks).toHaveBeenCalledTimes(1);
    expect(ob.showcase.exiting!.rig).toBe(rigs.get('b'));
  });

  it("ouvre le voisin même si plus aucun livre n'est sorti (voisins périmés)", () => {
    ob.close(false);
    ob.step(1);
    expect(ob.id).toBe('c');
  });

  it('en portrait sans livre sorti en main, ouvre simplement le voisin', () => {
    portrait = true;
    ob.updateNeighbors();
    rigs.delete('b');
    ob.step(1);
    expect(ob.id).toBe('c');
    expect(ob.showcase.exiting).toBeNull();
  });
});

describe('OpenBook.finishExit', () => {
  it('ne fait rien sans sortie en cours', () => {
    ob.finishExit();
    expect(host.layoutBooks).not.toHaveBeenCalled();
  });

  it('range le livre sorti de l’écran à sa place, sans qu’on le voie voler', () => {
    const rig = rigs.get('a')!;
    rig.mesh.layers.set(1);
    rig.mesh.castShadow = false;
    ob.showcase.exiting = { rig, dir: 1, start: 0 };
    ob.finishExit();
    expect(ob.showcase.exiting).toBeNull();
    expect(inLayer(rig, 0)).toBe(true);
    expect(rig.mesh.castShadow).toBe(true);
    expect(books.setBookResolution).toHaveBeenCalledWith(rig, domain.books[0], 4, 1);
    expect(host.layoutBooks).toHaveBeenCalledTimes(1);
    expect(rig.mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(rig.mesh.quaternion.angleTo(rig.quat)).toBeLessThan(1e-9);
  });

  it('range quand même le rig si la fiche du livre a disparu', () => {
    const rig = rigs.get('a')!;
    domain.books = [];
    ob.showcase.exiting = { rig, dir: -1, start: 0 };
    ob.finishExit();
    expect(books.setBookResolution).not.toHaveBeenCalled();
    expect(host.layoutBooks).toHaveBeenCalled();
  });
});
