import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { makeBirdNodes } from '@/test/birdRig';

import { createLegPlanter } from './legs';

const worldPos = (o: THREE.Object3D): THREE.Vector3 => {
  o.updateWorldMatrix(true, false);
  return o.getWorldPosition(new THREE.Vector3());
};

describe('createLegPlanter', () => {
  it('garde les pieds exactement où ils étaient quand le corps bouge un peu', () => {
    const { root, body, legs } = makeBirdNodes();
    const feet = legs.map((l) => worldPos(l.foot));
    const plant = createLegPlanter(root, legs);
    body.position.y += 0.01;
    body.rotation.z = 0.05;
    body.rotation.x = 0.1;
    root.updateMatrixWorld(true);
    plant();
    root.updateMatrixWorld(true);
    legs.forEach((l, i) => {
      expect(worldPos(l.foot).distanceTo(feet[i]!)).toBeLessThan(1e-5);
    });
  });

  it('plie la jambe : cuisse et jambe pivotent, le genou reste devant', () => {
    const { root, body, legs } = makeBirdNodes();
    const plant = createLegPlanter(root, legs);
    const thighBefore = legs[0]!.thigh.quaternion.clone();
    body.position.y += 0.01;
    root.updateMatrixWorld(true);
    plant();
    expect(legs[0]!.thigh.quaternion.angleTo(thighBefore)).toBeGreaterThan(1e-4);
    root.updateMatrixWorld(true);
    // le genou reste du même côté (vers +Z) que le pied
    expect(worldPos(legs[0]!.shin).z).toBeGreaterThan(worldPos(legs[0]!.foot).z);
  });

  it("ne bouge rien quand rien n'a bougé", () => {
    const { root, legs } = makeBirdNodes();
    const plant = createLegPlanter(root, legs);
    const before = legs.map((l) => l.thigh.quaternion.clone());
    plant();
    legs.forEach((l, i) => expect(l.thigh.quaternion.angleTo(before[i]!)).toBeLessThan(1e-6));
  });

  it('tend la jambe au maximum quand le pied est hors de portée', () => {
    const { root, body, legs } = makeBirdNodes();
    const plant = createLegPlanter(root, legs);
    const l1 = Math.hypot(0.5, 0.1);
    body.position.y += 0.5;
    root.updateMatrixWorld(true);
    plant();
    root.updateMatrixWorld(true);
    const leg = legs[0]!;
    // hanche → pied : longueur maximale moins la marge de 1 mm
    expect(worldPos(leg.thigh).distanceTo(worldPos(leg.foot))).toBeCloseTo(2 * l1 - 0.001, 3);
  });

  it('replie la jambe quand la hanche arrive sur le pied', () => {
    const { root, body, legs } = makeBirdNodes();
    const feet = legs.map((l) => worldPos(l.foot));
    const plant = createLegPlanter(root, legs);
    body.position.y = 0;
    root.updateMatrixWorld(true);
    plant();
    root.updateMatrixWorld(true);
    legs.forEach((l, i) => {
      expect(Number.isFinite(l.thigh.quaternion.x)).toBe(true);
      expect(worldPos(l.foot).distanceTo(feet[i]!)).toBeLessThan(1e-5);
    });
  });

  it('gère une jambe droite (genou sur la ligne hanche-pied)', () => {
    const { root, body, legs } = makeBirdNodes();
    for (const l of legs) {
      l.shin.position.set(0, -0.5, 0);
      l.foot.position.set(0, -0.5, 0);
    }
    const feet = legs.map((l) => worldPos(l.foot));
    const plant = createLegPlanter(root, legs);
    body.position.y -= 0.1; // la jambe droite doit se plier
    root.updateMatrixWorld(true);
    plant();
    root.updateMatrixWorld(true);
    legs.forEach((l, i) => {
      expect(Number.isFinite(l.shin.quaternion.x)).toBe(true);
      expect(worldPos(l.foot).distanceTo(feet[i]!)).toBeLessThan(1e-4);
    });
  });

  it('ignore les pattes incomplètes ou sans parent, ou aux segments nuls', () => {
    const { root, legs } = makeBirdNodes();
    const orphan = new THREE.Group();
    const noParent = { thigh: orphan, shin: new THREE.Group(), foot: new THREE.Group() };
    const flat = makeBirdNodes();
    flat.legs[0]!.shin.position.set(0, 0, 0); // cuisse de longueur nulle
    const flat2 = makeBirdNodes();
    flat2.legs[0]!.foot.position.set(0, 0, 0); // jambe de longueur nulle
    const plantNone = createLegPlanter(root, [
      {},
      { thigh: legs[0]!.thigh },
      { thigh: legs[0]!.thigh, shin: legs[0]!.shin },
      noParent,
    ]);
    const plantFlat = createLegPlanter(flat.root, [flat.legs[0]!]);
    const plantFlat2 = createLegPlanter(flat2.root, [flat2.legs[0]!]);
    const q = flat.legs[0]!.thigh.quaternion.clone();
    flat.body.position.y += 0.1;
    flat.root.updateMatrixWorld(true);
    expect(() => {
      plantNone();
      plantFlat();
      plantFlat2();
    }).not.toThrow();
    expect(flat.legs[0]!.thigh.quaternion.equals(q)).toBe(true);
  });
});
