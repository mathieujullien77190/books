/**
 * Placement des caisses, sans three.js ni état : emprise du groupe, gravité (empilement), aimantation
 * pendant un glissé, prochain cran d'une flèche de déplacement, caisses de départ, et désordre
 * déterministe des livres (tiré de leur id, jamais de hasard à chaque rendu).
 */
import { GRID_STEP, OUTLINE_PAD } from '@/constants';
import { snap, uid } from '@/helpers';
import type { Crate, CrateSize } from '@/types';

import { Q_DEBOUT, Q_TRANCHE, extents, footprint, overlaps } from './orientation';

export type Bounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
  cx: number;
  cz: number;
};

/** Générateur déterministe (graine = id) de nombres dans [-1, 1[. */
const seeded = (id: string): (() => number) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (): number => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967296) * 2 - 1; // [-1, 1[
  };
};

/** Décalage et rotation propres à un livre empilé à plat (déterministes : même id, même désordre). */
export const stackJitter = (id: string): { dr: number; df: number; yaw: number } => {
  const next = seeded(id);
  return { dr: next() * 0.08, df: next() * 0.05, yaw: next() * 0.05 };
};

/** Décalage et rotation propres à un livre de la pile « à côté » (déterministes, comme stackJitter). */
export const pileJitter = (id: string): { dx: number; dz: number; yaw: number } => {
  const next = seeded(id);
  return { dx: next() * 0.05, dz: next() * 0.075, yaw: next() * 0.125 };
};

/** Caisses de départ quand la base est vide et qu'il n'y a aucune ancienne sauvegarde. */
export const defaultCrates = (): Crate[] => {
  const mk = (size: CrateSize, x: number, z: number, q = Q_TRANCHE): Crate => ({
    id: uid(),
    size,
    q: q.slice() as Crate['q'],
    x,
    z,
    y: 0,
  });
  return [
    mk('L', 0, 0),
    mk('M', 2.85, 0),
    mk('L', -3.1, 0),
    mk('S', 0, 0),
    mk('M', -3.1, 0),
    mk('S', 5.2, 0, Q_DEBOUT),
  ];
};

