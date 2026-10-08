import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { makeBirdNodes } from '@/test/birdRig';

import { createMesangeAnimator } from './animation';

const DT = 1 / 60;

/** Fait tourner l'animation `seconds` secondes et renvoie ce qui a été observé. */
const simulate = (
  update: (dt: number, t: number) => void,
  nodes: ReturnType<typeof makeBirdNodes>,
  seconds: number,
) => {
  const seen = {
    maxJaw: 0,
    maxHeadX: -Infinity,
    minHeadY: Infinity,
    maxHeadY: -Infinity,
    maxPitch: -Infinity,
    minRoll: Infinity,
    maxRoll: -Infinity,
    maxTailX: -Infinity,
    maxWing: 0,
    bodyYs: new Set<number>(),
    finite: true,
  };
  const wingAngle = new THREE.Quaternion();
  for (let t = 0; t < seconds; t += DT) {
    update(DT, t);
    seen.maxJaw = Math.max(seen.maxJaw, nodes.jaw.rotation.x);
    seen.maxHeadX = Math.max(seen.maxHeadX, nodes.head.rotation.x);
    seen.minHeadY = Math.min(seen.minHeadY, nodes.head.rotation.y);
    seen.maxHeadY = Math.max(seen.maxHeadY, nodes.head.rotation.y);
    seen.maxPitch = Math.max(seen.maxPitch, nodes.body.rotation.x);
    seen.minRoll = Math.min(seen.minRoll, nodes.body.rotation.z);
    seen.maxRoll = Math.max(seen.maxRoll, nodes.body.rotation.z);
    seen.maxTailX = Math.max(seen.maxTailX, nodes.tail.rotation.x);
    seen.maxWing = Math.max(seen.maxWing, nodes.wingL.quaternion.angleTo(wingAngle.identity()));
    seen.bodyYs.add(nodes.body.position.y);
    if (!Number.isFinite(nodes.body.rotation.x) || !Number.isFinite(nodes.head.rotation.y))
      seen.finite = false;
  }
  return seen;
};

