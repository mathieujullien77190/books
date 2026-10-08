import * as THREE from 'three';

import { createLegPlanter } from './legs';

/**
 * Comportement de la mésange, repris de l'atelier lowpoly (customRigTick) : elle reste sur son perchoir
 * (pas de marche) et alterne regard par saccades, coups de queue, picotis,
 * inclinaisons du corps et pépiements (bec ouvert).
 * Nœuds pilotés par leur nom (tous facultatifs) : body, head, jaw, tail, wingL, wingR,
 * thighL/R, shinL/R, footL/R.
 */

type Mode = 'idle' | 'peck';

/** Générateur pseudo-aléatoire à graine (mulberry32) : même comportement à chaque chargement. */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const smooth = (x: number) => x * x * (3 - 2 * x);

type Leg = { thigh?: THREE.Object3D; shin?: THREE.Object3D; foot?: THREE.Object3D };

export const createMesangeAnimator = (
  root: THREE.Object3D,
  seed = 1234,
): ((dt: number, t: number) => void) => {
  const rnd = seeded(seed);
  const get = (n: string) => root.getObjectByName(n) ?? undefined;
  const body = get('body');
  const head = get('head');
  const jaw = get('jaw');
  const tail = get('tail');
  const wings = ['wingL', 'wingR'].map(get).filter((o): o is THREE.Object3D => !!o);
  const legs: Leg[] = ['L', 'R'].map((s) => ({
    thigh: get('thigh' + s),
    shin: get('shin' + s),
    foot: get('foot' + s),
  }));
  const baseY = body?.position.y ?? 0;
  const axisOf = (w: THREE.Object3D) => {
    const a = w.userData.axis as number[] | undefined;
    return a && a.length === 3
      ? new THREE.Vector3(a[0], a[1], a[2]).normalize()
      : new THREE.Vector3(0, 0, -1);
  };
  const wingAxes = wings.map(axisOf);
  if (body) body.rotation.order = 'YXZ';
  const plantFeet = createLegPlanter(root, legs);

  let mode: Mode = 'idle';
  let timer = 2 + rnd() * 3;
  let calm = false;
  let peckT = 0;
  let lookT = 0;
  let lookY = 0;
  let lookX = 0;
  let lookZ = 0;
  let flick = 0;
  let flickT = 1;
  let leanT = 1;
  let lean = 0;
  const ph = rnd() * 6.28;

  return (dt, t) => {
    dt = Math.min(dt, 0.1);
    const k = (rate: number) => Math.min(1, dt * rate);

    leanT -= dt;
    if (leanT <= 0) {
      leanT = 2.5 + rnd() * 5;
      lean = calm || rnd() < 0.45 ? 0 : (rnd() < 0.5 ? -1 : 1) * (0.15 + rnd() * 0.2);
    }
    let pitch = 0;
    let headX = 0;
    let open = 0;
    let tailX = 0.1;
    let headY: number | null = null;
    let snap = 22;

    // Saccades du regard : nouvelle direction toutes les 0,15 à 0,6 s (périodes calmes plus lentes).
    lookT -= dt;
    if (lookT <= 0) {
      const amp = calm ? 0.5 : 1;
      lookT = calm ? 2 + rnd() * 3 : 0.8 + rnd() * 1.8;
      lookY = (rnd() - 0.5) * 1.8 * amp;
      lookX = (rnd() - 0.5) * 0.5 * amp;
      lookZ = (rnd() - 0.5) * 0.35 * amp;
    }
    // Coups de queue secs.
    flickT -= dt;
    if (flickT <= 0) {
      flickT = 2.5 + rnd() * 5;
      if (!calm) flick = 1;
    }
    flick = Math.max(0, flick - dt * 6);
    tailX += 0.35 * flick;

    timer -= dt;
    if (mode === 'idle') {
      if (!calm && t % 16 < 0.5)
        open = 0.6 * Math.pow(Math.max(0, Math.sin(2 * Math.PI * 6 * t)), 1.5); // pépie
      if (timer <= 0) {
        const r = rnd();
        calm = false;
        if (r < 0.6) {
          calm = true;
          timer = 3 + rnd() * 6;
        } else {
          mode = 'peck';
          peckT = 0;
          timer = 0.55;
        }
      }
    } else {
      // Picore : plonge, coup de bec, relève la tête.
      peckT += dt;
      const q = Math.min(1, peckT / 0.55);
      const e0 = q < 0.3 ? q / 0.3 : q < 0.45 ? 1 : q < 0.7 ? 1 - (q - 0.45) / 0.25 : 0;
      const e = smooth(e0);
      pitch = 0.4 * e;
      headX = 0.95 * e - 0.25 * (1 - e);
      tailX = 0.1 + 0.3 * e;
      headY = e > 0.3 ? 0 : null;
      snap = 30;
      if (e > 0.8) open = (e - 0.8) / 0.2;
      if (timer <= 0) {
        mode = 'idle';
        timer = 2 + rnd() * 4;
      }
    }

    let rz = 0;
    if (body) {
      body.position.y = baseY; // jamais de rebond : les pattes restent posées sur la caisse
      body.rotation.x += (pitch - body.rotation.x) * k(16);
      body.rotation.z += ((mode === 'idle' ? lean : 0) - body.rotation.z) * k(7);
      rz = body.rotation.z;
    }
    // les pattes restent posées : seules la cuisse et la jambe pivotent par leurs rotules
    plantFeet();
    if (tail) {
      tail.rotation.x += (tailX - tail.rotation.x) * k(14);
      const hy = head ? head.rotation.y : 0;
      tail.rotation.y += (-0.9 * rz + 0.3 * hy - tail.rotation.y) * k(8); // la queue suit un peu le regard
    }
    if (head) {
      const kk = k(snap);
      head.rotation.y += ((headY ?? lookY) - head.rotation.y) * kk;
      head.rotation.x += (headX + (headY == null ? lookX : 0) - head.rotation.x) * kk;
      head.rotation.z += ((headY == null ? lookZ : 0) - head.rotation.z) * kk;
    }
    if (jaw) jaw.rotation.x = 0.4 * open;
    const spread =
      0.12 * Math.abs(head?.rotation.y ?? 0) + 0.02 * Math.max(0, Math.sin(t * 2.3 + ph));
    wings.forEach((w, i) => {
      const side = (w.userData.side as number | undefined) ?? (w.name === 'wingL' ? -1 : 1);
      w.quaternion.setFromAxisAngle(wingAxes[i], -side * spread);
    });
  };
};
