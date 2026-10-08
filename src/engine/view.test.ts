import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeCrate } from '@/test/fixtures';

import type { BookRig } from './books';
import { HOME_DIR, NEIGHBOR_SCALE } from './constants';
import type { CrateRig } from './crate';
import { crateBounds } from './cratePlacement';
import { Showcase, focusCrateView, recenterView } from './view';

const round = (a: number[]): number[] => a.map((n) => Math.round(n * 1e4) / 1e4 + 0);
const vec = (v: THREE.Vector3): number[] => round(v.toArray());

/** Livre factice : seuls le maillage (cotes), la cible et l'orientation servent au showcase. */
const fakeRig = (id: string, h = 1.8, d = 1.1): BookRig =>
  ({
    id,
    mesh: new THREE.Mesh(new THREE.BoxGeometry(0.3, h, d)),
    target: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
  }) as unknown as BookRig;

/** Caméra en (0, 0, 10) regardant vers -Z : la droite de l'écran est +X. */
const makeCamera = (aspect = 2): THREE.PerspectiveCamera => {
  const cam = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recenterView', () => {
  it("cadre l'ensemble des caisses de face, à bonne distance", () => {
    const camera = new THREE.PerspectiveCamera();
    const target = new THREE.Vector3();
    const bb = crateBounds([makeCrate()]);
    recenterView(camera, target, bb);
    expect(target.x).toBeCloseTo(0);
    expect(target.y).toBeCloseTo(bb.maxY * 0.45);
    // étendue minimale de 6 : 6 * 1,55 + 3 le long de HOME_DIR
    const dist = camera.position.distanceTo(target);
    expect(dist).toBeCloseTo(6 * 1.55 + 3);
    expect(camera.position.clone().sub(target).normalize().dot(HOME_DIR)).toBeCloseTo(1);
  });

  it('recule davantage pour un groupe large', () => {
    const camera = new THREE.PerspectiveCamera();
    const target = new THREE.Vector3();
    recenterView(camera, target, crateBounds([makeCrate({ x: -20 }), makeCrate({ x: 20 })]));
    expect(camera.position.distanceTo(target)).toBeGreaterThan(40);
  });
});

describe('focusCrateView', () => {
  it('vise la caisse en gardant la direction de vue', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);
    const target = new THREE.Vector3(0, 0, 0);
    const crate = makeCrate();
    const rig = { group: new THREE.Group() } as unknown as CrateRig;
    rig.group.position.set(4, 1, 2);
    focusCrateView(camera, target, crate, rig);
    expect(vec(target)).toEqual([4, 1, 2]);
    // plus grande cote 3,5 : recul de 3,5 * 2,4 + 1 le long de +Z
    expect(vec(camera.position)).toEqual([4, 1, round([2 + 3.5 * 2.4 + 1])[0]]);
  });
});

