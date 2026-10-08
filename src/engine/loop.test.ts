import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Id } from '@/types';

import type { BookRig } from './books';
import { NEIGHBOR_SCALE } from './constants';
import type { Decor } from './decor';
import { RenderLoop, type LoopHost } from './loop';
import type { MissingPile } from './missingPile';
import type { Stage } from './stage';
import type { Showcase } from './view';

let now: number;
let rafCb: (() => void) | null;
let cancel: ReturnType<typeof vi.fn>;
let openId: Id | null;
let openBack: boolean;
let portrait: boolean;
let hovered: BookRig | null;
let neighbors: (Id | null)[];
let bookRigs: Map<Id, BookRig>;
let birdGroup: THREE.Group | null;

let camera: THREE.PerspectiveCamera;
let controls: { target: THREE.Vector3; update: ReturnType<typeof vi.fn> };
let stage: { camera: THREE.PerspectiveCamera; controls: typeof controls } & {
  touch: ReturnType<typeof vi.fn>;
  touchFrame: ReturnType<typeof vi.fn>;
  draw: ReturnType<typeof vi.fn>;
};
let showcase: { update: ReturnType<typeof vi.fn>; neighbors: (Id | null)[] };
let missing: { updateCamera: ReturnType<typeof vi.fn> };
let decor: { update: ReturnType<typeof vi.fn>; group: THREE.Group | null };
let finishExit: ReturnType<typeof vi.fn>;
let updateHover: ReturnType<typeof vi.fn>;
let canvas: HTMLCanvasElement;

const fakeRig = (id: string): BookRig => {
  const rig = {
    id,
    mesh: new THREE.Mesh(),
    target: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
  } as unknown as BookRig;
  return rig;
};

const makeLoop = (): RenderLoop => {
  showcase = { update: vi.fn(), neighbors };
  const host: LoopHost = {
    stage: stage as unknown as Stage,
    showcase: showcase as unknown as Showcase,
    missing: missing as unknown as MissingPile,
    decor: decor as unknown as Decor,
    canvas,
    bookRigs,
    openId: () => openId,
    openBack: () => openBack,
    isPortrait: () => portrait,
    finishExit,
    hovered: () => hovered,
    updateHover,
  };
  decor.group = birdGroup;
  return new RenderLoop(host);
};

/** Joue `n` images de 16 ms (les livres convergent exponentiellement vers leur cible). */
const frames = (n: number): void => {
  for (let i = 0; i < n; i++) frame(16);
};

/** Avance l'horloge de `ms` puis joue l'image suivante. */
const frame = (ms: number): void => {
  now += ms;
  const cb = rafCb!;
  rafCb = null;
  cb();
};

beforeEach(() => {
  now = 1000;
  rafCb = null;
  openId = null;
  openBack = false;
  portrait = false;
  hovered = null;
  neighbors = [null, null];
  bookRigs = new Map();
  birdGroup = null;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    rafCb = cb;
    return 42;
  });
  vi.stubGlobal('cancelAnimationFrame', cancel);
  camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 5, 10);
  controls = { target: new THREE.Vector3(), update: vi.fn() };
  stage = { camera, controls, touch: vi.fn(), touchFrame: vi.fn(), draw: vi.fn() };
  missing = { updateCamera: vi.fn() };
  decor = { update: vi.fn(), group: null };
  finishExit = vi.fn();
  updateHover = vi.fn();
  canvas = { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RenderLoop : une image', () => {
  it('start joue une image tout de suite et programme la suivante', () => {
    const loop = makeLoop();
    loop.start();
    expect(stage.draw).toHaveBeenCalledTimes(1);
    expect(rafCb).not.toBeNull();
    frame(16);
    expect(stage.draw).toHaveBeenCalledTimes(2);
  });

  it('fait avancer le livre sorti, le défilé des manquants, la mésange puis dessine', () => {
    const rig = fakeRig('o');
    bookRigs.set('o', rig);
    openId = 'o';
    openBack = true;
    portrait = true;
    const loop = makeLoop();
    loop.start();
    frame(16);
    const k = 1 - Math.exp(-0.016 * 7);
    const [cam, open, rigs, back, port, finish] = showcase.update.mock.calls[1]!;
    expect(cam).toBe(camera);
    expect(open).toBe(rig);
    expect(rigs).toBe(bookRigs);
    expect(back).toBe(true);
    expect(port).toBe(true);
    expect(finish).toBe(finishExit);
    const [c, target, kk] = missing.updateCamera.mock.calls[1]!;
    expect(c).toBe(camera);
    expect(target).toBe(controls.target);
    expect(kk).toBeCloseTo(k, 6);
    expect(decor.update.mock.calls[1]![0]).toBeCloseTo(0.016, 6);
    expect(decor.update.mock.calls[1]![1]).toBeCloseTo(0.016, 6);
    expect(updateHover).toHaveBeenCalledTimes(2);
    expect(controls.update).toHaveBeenCalledTimes(2);
    // le livre est ouvert : seconde passe de rendu
    expect(stage.draw).toHaveBeenLastCalledWith(true);
  });

  it('sans livre ouvert, ne rend que la première passe', () => {
    makeLoop().start();
    expect(showcase.update.mock.calls[0]![1]).toBeUndefined();
    expect(stage.draw).toHaveBeenCalledWith(false);
  });

  it('plafonne le pas de temps à 50 ms après une longue pause', () => {
    const loop = makeLoop();
    loop.start();
    frame(5000);
    expect(decor.update.mock.calls[1]![0]).toBeCloseTo(0.05, 6);
    expect(missing.updateCamera.mock.calls[1]![2]).toBeCloseTo(1 - Math.exp(-0.05 * 7), 6);
  });

  it('ne laisse jamais la caméra passer sous le sol', () => {
    camera.position.y = -3;
    makeLoop().start();
    expect(camera.position.y).toBe(0.25);
    camera.position.y = 4;
    frame(16);
    expect(camera.position.y).toBe(4);
  });
});

