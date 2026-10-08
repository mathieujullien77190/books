import { describe, expect, it } from 'vitest';

import type { Book, Crate } from '@/types';

import { crateLabels, missingVolumes, parseVolume, volumeLabel, volumeOf } from './index';

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
