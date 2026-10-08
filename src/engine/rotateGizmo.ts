import * as THREE from 'three';

import type { RotAxis } from '@/types';

import { AXIS_COLORS } from './worldAxes';

export type RotateGizmo = {
  group: THREE.Group;
  /** Zones de clic invisibles, userData = { axis: 'x' | 'y' | 'z', sign: 1 | -1 }. */
  hits: THREE.Mesh[];
  /** Rayon des flèches (demi-diagonale de la caisse) ; la taille des flèches, elle, ne change pas. */
  fit: (radius: number) => void;
  highlight: (axis: RotAxis | null) => void;
};

const AXES: RotAxis[] = ['x', 'y', 'z'];
/** Longueur d'une flèche courbe (unités monde), identique quelle que soit la caisse. */
const ARC_LEN = 0.55;
const TUBE = 0.035;
const HIT_TUBE = 0.18;

type Arrow = { group: THREE.Group; arc: THREE.Mesh; head: THREE.Mesh; hit: THREE.Mesh };

/**
 * Petites flèches courbes autour de la caisse sélectionnée : deux par axe du monde, opposées,
 * chacune dans son sens. Un clic sur une flèche = un quart de tour.
 */
export const buildRotateGizmo = (): RotateGizmo => {
  const group = new THREE.Group();
  group.visible = false;
  const hits: THREE.Mesh[] = [];
  const mats = new Map<RotAxis, THREE.MeshBasicMaterial>();
  const arrows: Arrow[] = [];
  let radius = 0;

  // flèche dans le plan XY local, centrée sur l'angle 0, sens direct (autour de +Z local)
  const arrow = (axis: RotAxis, mat: THREE.MeshBasicMaterial, sign: 1 | -1): THREE.Group => {
    const g = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 12), mat);
    const hit = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.userData = { axis, sign };
    arc.renderOrder = 997;
    head.renderOrder = 997;
    g.add(arc, head, hit);
    hits.push(hit);
    arrows.push({ group: g, arc, head, hit });
    return g;
  };

  for (const axis of AXES) {
    const mat = new THREE.MeshBasicMaterial({
      color: AXIS_COLORS[axis],
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    });
    mats.set(axis, mat);
    const holder = new THREE.Group();
    // flèche directe à l'angle 0 ; son miroir (x → -x) à l'angle π tourne dans l'autre sens
    holder.add(arrow(axis, mat, 1));
    const mirror = new THREE.Group();
    mirror.scale.x = -1;
    mirror.add(arrow(axis, mat, -1));
    holder.add(mirror);
    // +Z local → axe du monde (sens direct conservé)
    if (axis === 'x') holder.rotation.y = Math.PI / 2;
    if (axis === 'y') holder.rotation.x = -Math.PI / 2;
    group.add(holder);
  }

  /** Reconstruit les arcs pour un rayon donné, en gardant une longueur de flèche fixe. */
  const rebuild = (r: number): void => {
    const arc = ARC_LEN / r;
    for (const a of arrows) {
      a.arc.geometry.dispose();
      a.arc.geometry = new THREE.TorusGeometry(r, TUBE, 8, 20, arc);
      a.head.position.set(r * Math.cos(arc), r * Math.sin(arc), 0);
      a.head.rotation.z = arc;
      a.hit.geometry.dispose();
      a.hit.geometry = new THREE.TorusGeometry(r, HIT_TUBE, 6, 10, arc + 0.2 / r);
      a.group.rotation.z = -arc / 2;
    }
  };

  return {
    group,
    hits,
    fit: (r) => {
      if (Math.abs(r - radius) < 1e-3) return;
      radius = r;
      rebuild(r);
    },
    highlight: (axis) => {
      for (const [a, mat] of mats) mat.opacity = a === axis ? 1 : 0.85;
    },
  };
};