describe('RenderLoop : arrêt', () => {
  it('stop annule l’image programmée et plus rien ne se dessine', () => {
    const loop = makeLoop();
    loop.start();
    const pending = rafCb!;
    loop.stop();
    expect(cancel).toHaveBeenCalledWith(42);
    pending();
    expect(stage.draw).toHaveBeenCalledTimes(1);
    // aucune nouvelle image n'est programmée
    expect(rafCb).toBe(pending);
  });
});

describe('RenderLoop : mésange', () => {
  it('demande une image (sans recalcul des ombres) toutes les 50 ms environ tant qu’elle est visible', () => {
    birdGroup = new THREE.Group();
    const loop = makeLoop();
    loop.start();
    expect(stage.touchFrame).toHaveBeenCalledTimes(1);
    frame(20);
    frame(20);
    expect(stage.touchFrame).toHaveBeenCalledTimes(1);
    frame(20);
    expect(stage.touchFrame).toHaveBeenCalledTimes(2);
    expect(stage.touch).not.toHaveBeenCalled();
  });

  it('ne demande rien si elle est cachée ou absente', () => {
    birdGroup = new THREE.Group();
    birdGroup.visible = false;
    makeLoop().start();
    frame(100);
    expect(stage.touchFrame).not.toHaveBeenCalled();
    birdGroup = null;
    makeLoop().start();
    expect(stage.touchFrame).not.toHaveBeenCalled();
  });

  it('colle l’étiquette HTML à la mésange, ou la cache quand un livre est ouvert', () => {
    birdGroup = new THREE.Group();
    birdGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const el = { style: {} as Record<string, string> };
    const loop = makeLoop();
    loop.birdLabel.attach(el as unknown as HTMLElement);
    loop.start();
    expect(el.style.visibility).toBe('visible');
    expect(el.style.transform).toMatch(/^translate\(/);
    bookRigs.set('o', fakeRig('o'));
    openId = 'o';
    frame(16);
    expect(el.style.visibility).toBe('hidden');
  });
});

describe('RenderLoop : livres', () => {
  it('glisse chaque livre vers sa cible et demande une image tant qu’il bouge', () => {
    const rig = fakeRig('a');
    rig.target.set(10, 0, 0);
    bookRigs.set('a', rig);
    makeLoop().start();
    expect(stage.touch).toHaveBeenCalledTimes(1);
    // le premier pas a une durée nulle : rien n'a encore avancé
    expect(rig.mesh.position.x).toBe(0);
    frame(16);
    const k2 = 1 - Math.exp(-0.016 * 7);
    expect(rig.mesh.position.x).toBeCloseTo(10 * k2, 5);
    expect(stage.touch).toHaveBeenCalledTimes(2);
  });

  it('tourne le livre vers son orientation visée', () => {
    const rig = fakeRig('a');
    rig.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1);
    bookRigs.set('a', rig);
    makeLoop().start();
    expect(stage.touch).toHaveBeenCalledTimes(1);
    const before = rig.mesh.quaternion.angleTo(rig.quat);
    frame(100);
    expect(rig.mesh.quaternion.angleTo(rig.quat)).toBeLessThan(before);
  });

  it('ne demande aucune image pour un livre au repos', () => {
    bookRigs.set('a', fakeRig('a'));
    makeLoop().start();
    frame(16);
    expect(stage.touch).not.toHaveBeenCalled();
  });

  it('un changement de taille seul demande une image', () => {
    const rig = fakeRig('a');
    rig.mesh.scale.setScalar(0.6);
    bookRigs.set('a', rig);
    makeLoop().start();
    expect(stage.touch).toHaveBeenCalledTimes(1);
  });

  it('soulève un peu le livre survolé, sauf s’il est sorti', () => {
    const rig = fakeRig('a');
    bookRigs.set('a', rig);
    hovered = rig;
    makeLoop().start();
    frames(200);
    expect(rig.mesh.position.y).toBeGreaterThan(0.1);
    expect(rig.mesh.position.y).toBeLessThanOrEqual(0.15);
    const open = fakeRig('o');
    bookRigs.set('o', open);
    openId = 'o';
    hovered = open;
    makeLoop().start();
    frames(200);
    expect(open.mesh.position.y).toBeCloseTo(0, 6);
  });

  it('réduit les voisins du livre sorti, sauf en portrait', () => {
    const open = fakeRig('o');
    const next = fakeRig('n');
    bookRigs.set('o', open);
    bookRigs.set('n', next);
    openId = 'o';
    neighbors = [null, 'n'];
    makeLoop().start();
    frames(200);
    expect(next.mesh.scale.x).toBeLessThan(1);
    expect(next.mesh.scale.x).toBeCloseTo(NEIGHBOR_SCALE, 1);
    expect(open.mesh.scale.x).toBeCloseTo(1, 6);

    portrait = true;
    const rigP = fakeRig('p');
    bookRigs.clear();
    bookRigs.set('o', open);
    bookRigs.set('p', rigP);
    neighbors = [null, 'p'];
    makeLoop().start();
    frames(200);
    expect(rigP.mesh.scale.x).toBeCloseTo(1, 6);
  });
});
