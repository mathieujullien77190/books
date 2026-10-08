import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GRID_STEP, SIZES, STORE_KEY } from '@/constants';
import type { Book, Crate } from '@/types';

import {
  clearLegacyState,
  crateDims,
  crateLabels,
  loadLegacyState,
  missingVolumes,
  parseVolume,
  rand,
  snap,
  uid,
  volumeLabel,
  volumeOf,
} from './index';

const book = (title: string, extra: Partial<Book> = {}): Book => ({
  id: title,
  title,
  color: '#888888',
  summary: '',
  h: 2,
  t: 0.2,
  d: 1.4,
  crate: null,
  ...extra,
});

describe('parseVolume', () => {
  it('lit « T3 », « tome 3 » et « vol. 3 »', () => {
    expect(parseVolume('Thorgal T3')).toMatchObject({ prefix: 'Thorgal', num: 3 });
    expect(parseVolume('Thorgal - Tome 03')).toMatchObject({ prefix: 'Thorgal', num: 3 });
    expect(parseVolume('Les Cités obscures vol. 12')).toMatchObject({ num: 12 });
  });

  it('lit « n°36/37 » comme un double numéro', () => {
    const v = parseVolume('La Hulotte n°36/37')!;
    expect(v).toMatchObject({ prefix: 'La Hulotte', num: 36, last: 37, mark: 'n°' });
    expect(volumeLabel(v)).toBe('n°36/37');
  });

  it('ne trouve rien dans un titre sans numéro', () => {
    expect(parseVolume('Le Petit Prince')).toBeNull();
  });
});

describe('volumeOf', () => {
  it('préfère les champs series / volume au titre', () => {
    const v = volumeOf(book('Titre sans numéro', { series: 'Ma série', volume: 4 }));
    expect(v).toMatchObject({ prefix: 'Ma série', num: 4 });
  });

  it('ignore les cartes IGN, qui ne sont pas des séries', () => {
    expect(volumeOf(book('Bastia Top 100 175 IGN'))).toBeNull();
  });

  it('ignore une année prise pour un numéro de tome', () => {
    expect(volumeOf(book('Roumanie 2016'))).toBeNull();
  });
});

describe('missingVolumes', () => {
  it('liste les trous entre le premier tome et le dernier possédé', () => {
    const miss = missingVolumes([book('Saga T1'), book('Saga T4')]);
    expect(miss.map((m) => m.num)).toEqual([2, 3]);
    expect(miss[0]!.label).toBe('Saga T2');
  });

  it("va jusqu'au total connu de la série", () => {
    const miss = missingVolumes([book('Saga T1', { seriesTotal: 3 })]);
    expect(miss.map((m) => m.num)).toEqual([2, 3]);
  });

  it('saute les séries marquées skipMissing', () => {
    expect(missingVolumes([book('Saga T1', { seriesTotal: 5, skipMissing: true })])).toEqual([]);
  });

  it('prend le livre le plus proche comme modèle et la plus forte épaisseur', () => {
    const near = book('Saga T4', { t: 0.5 });
    const miss = missingVolumes([book('Saga T1', { t: 0.3 }), near]);
    expect(miss.find((m) => m.num === 3)!.template).toBe(near);
    expect(miss[0]!.maxT).toBe(0.5);
  });

  it('ne signale rien quand la série est complète', () => {
    expect(missingVolumes([book('Saga T1'), book('Saga T2')])).toEqual([]);
  });
});

describe('crateLabels', () => {
  const crate = (id: string, size: Crate['size']): Crate => ({
    id,
    size,
    q: [0, 0, 0, 1],
    x: 0,
    z: 0,
    y: 0,
  });

  it("numérote par taille dans l'ordre du tableau (S→P, M→M, L→G, X→T)", () => {
    const labels = crateLabels([
      crate('a', 'L'),
      crate('b', 'S'),
      crate('c', 'L'),
      crate('d', 'X'),
      crate('e', 'M'),
    ]);
    expect([...labels.values()]).toEqual(['G1', 'P1', 'G2', 'T1', 'M1']);
  });

  it('renumérote quand on réordonne les caisses', () => {
    const a = crate('a', 'L');
    const b = crate('b', 'L');
    expect(crateLabels([a, b]).get('a')).toBe('G1');
    expect(crateLabels([b, a]).get('a')).toBe('G2');
  });
});

describe('uid / rand', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uid fabrique un identifiant court en base 36', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(uid()).toBe('i');
    expect(uid()).toMatch(/^[a-z0-9]{1,7}$/);
  });

  it("rand reste dans l'intervalle donné", () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    expect(rand(10, 20)).toBe(12.5);
    expect(rand(-4, 4)).toBe(-2);
  });
});

describe('crateDims', () => {
  it('utilise les cotes libres des caisses transparentes', () => {
    expect(crateDims({ size: 'X', dims: { w: 1, h: 2, d: 3 } })).toEqual({ w: 1, h: 2, d: 3 });
  });

  it('retombe sur les cotes de la taille sans dims', () => {
    expect(crateDims({ size: 'X' })).toBe(SIZES.X);
  });

  it('ignore dims pour une caisse en bois', () => {
    expect(crateDims({ size: 'M', dims: { w: 1, h: 2, d: 3 } })).toBe(SIZES.M);
  });
});

