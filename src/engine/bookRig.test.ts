import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeBook } from '@/test/fixtures';

import {
  applyLiteMode,
  disposeBookRig,
  ensureCover,
  makeBookRig,
  setBookResolution,
  setLiteBooks,
  setSpineFlat,
  updateBookTextures,
  type BookRig,
} from './bookRig';

const draw = vi.hoisted(() => ({
  spineTexture: vi.fn(),
  coverTexture: vi.fn(),
  backCoverTexture: vi.fn(),
}));
vi.mock('./bookTextures', () => draw);

/** Texture factice ; `horizontal` imite une tranche écrite à l'horizontale. */
const fakeTexture = (horizontal = false): THREE.Texture => {
  const t = new THREE.Texture();
  t.userData.horizontal = horizontal;
  return t;
};

beforeEach(() => {
  draw.spineTexture.mockReset().mockImplementation(() => fakeTexture());
  draw.coverTexture.mockReset().mockImplementation(() => fakeTexture());
  draw.backCoverTexture.mockReset().mockImplementation(() => fakeTexture());
  setLiteBooks(false);
});

const mats = (rig: BookRig): THREE.MeshStandardMaterial[] => rig.mesh.material;

describe('makeBookRig', () => {
  it('construit un pavé aux cotes du livre, six faces, tranche dessinée', () => {
    const b = makeBook({ id: 'x', t: 0.4, h: 2, d: 1.3, color: '#336699', spineColor: '#fff' });
    const rig = makeBookRig(b, 8);
    expect(rig.id).toBe('x');
    expect(rig.mesh.geometry.parameters).toMatchObject({ width: 0.4, height: 2, depth: 1.3 });
    expect(mats(rig)).toHaveLength(6);
    expect(draw.spineTexture).toHaveBeenCalledWith(b.title, '#336699', 8, 0.4, 2, '#fff');
    // faces : +X couverture, -X dos, +Z tranche ; les pages (tête, gouttière) sont partagées
    expect(mats(rig)[4]!.map).not.toBeNull();
    expect(mats(rig)[2]).toBe(mats(rig)[5]);
    expect(mats(rig)[0]!.color.getHexString()).toBe('336699');
    expect(mats(rig)[3]!.color.getHexString()).toBe(
      new THREE.Color('#336699').multiplyScalar(0.92).getHexString(),
    );
  });

  it('prépare la mise en scène : ombres, id, position de départ, cible et état', () => {
    const rig = makeBookRig(makeBook({ id: 'x' }), 1);
    expect(rig.mesh.castShadow).toBe(true);
    expect(rig.mesh.receiveShadow).toBe(true);
    expect(rig.mesh.userData.id).toBe('x');
    expect(rig.mesh.position.toArray()).toEqual([0, 8, 0]);
    expect(rig.target.toArray()).toEqual([0, 8, 0]);
    expect(rig.r).toBeNull();
    expect(rig.flat).toBe(false);
    expect(rig.faces).toEqual({ cover: false, back: false });
  });

  it('en mode léger : pavé uni, aucune texture dessinée', () => {
    setLiteBooks(true);
    const rig = makeBookRig(makeBook({ color: '#336699' }), 1);
    expect(draw.spineTexture).not.toHaveBeenCalled();
    expect(mats(rig)[4]!.map).toBeNull();
    expect(mats(rig)[4]!.color.getHexString()).toBe('336699');
  });
});

describe('applyLiteMode', () => {
  it('passe au léger : efface les textures et teint les faces de la couleur du livre', () => {
    const b = makeBook({ color: '#336699' });
    const rig = makeBookRig(b, 1);
    const spineMap = mats(rig)[4]!.map!;
    const dispose = vi.spyOn(spineMap, 'dispose');
    rig.faces = { cover: true, back: true };
    setLiteBooks(true);
    applyLiteMode(rig, b, 1);
    expect(dispose).toHaveBeenCalled();
    expect(mats(rig)[4]!.map).toBeNull();
    expect(mats(rig)[4]!.color.getHexString()).toBe('336699');
    expect(rig.faces).toEqual({ cover: false, back: false });
    expect(mats(rig)[0]!.map).toBeNull();
  });

  it('passe au complet : redessine la tranche et libère les anciennes cartes des faces', () => {
    const b = makeBook({ color: '#336699' });
    setLiteBooks(true);
    const rig = makeBookRig(b, 1);
    const old = fakeTexture();
    const disposeOld = vi.spyOn(old, 'dispose');
    mats(rig)[0]!.map = old;
    setLiteBooks(false);
    applyLiteMode(rig, b, 1);
    expect(disposeOld).toHaveBeenCalled();
    expect(mats(rig)[0]!.map).toBeNull();
    expect(mats(rig)[4]!.color.getHexString()).toBe('ffffff');
    expect(mats(rig)[4]!.map).not.toBeNull();
  });

  it('retourne le titre horizontal d’une tranche quand le livre est couché', () => {
    const b = makeBook();
    draw.spineTexture.mockImplementation(() => fakeTexture(true));
    const rig = makeBookRig(b, 1);
    rig.flat = true;
    applyLiteMode(rig, b, 1);
    const map = mats(rig)[4]!.map!;
    expect(map.rotation).toBe(Math.PI);
    expect(map.center.toArray()).toEqual([0.5, 0.5]);
  });
});

