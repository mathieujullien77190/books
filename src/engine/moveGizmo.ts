import * as THREE from 'three';

import type { RotAxis } from '@/types';

import { AXIS_COLORS } from './worldAxes';

export type MoveGizmo = {
  group: THREE.Group;
  /** Zones de clic invisibles, userData = { kind: 'move', axis, sign }. */
  hits: THREE.Mesh[];
  /** Place les flèches juste hors de l'enveloppe de la caisse (dimensions monde). */
  fit: (fx: number, fy: number, fz: number) => void;
  /** Montre ou cache les flèches haut / bas selon que la caisse peut monter ou descendre. */
  setVertical: (up: boolean, down: boolean) => void;
  /** Zones de clic des flèches actuellement visibles. */
  activeHits: () => THREE.Mesh[];
  highlight: (axis: RotAxis | null) => void;
};

const AXES: RotAxis[] = ['x', 'y', 'z'];
const DIR: Record<RotAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
const SHAFT = 0.32;
const HEAD = 0.3;

/**
 * Six flèches droites autour de la caisse sélectionnée, une par sens de chaque axe du monde.
 * Un clic déplace la caisse d'un pas (ou jusqu'au contact) ; sur l'axe vertical, la pose sur la pile
 * ou la glisse dessous.
 */
export const buildMoveGizmo = (): MoveGizmo => {
  const group = new THREE.Group();
  group.visible = false;
  const hits: THREE.Mesh[] = [];
  const mats = new Map<RotAxis, THREE.MeshBasicMaterial>();
  const arrows: { axis: RotAxis; sign: 1 | -1; obj: THREE.Group }[] = [];

  for (const axis of AXES) {
    const mat = new THREE.MeshBasicMaterial({
      color: AXIS_COLORS[axis],
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    });
    mats.set(axis, mat);
    for (const sign of [1, -1] as const) {
      // flèche construite le long de +Y puis tournée vers (axis, sign)
      const a = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, SHAFT, 8), mat);
      shaft.position.y = SHAFT / 2;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, HEAD, 12), mat);
      head.position.y = SHAFT + HEAD / 2;
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, SHAFT + HEAD + 0.1, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.position.y = (SHAFT + HEAD) / 2;
      hit.userData = { kind: 'move', axis, sign };
      shaft.renderOrder = 997;
      head.renderOrder = 997;
      a.add(shaft, head, hit);
      if (axis === 'x') a.rotation.z = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
      if (axis === 'y') a.rotation.z = sign > 0 ? 0 : Math.PI;
      if (axis === 'z') a.rotation.x = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(a);
      hits.push(hit);
      arrows.push({ axis, sign, obj: a });
    }
  }

  return {
    group,
    hits,
    setVertical: (up, down) => {
      for (const { axis, sign, obj } of arrows)
        if (axis === 'y') obj.visible = sign > 0 ? up : down;
    },
    activeHits: () => hits.filter((h) => h.parent?.visible !== false),
    fit: (fx, fy, fz) => {
      const half: Record<RotAxis, number> = { x: fx / 2, y: fy / 2, z: fz / 2 };
      for (const { axis, sign, obj } of arrows)
        obj.position.copy(DIR[axis]).multiplyScalar(sign * (half[axis] + 0.18));
    },
    highlight: (axis) => {
      for (const [a, mat] of mats) mat.opacity = a === axis ? 1 : 0.85;
    },
  };
};