describe('snap', () => {
  it('arrondit à la grille par défaut', () => {
    expect(snap(GRID_STEP * 2.4)).toBeCloseTo(GRID_STEP * 2);
    expect(snap(GRID_STEP * 2.6)).toBeCloseTo(GRID_STEP * 3);
  });

  it('accepte un pas explicite', () => {
    expect(snap(7, 5)).toBe(5);
    expect(snap(8, 5)).toBe(10);
  });
});

describe('sauvegarde localStorage héritée', () => {
  const store = new Map<string, string>();
  const install = (over: Partial<Storage> = {}) =>
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => void store.delete(k),
      ...over,
    });
  const put = (v: unknown) => store.set(STORE_KEY, typeof v === 'string' ? v : JSON.stringify(v));
  const goodCrate = { id: 'c', size: 'M', q: [0, 0, 0, 1], x: 0, z: 0, y: 0 };

  beforeEach(() => {
    store.clear();
    install();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renvoie null sans sauvegarde', () => {
    expect(loadLegacyState()).toBeNull();
  });

  it('renvoie null pour un JSON illisible', () => {
    put('{pas du json');
    expect(loadLegacyState()).toBeNull();
  });

  it('renvoie null quand localStorage lève une exception', () => {
    install({
      getItem: () => {
        throw new Error('bloqué');
      },
    });
    expect(loadLegacyState()).toBeNull();
  });

  it('refuse un état sans caisses, avec caisses vides ou sans livres', () => {
    put({ books: [] });
    expect(loadLegacyState()).toBeNull();
    put({ crates: [], books: [] });
    expect(loadLegacyState()).toBeNull();
    put({ crates: [goodCrate] });
    expect(loadLegacyState()).toBeNull();
  });

  it('filtre les caisses invalides et complète les livres', () => {
    put({
      crates: [goodCrate, null, { ...goodCrate, size: 'Z' }, { ...goodCrate, q: 'x' }],
      books: [
        { id: 'b', title: 'T' },
        { id: 'c', title: 'U', summary: 'S', crate: 'c' },
      ],
      messy: 1,
    });
    const s = loadLegacyState()!;
    expect(s.crates).toEqual([goodCrate]);
    expect(s.books[0]).toMatchObject({ id: 'b', summary: '', crate: null });
    expect(s.books[1]).toMatchObject({ summary: 'S', crate: 'c' });
    expect(s.messy).toBe(true);
  });

  it('messy vaut false par défaut', () => {
    put({ crates: [goodCrate], books: [] });
    expect(loadLegacyState()!.messy).toBe(false);
  });

  it('clearLegacyState efface la clé', () => {
    put({ crates: [goodCrate], books: [] });
    clearLegacyState();
    expect(store.has(STORE_KEY)).toBe(false);
  });

  it('clearLegacyState ignore un stockage indisponible', () => {
    install({
      removeItem: () => {
        throw new Error('bloqué');
      },
    });
    expect(() => clearLegacyState()).not.toThrow();
  });
});

describe('parseVolume : cas limites', () => {
  it('lit un double numéro sans marque T et un numéro « nº »', () => {
    expect(parseVolume('Revue nº5')).toMatchObject({
      prefix: 'Revue',
      num: 5,
      last: 5,
      mark: 'n°',
    });
  });

  it('refuse « n°5 » sans préfixe (retombe sur le chiffre final ou rien)', () => {
    expect(parseVolume('n°5')).toBeNull();
  });

  it('lit un chiffre final nu', () => {
    expect(parseVolume('Astérix 12')).toMatchObject({ prefix: 'Astérix', num: 12, mark: 'T' });
  });

  it('refuse un chiffre final avec préfixe trop court', () => {
    expect(parseVolume('Ab 12')).toBeNull();
  });
});

describe('volumeLabel', () => {
  it('affiche un simple tome', () => {
    expect(volumeLabel({ prefix: 'S', num: 3, last: 3, mark: 'T' })).toBe('T3');
  });
});

describe('volumeOf : cas limites', () => {
  it('lit le titre quand series ou volume manque', () => {
    expect(volumeOf(book('Saga T2', { series: 'Autre' }))).toMatchObject({
      prefix: 'Saga',
      num: 2,
    });
  });
});

describe('missingVolumes : cas limites', () => {
  it('ignore les livres sans numéro et les numéros sans préfixe', () => {
    expect(missingVolumes([book('Le Petit Prince'), book('T3')])).toEqual([]);
  });

  it('regroupe les séries sans tenir compte de la casse et trie par nom', () => {
    const miss = missingVolumes([
      book('Zorro T2'),
      book('alpha T3'),
      book('Alpha T1'),
      book('Zorro T1', { skipMissing: false }),
    ]);
    expect(miss.map((m) => m.label)).toEqual(['alpha T2']);
  });

  it('compte les deux numéros d’un double numéro comme possédés', () => {
    const miss = missingVolumes([book('Revue n°1'), book('Revue n°3/4')]);
    expect(miss.map((m) => m.label)).toEqual(['Revue n°2']);
  });

  it('une seule série marquée skipMissing suffit à l’exclure', () => {
    expect(missingVolumes([book('Saga T1'), book('Saga T4', { skipMissing: true })])).toEqual([]);
  });

  it('choisit le premier livre à égale distance', () => {
    const a = book('Saga T1');
    const b = book('Saga T3');
    expect(missingVolumes([a, b])[0]!.template).toBe(a);
  });
});