describe('setSpineFlat', () => {
  it('ne fait rien si l’état est déjà celui demandé', () => {
    const rig = makeBookRig(makeBook(), 1);
    const map = mats(rig)[4]!.map!;
    map.rotation = 0.7;
    setSpineFlat(rig, false);
    expect(map.rotation).toBe(0.7);
  });

  it('retourne un titre horizontal à plat, et le remet debout', () => {
    draw.spineTexture.mockImplementation(() => fakeTexture(true));
    const rig = makeBookRig(makeBook(), 1);
    setSpineFlat(rig, true);
    expect(rig.flat).toBe(true);
    expect(mats(rig)[4]!.map!.rotation).toBe(Math.PI);
    setSpineFlat(rig, false);
    expect(mats(rig)[4]!.map!.rotation).toBe(0);
  });

  it('laisse un titre vertical à l’endroit même à plat', () => {
    const rig = makeBookRig(makeBook(), 1);
    setSpineFlat(rig, true);
    expect(mats(rig)[4]!.map!.rotation).toBe(0);
  });

  it('sans carte de tranche (léger), change seulement l’état', () => {
    setLiteBooks(true);
    const rig = makeBookRig(makeBook(), 1);
    setSpineFlat(rig, true);
    expect(rig.flat).toBe(true);
  });
});

describe('ensureCover', () => {
  it('dessine la couverture une fois', () => {
    const b = makeBook({ cover: '/covers/a.webp', author: 'A', kind: 'bd' });
    const rig = makeBookRig(b, 3);
    ensureCover(rig, b, 3);
    expect(draw.coverTexture).toHaveBeenCalledWith(
      b.title,
      b.color,
      3,
      '/covers/a.webp',
      'A',
      1,
      'bd',
    );
    expect(rig.faces.cover).toBe(true);
    expect(mats(rig)[0]!.color.getHexString()).toBe('ffffff');
    expect(mats(rig)[0]!.map).not.toBeNull();
    ensureCover(rig, b, 3);
    expect(draw.coverTexture).toHaveBeenCalledTimes(1);
  });

  it('en mode léger, ne dessine que si on le force', () => {
    setLiteBooks(true);
    const b = makeBook();
    const rig = makeBookRig(b, 1);
    ensureCover(rig, b, 1);
    expect(draw.coverTexture).not.toHaveBeenCalled();
    expect(rig.faces.cover).toBe(false);
    ensureCover(rig, b, 1, true);
    expect(draw.coverTexture).toHaveBeenCalledTimes(1);
    expect(rig.faces.cover).toBe(true);
  });
});

