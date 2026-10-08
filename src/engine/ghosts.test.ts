import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFakeCanvas, type FakeCanvas } from '@/test/fakeCanvas';
import { makeBook } from '@/test/fixtures';
import type { MissingVolume } from '@/helpers';
import type { Book } from '@/types';

import { buildGhostBook, buildNote } from './ghosts';

const mocks = vi.hoisted(() => ({ makeBookRig: vi.fn() }));
vi.mock('./books', () => mocks);

let canvases: FakeCanvas[];

beforeEach(() => {
  canvases = installFakeCanvas();
  mocks.makeBookRig.mockReset().mockImplementation(() => ({
    mesh: new THREE.Mesh(new THREE.BoxGeometry()),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildGhostBook', () => {
  const missing = (): MissingVolume => ({
    series: 'Serie',
    label: 'Serie T2',
    num: 2,
    maxT: 0.7,
    template: makeBook({
      id: 'tpl',
      color: '#aa5500',
      spineColor: '#fefefe',
      h: 2,
      d: 1.2,
      t: 0.3,
      kind: 'bd',
      cover: '/covers/x.webp',
      summary: 'à ne pas copier',
    }),
  });

  it('copie les cotes et les couleurs du livre le plus proche, avec l’épaisseur maximale de la série', () => {
    const { t } = buildGhostBook(missing(), 6);
    const [book, aniso] = mocks.makeBookRig.mock.calls[0] as [Book, number];
    expect(aniso).toBe(6);
    expect(book).toEqual({
      id: 'ghost-Serie-2',
      title: 'Serie T2',
      color: '#aa5500',
      spineColor: '#fefefe',
      summary: '',
      h: 2,
      d: 1.2,
      t: 0.7,
      crate: null,
      kind: 'bd',
    });
    expect(t).toBe(0.7);
  });

  it('renvoie un maillage sans ombres', () => {
    mocks.makeBookRig.mockImplementation(() => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return { mesh };
    });
    const { mesh } = buildGhostBook(missing(), 1);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
  });
});

describe('buildNote', () => {
  it('écrit « Livres à acheter » et le nombre de tomes manquants sur le papier', () => {
    const g = buildNote(12);
    const ctx = canvases[0]!.ctx;
    expect([canvases[0]!.width, canvases[0]!.height]).toEqual([512, 288]);
    expect(ctx.texts()).toEqual(['Livres', 'à acheter', '(12)']);
    // lignes de cahier tracées sous le texte
    expect(ctx.of('stroke')).toHaveLength(5);
    expect(g.children).toHaveLength(2);
  });

  it('plie le papier en tente : deux panneaux inclinés de part et d’autre de la crête', () => {
    const g = buildNote(3);
    const [front, back] = g.children as THREE.Mesh[];
    const a = 0.62;
    const ridge = 0.95 * Math.cos(a);
    const run = 0.95 * Math.sin(a);
    expect(front!.position.toArray()).toEqual([0, ridge / 2, run / 2]);
    expect(back!.position.toArray()).toEqual([0, ridge / 2, -run / 2]);
    expect(front!.rotation.x).toBeCloseTo(-a);
    expect(back!.rotation.x).toBeCloseTo(a);
  });

  it('écrit le panneau avant et laisse l’arrière en papier uni', () => {
    const [front, back] = buildNote(3).children as THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshBasicMaterial
    >[];
    expect(front!.material.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(front!.material.map!.anisotropy).toBe(4);
    expect(back!.material.map).toBeNull();
    expect(back!.material.color.getHex()).toBe(0xe8dfc4);
    expect(front!.material.side).toBe(THREE.DoubleSide);
  });
});