describe('createMesangeAnimator', () => {
  it('passe le corps en ordre YXZ et ne le fait jamais rebondir', () => {
    const nodes = makeBirdNodes();
    const update = createMesangeAnimator(nodes.root);
    expect(nodes.body.rotation.order).toBe('YXZ');
    const seen = simulate(update, nodes, 60);
    expect(seen.bodyYs).toEqual(new Set([1]));
    expect(seen.finite).toBe(true);
  });

  it('prend la posture de base : le corps penche vers l’avant', () => {
    const nodes = makeBirdNodes();
    const update = createMesangeAnimator(nodes.root);
    for (let i = 0; i < 60; i++) update(DT, i * DT);
    expect(nodes.body.rotation.x).toBeGreaterThan(0.25);
    expect(nodes.body.rotation.x).toBeLessThan(0.36);
  });

  it('pépie au début : le bec s’ouvre au rythme du chant', () => {
    const nodes = makeBirdNodes();
    const update = createMesangeAnimator(nodes.root);
    update(DT, 0.04);
    // ouverture maximale 0,6 × 0,4 de la mâchoire
    expect(nodes.jaw.rotation.x).toBeGreaterThan(0.2);
    expect(nodes.jaw.rotation.x).toBeLessThanOrEqual(0.24);
  });

  it('alterne regard par saccades, picotis, coups de queue et inclinaisons', () => {
    const nodes = makeBirdNodes();
    const update = createMesangeAnimator(nodes.root);
    const seen = simulate(update, nodes, 300);
    // le regard balaie des deux côtés, dans des limites raisonnables
    expect(seen.minHeadY).toBeLessThan(-0.3);
    expect(seen.maxHeadY).toBeGreaterThan(0.3);
    expect(Math.abs(seen.minHeadY)).toBeLessThan(1);
    // picotis : la tête plonge et le corps bascule plus que la posture de base
    expect(seen.maxHeadX).toBeGreaterThan(0.8);
    expect(seen.maxPitch).toBeGreaterThan(0.5);
    // coups de queue
    expect(seen.maxTailX).toBeGreaterThan(0.3); // au repos 0,1
    // inclinaisons du corps des deux côtés
    expect(seen.minRoll).toBeLessThan(-0.1);
    expect(seen.maxRoll).toBeGreaterThan(0.1);
    // bec ouvert pendant le picotis ou le chant, jamais au-delà de 0,4 rad
    expect(seen.maxJaw).toBeGreaterThan(0.2);
    expect(seen.maxJaw).toBeLessThanOrEqual(0.4);
    // les ailes s'écartent un peu, jamais beaucoup
    expect(seen.maxWing).toBeGreaterThan(0.001);
    expect(seen.maxWing).toBeLessThan(0.2);
    expect(seen.finite).toBe(true);
  });

  it('se comporte de la même façon à graine égale, autrement pour une autre', () => {
    const run = (seed?: number): number => {
      const nodes = makeBirdNodes();
      const update = createMesangeAnimator(nodes.root, seed);
      simulate(update, nodes, 20);
      return nodes.head.rotation.y;
    };
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
    expect(run()).toBe(run(1234));
  });

  it('plafonne le pas de temps à 0,1 s', () => {
    const a = makeBirdNodes();
    const b = makeBirdNodes();
    createMesangeAnimator(a.root)(5, 3);
    createMesangeAnimator(b.root)(0.1, 3);
    expect(a.body.rotation.x).toBe(b.body.rotation.x);
    expect(a.head.rotation.y).toBe(b.head.rotation.y);
  });

  it('garde les pieds posés pendant tous les mouvements', () => {
    const nodes = makeBirdNodes();
    const feet = nodes.legs.map((l) => {
      l.foot.updateWorldMatrix(true, false);
      return l.foot.getWorldPosition(new THREE.Vector3());
    });
    const update = createMesangeAnimator(nodes.root);
    for (let t = 0; t < 30; t += DT) update(DT, t);
    nodes.root.updateMatrixWorld(true);
    nodes.legs.forEach((l, i) => {
      expect(l.foot.getWorldPosition(new THREE.Vector3()).distanceTo(feet[i]!)).toBeLessThan(0.02);
    });
  });

  it('écarte les ailes symétriquement, autour de l’axe indiqué par le modèle', () => {
    const nodes = makeBirdNodes();
    nodes.wingL.userData = { axis: [0, 0, 1], side: -1 };
    nodes.wingR.userData = { axis: [0, 0, 1], side: 1 };
    const update = createMesangeAnimator(nodes.root);
    for (let t = 0; t < 10; t += DT) update(DT, t);
    expect(nodes.wingL.quaternion.z).toBeCloseTo(-nodes.wingR.quaternion.z, 9);
    expect(nodes.wingL.quaternion.x).toBe(0);
    expect(nodes.wingL.quaternion.z).not.toBe(0);
  });

  it('suppose un axe et un côté par défaut quand le modèle n’en donne pas', () => {
    const nodes = makeBirdNodes();
    nodes.wingL.userData = { axis: [1, 2] }; // axe invalide
    const update = createMesangeAnimator(nodes.root);
    for (let t = 0; t < 10; t += DT) update(DT, t);
    // axe par défaut (0, 0, -1) : seule la composante z tourne ; L à gauche (-1), R à droite (+1)
    expect(nodes.wingL.quaternion.x).toBe(0);
    expect(nodes.wingL.quaternion.z * nodes.wingR.quaternion.z).toBeLessThan(0);
  });

  it('prend le côté indiqué par le modèle plutôt que celui déduit du nom', () => {
    const nodes = makeBirdNodes();
    nodes.wingR.userData = { side: -1 };
    const update = createMesangeAnimator(nodes.root);
    for (let t = 0; t < 10; t += DT) update(DT, t);
    expect(nodes.wingL.quaternion.z * nodes.wingR.quaternion.z).toBeGreaterThan(0);
  });

  it('fonctionne avec un modèle dont les nœuds manquent', () => {
    const root = new THREE.Group();
    const update = createMesangeAnimator(root);
    expect(() => {
      for (let t = 0; t < 120; t += 0.05) update(0.05, t);
    }).not.toThrow();
  });

  it('la queue suit le corps même sans tête', () => {
    const nodes = makeBirdNodes();
    nodes.head.removeFromParent();
    const update = createMesangeAnimator(nodes.root);
    for (let t = 0; t < 60; t += DT) update(DT, t);
    expect(Number.isFinite(nodes.tail.rotation.y)).toBe(true);
    expect(nodes.tail.rotation.x).toBeGreaterThan(0.05);
  });

  it('fonctionne sans tête ni queue mais avec un corps', () => {
    const nodes = makeBirdNodes();
    nodes.head.removeFromParent();
    nodes.tail.removeFromParent();
    nodes.jaw.removeFromParent();
    const update = createMesangeAnimator(nodes.root);
    expect(() => {
      for (let t = 0; t < 120; t += 0.05) update(0.05, t);
    }).not.toThrow();
    expect(nodes.body.rotation.x).toBeGreaterThan(0.2);
  });
});