/** Emprise du groupe de caisses (valeurs par défaut s'il n'y en a aucune). */
export const crateBounds = (crates: Crate[]): Bounds => {
  if (!crates.length) return { minX: -3, maxX: 3, minZ: -3, maxZ: 3, maxY: 3, cx: 0, cz: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxY = 0;
  for (const c of crates) {
    const fp = footprint(c);
    minX = Math.min(minX, fp.x0);
    maxX = Math.max(maxX, fp.x1);
    minZ = Math.min(minZ, fp.z0);
    maxZ = Math.max(maxZ, fp.z1);
    maxY = Math.max(maxY, c.y + fp.fy);
  }
  return { minX, maxX, minZ, maxZ, maxY, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
};

/** Gravité : chaque caisse repose sur le sol ou sur la plus haute caisse posée avant elle qu'elle chevauche. */
export const applyGravity = (crates: Crate[]): void => {
  const placed: { fp: ReturnType<typeof footprint>; top: number }[] = [];
  for (const c of crates) {
    const fp = footprint(c);
    let top = 0;
    for (const p of placed) if (overlaps(fp, p.fp)) top = Math.max(top, p.top);
    c.y = top;
    placed.push({ fp, top: top + fp.fy });
  }
};

/**
 * Aimantation : colle les bords de la caisse glissée aux bords des autres, sinon grille.
 * Contre une autre caisse, on se cale sur trois positions par axe : collée sur le côté → derrière,
 * milieu, devant ; collée devant ou derrière → gauche, milieu, droite ; posée dessus → les deux.
 */
export const magnet = (crates: Crate[], c: Crate, rawX: number, rawZ: number): [number, number] => {
  const { fx, fz } = extents(c);
  const TH = 0.45;
  const nearest = (raw: number, candidates: number[]): number =>
    candidates.reduce((best, v) => (Math.abs(v - raw) < Math.abs(best - raw) ? v : best));
  let bx = { v: snap(rawX), d: TH };
  let bz = { v: snap(rawZ), d: TH };
  // le cadre de sélection vient se poser sur les axes du repère (X : z = 0, Z : x = 0)
  const { fx: ox, fz: oz } = extents(c, OUTLINE_PAD);
  for (const v of [ox / 2, -ox / 2]) {
    const d = Math.abs(v - rawX);
    if (d < bx.d) bx = { v, d };
  }
  for (const v of [oz / 2, -oz / 2]) {
    const d = Math.abs(v - rawZ);
    if (d < bz.d) bz = { v, d };
  }
  const others = crates.filter((o) => o !== c).map((o) => ({ o, fp: footprint(o) }));
  for (const { o, fp } of others) {
    for (const v of [fp.x1 + fx / 2, fp.x0 - fx / 2, fp.x0 + fx / 2, fp.x1 - fx / 2, o.x]) {
      const d = Math.abs(v - rawX);
      if (d < bx.d) bx = { v, d };
    }
    for (const v of [fp.z1 + fz / 2, fp.z0 - fz / 2, fp.z0 + fz / 2, fp.z1 - fz / 2, o.z]) {
      const d = Math.abs(v - rawZ);
      if (d < bz.d) bz = { v, d };
    }
  }
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
  let x = bx.v;
  let z = bz.v;
  const contacts = others.map(({ o, fp }) => ({
    o,
    fp,
    sideX: near(bx.v, fp.x1 + fx / 2) || near(bx.v, fp.x0 - fx / 2),
    sideZ: near(bz.v, fp.z1 + fz / 2) || near(bz.v, fp.z0 - fz / 2),
    overlapZ: rawZ + fz / 2 > fp.z0 && rawZ - fz / 2 < fp.z1,
    overlapX: rawX + fx / 2 > fp.x0 && rawX - fx / 2 < fp.x1,
    xs: [fp.x0 + fx / 2, o.x, fp.x1 - fx / 2],
    zs: [fp.z0 + fz / 2, o.z, fp.z1 - fz / 2],
  }));
  // 1) contact latéral : prioritaire, c'est lui qui permet de glisser une caisse dans un trou
  let touching = false;
  for (const k of contacts) {
    // collée à gauche ou à droite : derrière (fonds alignés), milieu, devant (ouvertures alignées)
    if (k.sideX && k.overlapZ) {
      z = nearest(rawZ, k.zs);
      touching = true;
    }
    // collée devant ou derrière : bord gauche, milieu, bord droit
    if (k.sideZ && k.overlapX) {
      x = nearest(rawX, k.xs);
      touching = true;
    }
  }
  // 2) posée dessus (contact en Y) : seulement si aucun contact latéral, et si le centre de la caisse
  //    glissée est au-dessus de l'autre (un simple frôlement n'empêche pas de venir contre un flanc)
  if (!touching)
    for (const k of contacts) {
      const above = rawX > k.fp.x0 && rawX < k.fp.x1 && rawZ > k.fp.z0 && rawZ < k.fp.z1;
      if (!above) continue;
      x = nearest(rawX, k.xs);
      z = nearest(rawZ, k.zs);
    }
  return [Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000];
};

/**
 * Prochaine position d'une caisse sur un axe (x ou z) dans un sens : la prochaine position
 * « intéressante » (contact ou alignement avec une autre caisse, bord sur un axe) ou, à défaut,
 * un pas de grille.
 */
export const nextStepPosition = (
  crates: Crate[],
  c: Crate,
  axis: 'x' | 'z',
  sign: 1 | -1,
): number => {
  const cur = axis === 'x' ? c.x : c.z;
  const { fx, fz } = extents(c);
  const half = axis === 'x' ? fx / 2 : fz / 2;
  const { fx: ox, fz: oz } = extents(c, OUTLINE_PAD);
  const candidates = [snap(cur) + GRID_STEP, snap(cur) - GRID_STEP, snap(cur)];
  candidates.push(axis === 'x' ? ox / 2 : oz / 2, axis === 'x' ? -ox / 2 : -oz / 2);
  for (const o of crates) {
    if (o === c) continue;
    const fp = footprint(o);
    const [lo, hi, mid] = axis === 'x' ? [fp.x0, fp.x1, o.x] : [fp.z0, fp.z1, o.z];
    candidates.push(hi + half, lo - half, lo + half, hi - half, mid);
  }
  let best: number | null = null;
  for (const v of candidates) {
    if (sign * (v - cur) <= 1e-3) continue;
    if (best === null || Math.abs(v - cur) < Math.abs(best - cur)) best = v;
  }
  return Math.round((best ?? cur + sign * GRID_STEP) * 1000) / 1000;
};
