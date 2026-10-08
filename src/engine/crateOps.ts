/**
 * Modifications des caisses demandées par l'interface ou par les gestes : ajout, retrait, taille,
 * réglages (à plat, dépassement, cotes), rotation et déplacement d'un cran. Chacune empile l'état
 * dans l'historique puis demande un `refresh` au moteur, qui reste propriétaire des caisses.
 */
import { PAD, SIZES } from '@/constants';
import { uid } from '@/helpers';
import type { Crate, CrateSize, Dims, Id, RotAxis } from '@/types';

import { nextStepPosition } from './cratePlacement';
import type { Domain } from './domain';
import { Q_TRANCHE, rotatedQuat } from './orientation';

export type CrateOpsHost = {
  domain: Domain;
  /** Retire le rig de la caisse supprimée. */
  removeRig: (id: Id) => void;
  refresh: () => void;
  recenter: () => void;
};

export class CrateOps {
  constructor(private readonly host: CrateOpsHost) {}

  private find(id: Id): Crate | undefined {
    return this.host.domain.crate(id);
  }

  add(size: CrateSize): void {
    const h = this.host;
    const d = h.domain;
    d.pushHistory();
    const s = SIZES[size];
    const bb = d.bounds();
    const { crates } = d;
    // nouvelle caisse derrière l'axe X (face avant sur l'axe), à droite du groupe ; la première au coin
    const c: Crate = {
      id: uid(),
      size,
      q: Q_TRANCHE.slice() as Crate['q'],
      x: crates.length ? bb.maxX + s.w / 2 + PAD : s.w / 2 + PAD,
      z: -(s.d / 2 + PAD),
      y: 0,
      dims: size === 'X' ? { w: s.w, h: s.h, d: s.d } : undefined,
    };
    crates.push(c);
    d.selectedId = c.id;
    h.refresh();
    h.recenter(); // la nouvelle caisse est posée à droite du groupe, parfois hors champ
  }

  remove(id: Id): void {
    const h = this.host;
    const d = h.domain;
    d.pushHistory();
    d.crates = d.crates.filter((c) => c.id !== id);
    h.removeRig(id);
    if (d.selectedId === id) d.selectedId = null;
    for (const b of d.books) if (b.crate === id) b.crate = null;
    h.refresh();
  }

  setSize(id: Id, size: CrateSize): void {
    const c = this.find(id);
    if (!c || c.size === size) return;
    this.host.domain.pushHistory();
    c.size = size;
    if (size === 'X' && !c.dims) c.dims = { ...SIZES.X };
    this.host.refresh();
  }

  /** Livres debout ou à plat dans cette caisse. */
  setFlat(id: Id, flat: boolean): void {
    const c = this.find(id);
    if (!c || !!c.flat === flat) return;
    this.host.domain.pushHistory();
    c.flat = flat;
    this.host.refresh();
  }

  /** Les livres plus profonds que la caisse y sont admis et dépassent devant. */
  setOverhang(id: Id, overhang: boolean): void {
    const c = this.find(id);
    if (!c || !!c.overhang === overhang) return;
    this.host.domain.pushHistory();
    c.overhang = overhang || undefined;
    this.host.refresh();
  }

  /** Cotes d'une caisse transparente (unités scène). */
  setDims(id: Id, dims: Dims): void {
    const c = this.find(id);
    if (!c || c.size !== 'X') return;
    this.host.domain.pushHistory();
    c.dims = { ...dims };
    this.host.refresh();
  }

  rotate(id: Id, axis: RotAxis, sign: 1 | -1): void {
    const c = this.find(id);
    if (!c) return;
    this.host.domain.pushHistory();
    c.q = rotatedQuat(c, axis, sign);
    this.host.refresh();
  }

  /**
   * Déplace la caisse d'un cran dans un sens : jusqu'à la prochaine position « intéressante »
   * (contact ou alignement avec une autre caisse, bord sur un axe) ou, à défaut, d'un pas de grille.
   * Sur l'axe vertical : vers le haut seulement, la caisse passe au sommet de sa pile.
   */
  step(id: Id, axis: RotAxis, sign: 1 | -1): void {
    const h = this.host;
    const c = this.find(id);
    if (!c || (axis === 'y' && sign < 0)) return;
    h.domain.pushHistory();
    const { crates } = h.domain;
    if (axis === 'y') {
      crates.splice(crates.indexOf(c), 1);
      crates.push(c);
      h.refresh();
      return;
    }
    const next = nextStepPosition(crates, c, axis, sign);
    if (axis === 'x') c.x = next;
    else c.z = next;
    // ordre d'empilement inchangé : la caisse glisse à son niveau, elle ne passe pas au-dessus des autres
    h.refresh();
  }
}
