import * as THREE from 'three';

import { PAD } from '@/constants';
import { crateDims } from '@/helpers';
import type { Crate, Quat, RotAxis } from '@/types';

export const AXES: Record<RotAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

/** Ouverture devant (+Z). */
export const Q_TRANCHE: Quat = [0, 0, 0, 1];
/** Ouverture en haut (+Y). */
export const Q_DEBOUT = new THREE.Quaternion()
  .setFromAxisAngle(AXES.x, -Math.PI / 2)
  .toArray() as Quat;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();

export const quatOf = (c: Crate): THREE.Quaternion => _q.fromArray(c.q);

/** Recale un quaternion sur la rotation « entière » la plus proche (matrice à coefficients -1/0/1). */
export const snapQuat = (q: THREE.Quaternion): THREE.Quaternion => {
  _m.makeRotationFromQuaternion(q);
  const e = _m.elements;
  for (let i = 0; i < 16; i++) e[i] = Math.round(e[i]!);
  return q.setFromRotationMatrix(_m);
};

/** Quart de tour autour d'un axe du monde, à partir de l'orientation actuelle. */
export const rotatedQuat = (c: Crate, axis: RotAxis, sign: 1 | -1): Quat => {
  const q = quatOf(c)
    .clone()
    .premultiply(_r.setFromAxisAngle(AXES[axis], (sign * Math.PI) / 2));
  return snapQuat(q).toArray() as Quat;
};

export type Extents = { fx: number; fy: number; fz: number };

/** Dimensions alignées sur le monde d'une caisse orientée, marge pad de chaque côté (armature métal par défaut). */
export const extents = (c: Crate, pad = PAD): Extents => {
  _m.makeRotationFromQuaternion(quatOf(c));
  const e = _m.elements;
  const s = crateDims(c);
  const local = [s.w + 2 * pad, s.h + 2 * pad, s.d + 2 * pad];
  const ext = [0, 0, 0];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) ext[row]! += Math.abs(e[col * 4 + row]!) * local[col]!;
  return { fx: ext[0]!, fy: ext[1]!, fz: ext[2]! };
};

export type Footprint = Extents & { x0: number; x1: number; z0: number; z1: number };

export const footprint = (c: Crate): Footprint => {
  const { fx, fy, fz } = extents(c);
  return { x0: c.x - fx / 2, x1: c.x + fx / 2, z0: c.z - fz / 2, z1: c.z + fz / 2, fx, fy, fz };
};

export const overlaps = (a: Footprint, b: Footprint, eps = 2 * PAD + 0.01): boolean =>
  a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps;