describe('updateBookTextures', () => {
  it('teint les faces non dessinées et refait la tranche', () => {
    const b = makeBook({ color: '#336699' });
    const rig = makeBookRig(b, 1);
    b.color = '#aa0000';
    updateBookTextures(rig, b, 1);
    expect(mats(rig)[0]!.color.getHexString()).toBe('aa0000');
    expect(mats(rig)[1]!.color.getHexString()).toBe('aa0000');
    expect(mats(rig)[3]!.color.getHexString()).toBe(
      new THREE.Color('#aa0000').multiplyScalar(0.92).getHexString(),
    );
    expect(draw.spineTexture).toHaveBeenCalledTimes(2);
    expect(draw.coverTexture).not.toHaveBeenCalled();
    expect(draw.backCoverTexture).not.toHaveBeenCalled();
  });

  it('redessine couverture et dos déjà dessinés, en libérant les anciennes cartes', () => {
    const b = makeBook({ summary: 'résumé', author: 'A', publisher: 'P', year: 2001 });
    const rig = makeBookRig(b, 5);
    rig.faces = { cover: true, back: true };
    const oldFront = fakeTexture();
    const oldBack = fakeTexture();
    mats(rig)[0]!.map = oldFront;
    mats(rig)[1]!.map = oldBack;
    const d1 = vi.spyOn(oldFront, 'dispose');
    const d2 = vi.spyOn(oldBack, 'dispose');
    updateBookTextures(rig, b, 5);
    expect(d1).toHaveBeenCalled();
    expect(d2).toHaveBeenCalled();
    expect(draw.coverTexture).toHaveBeenCalledWith(
      b.title,
      b.color,
      5,
      undefined,
      'A',
      1,
      undefined,
    );
    expect(draw.backCoverTexture).toHaveBeenCalledWith(
      b.title,
      b.color,
      5,
      'résumé',
      'A',
      'P',
      2001,
    );
    expect(mats(rig)[0]!.map).not.toBe(oldFront);
  });

  it('en mode léger, la tranche prend la couleur du livre', () => {
    setLiteBooks(true);
    const b = makeBook({ color: '#336699' });
    const rig = makeBookRig(b, 1);
    b.color = '#00aa00';
    updateBookTextures(rig, b, 1);
    expect(mats(rig)[4]!.color.getHexString()).toBe('00aa00');
    expect(draw.spineTexture).not.toHaveBeenCalled();
  });
});

describe('setBookResolution', () => {
  it('dessine couverture et dos à l’échelle demandée', () => {
    const b = makeBook({ summary: 's', author: 'A', publisher: 'P', year: 1999, kind: 'roman' });
    const rig = makeBookRig(b, 2);
    const old = fakeTexture();
    mats(rig)[0]!.map = old;
    mats(rig)[1]!.map = old;
    const spy = vi.spyOn(old, 'dispose');
    setBookResolution(rig, b, 2, 2);
    expect(rig.faces).toEqual({ cover: true, back: true });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(draw.coverTexture).toHaveBeenCalledWith(b.title, b.color, 2, undefined, 'A', 2, 'roman');
    expect(draw.backCoverTexture).toHaveBeenCalledWith(b.title, b.color, 2, 's', 'A', 'P', 1999, 2);
    expect(mats(rig)[0]!.color.getHexString()).toBe('ffffff');
    expect(mats(rig)[1]!.color.getHexString()).toBe('ffffff');
  });

  it('en mode léger, le livre rangé redevient un pavé uni', () => {
    setLiteBooks(true);
    const b = makeBook({ color: '#336699' });
    const rig = makeBookRig(b, 1);
    rig.faces = { cover: true, back: true };
    const old = fakeTexture();
    mats(rig)[0]!.map = old;
    const spy = vi.spyOn(old, 'dispose');
    setBookResolution(rig, b, 1, 1);
    expect(spy).toHaveBeenCalled();
    expect(mats(rig)[0]!.map).toBeNull();
    expect(mats(rig)[0]!.color.getHexString()).toBe('336699');
    expect(rig.faces).toEqual({ cover: false, back: false });
    expect(draw.coverTexture).not.toHaveBeenCalled();
  });

  it('en mode léger, le livre sorti garde ses faces', () => {
    setLiteBooks(true);
    const b = makeBook();
    const rig = makeBookRig(b, 1);
    setBookResolution(rig, b, 1, 2);
    expect(rig.faces).toEqual({ cover: true, back: true });
    expect(draw.coverTexture).toHaveBeenCalledTimes(1);
  });
});

describe('disposeBookRig', () => {
  it('libère la géométrie, les cartes et les matériaux', () => {
    const rig = makeBookRig(makeBook(), 1);
    const geo = vi.spyOn(rig.mesh.geometry, 'dispose');
    const map = mats(rig)[4]!.map!;
    const mapDispose = vi.spyOn(map, 'dispose');
    // les pages (tête et gouttière) sont un seul matériau partagé : il est libéré une fois pour chaque face
    const matDispose = [...new Set(mats(rig))].map((m) => vi.spyOn(m, 'dispose'));
    disposeBookRig(rig);
    expect(geo).toHaveBeenCalled();
    expect(mapDispose).toHaveBeenCalled();
    for (const s of matDispose) expect(s).toHaveBeenCalled();
    expect(matDispose).toHaveLength(5);
  });
});