describe('Showcase', () => {
  it('démarre sans voisin ni sortie en cours', () => {
    const s = new Showcase();
    expect(s.neighbors).toEqual([null, null]);
    expect(s.exiting).toBeNull();
    expect(s.enterDir).toBe(0);
  });

  it('ne bouge rien sans livre sorti', () => {
    const s = new Showcase();
    const finish = vi.fn();
    s.update(makeCamera(), undefined, new Map(), false, false, finish);
    expect(finish).not.toHaveBeenCalled();
  });

  it('place le livre devant la caméra, décalé à gauche, la couverture vers nous', () => {
    const s = new Showcase();
    const rig = fakeRig('o');
    s.update(makeCamera(), rig, new Map([['o', rig]]), false, false, vi.fn());
    // distance 3,8 (hauteur 1,8 * 1,9 = 3,42 < 3,8), décalage -22 % vers la gauche
    expect(vec(rig.target)).toEqual([-0.836, 0, 6.2]);
    // +X du livre (couverture) pointe vers la caméra (+Z)
    expect(vec(new THREE.Vector3(1, 0, 0).applyQuaternion(rig.quat))).toEqual([0, 0, 1]);
  });

  it('agrandit la distance pour un livre très haut', () => {
    const s = new Showcase();
    const rig = fakeRig('o', 3);
    s.update(makeCamera(), rig, new Map([['o', rig]]), false, false, vi.fn());
    // 3 * 1,9 = 5,7
    expect(rig.target.z).toBeCloseTo(10 - 5.7);
  });

  it('montre le dos du livre une fois retourné', () => {
    const s = new Showcase();
    const rig = fakeRig('o');
    s.update(makeCamera(), rig, new Map([['o', rig]]), true, false, vi.fn());
    expect(vec(new THREE.Vector3(1, 0, 0).applyQuaternion(rig.quat))).toEqual([0, 0, -1]);
  });

  it("fait arriver le livre du côté d'où l'on vient (enterDir) puis oublie ce sens", () => {
    const s = new Showcase();
    const rig = fakeRig('o');
    s.enterDir = 1;
    s.update(makeCamera(), rig, new Map([['o', rig]]), false, false, vi.fn());
    // écart latéral = largeur visible à la distance du livre
    const off = Math.tan(THREE.MathUtils.degToRad(20)) * 2 * 3.8 * 2;
    expect(rig.mesh.position.x).toBeCloseTo(-0.836 + off, 3);
    expect(rig.mesh.quaternion.angleTo(rig.quat)).toBeLessThan(1e-9);
    expect(s.enterDir).toBe(0);
  });

  it("en portrait : un seul livre, centré, à la distance qui l'ajuste à l'écran, sans voisins", () => {
    const s = new Showcase();
    const rig = fakeRig('o');
    const nb = fakeRig('n');
    nb.target.set(99, 99, 99);
    s.neighbors = ['n', null];
    s.update(
      makeCamera(0.5),
      rig,
      new Map([
        ['o', rig],
        ['n', nb],
      ]),
      false,
      true,
      vi.fn(),
    );
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(20));
    const fitH = (1.8 / 2) * 1.08;
    const fitW = (1.1 / 2) * 1.08;
    const dist = Math.max(fitH / tanHalf, fitW / (tanHalf * 0.5));
    expect(rig.target.x).toBeCloseTo(0);
    expect(rig.target.z).toBeCloseTo(10 - dist);
    expect(vec(nb.target)).toEqual([99, 99, 99]);
  });

  it('finit la sortie du livre précédent après 600 ms, pas avant', () => {
    const s = new Showcase();
    const rig = fakeRig('o');
    const out = fakeRig('p');
    s.exiting = { rig: out, dir: 1, start: 1000 };
    const finish = vi.fn();
    const now = vi.spyOn(performance, 'now').mockReturnValue(1500);
    s.update(makeCamera(), rig, new Map([['o', rig]]), false, true, finish);
    // il part du côté opposé à celui où l'on va, avec l'orientation du livre sorti
    expect(out.target.x).toBeLessThan(0);
    expect(out.quat.angleTo(rig.quat)).toBeLessThan(1e-9);
    expect(finish).not.toHaveBeenCalled();
    now.mockReturnValue(1601);
    s.update(makeCamera(), rig, new Map([['o', rig]]), false, true, finish);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('présente les voisins de part et d’autre, un peu en retrait, tournés vers le livre sorti', () => {
    const s = new Showcase();
    const rig = fakeRig('o');
    const prev = fakeRig('p');
    const next = fakeRig('n');
    s.neighbors = ['p', 'n'];
    s.update(
      makeCamera(),
      rig,
      new Map([
        ['o', rig],
        ['p', prev],
        ['n', next],
      ]),
      false,
      false,
      vi.fn(),
    );
    expect(prev.target.x).toBeLessThan(rig.target.x);
    expect(next.target.x).toBeGreaterThan(rig.target.x);
    // en retrait : plus loin de la caméra que le livre sorti
    expect(prev.target.z).toBeLessThan(rig.target.z);
    // écart : (largeur ouverte + largeur voisin réduite) / 2 + 0,3, multiplié par 1,15
    const gap = ((1.1 + 1.1 * NEIGHBOR_SCALE) / 2 + 0.3) * 1.15;
    expect(next.target.x - rig.target.x).toBeCloseTo(gap);
    expect(rig.target.x - prev.target.x).toBeCloseTo(gap);
    // couverture vers nous, légèrement tournée vers le livre central
    const cover = new THREE.Vector3(1, 0, 0).applyQuaternion(next.quat);
    expect(cover.z).toBeGreaterThan(0.85);
    expect(cover.x).toBeLessThan(0);
  });

  it('ignore un voisin sans rig ou absent', () => {
    const s = new Showcase();
    const rig = fakeRig('o');
    s.neighbors = ['absent', null];
    expect(() =>
      s.update(makeCamera(), rig, new Map([['o', rig]]), false, false, vi.fn()),
    ).not.toThrow();
  });
});
