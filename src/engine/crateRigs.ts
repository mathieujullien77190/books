/**
 * Rigs des caisses dans la scène : création et retrait des maillages, pose (gravité, étiquettes,
 * orientation), surbrillance, et aides de l'Édition (repère, grille, flèches de rotation et de
 * déplacement autour de la caisse sélectionnée). Les caisses elles-mêmes restent l'état du moteur.
 */
import type * as THREE from 'three';

import { crateDims, crateLabels } from '@/helpers';
import type { Crate, Id } from '@/types';

import { applyGravity } from './cratePlacement';
import { buildCrate, forgetCrateLabel, setCrateLabel, uprightLabel, type CrateRig } from './crate';
import type { Domain } from './domain';
import { disposeGroup } from './materials';
import { buildMoveGizmo, type MoveGizmo } from './moveGizmo';
import { extents, footprint, overlaps, quatOf } from './orientation';
import { buildRotateGizmo, type RotateGizmo } from './rotateGizmo';
import { buildGrid, buildWorldAxes, type WorldAxes } from './worldAxes';

/** Ce que les rigs de caisses demandent au moteur. */
export type CrateRigsHost = {
  domain: Domain;
  openId: () => Id | null;
  /** Mode léger : les livres seuls, sans caisses. */
  lite: () => boolean;
};

export class CrateRigs {
  readonly rigs = new Map<Id, CrateRig>();
  readonly hitboxes: THREE.Mesh[] = [];
  readonly rotGizmo: RotateGizmo = buildRotateGizmo();
  readonly moveGizmo: MoveGizmo = buildMoveGizmo();
  private readonly axes: WorldAxes = buildWorldAxes();
  private readonly grid: THREE.GridHelper = buildGrid();
  /** Caisse mise en surbrillance quand on survole sa place dans la fiche du livre sorti. */
  hintId: Id | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly host: CrateRigsHost,
  ) {
    this.setEditing(host.domain.mode === 'edit');
    scene.add(this.grid, this.axes.group);
    scene.add(this.rotGizmo.group, this.moveGizmo.group);
  }

  /** Repère et grille ne se voient qu'en Édition. */
  setEditing(on: boolean): void {
    this.grid.visible = on;
    this.axes.group.visible = on;
  }

  /** Met une caisse en surbrillance (survol de sa place dans la fiche), ou l'éteint avec null. */
  hint(id: Id | null): void {
    if (this.hintId === id) return;
    this.hintId = id;
    const { selectedId } = this.host.domain;
    for (const rig of this.rigs.values())
      rig.outline.visible = rig.id === selectedId || rig.id === id;
  }

  private ensure(c: Crate): CrateRig {
    let rig = this.rigs.get(c.id);
    const dims = crateDims(c);
    const key = `${dims.w}|${dims.h}|${dims.d}`;
    if (rig && (rig.size !== c.size || rig.dimsKey !== key)) {
      this.remove(c.id);
      rig = undefined;
    }
    if (!rig) {
      rig = buildCrate(c.id, c.size, dims);
      rig.group.visible = !this.host.lite(); // mode léger : les livres seuls, sans caisses
      this.scene.add(rig.group);
      this.rigs.set(c.id, rig);
      this.hitboxes.push(rig.hit);
    }
    return rig;
  }

  remove(id: Id): void {
    const rig = this.rigs.get(id);
    if (!rig) return;
    forgetCrateLabel(rig);
    disposeGroup(rig.group);
    this.scene.remove(rig.group);
    this.rigs.delete(id);
    const i = this.hitboxes.indexOf(rig.hit);
    if (i >= 0) this.hitboxes.splice(i, 1);
  }

  /** Gravité : chaque caisse repose sur le sol ou sur la plus haute caisse posée avant elle qu'elle chevauche. */
  place(): void {
    const { host } = this;
    const { crates, selectedId, mode } = host.domain;
    applyGravity(crates);
    const labels = crateLabels(crates);
    for (const c of crates) {
      const fp = footprint(c);
      const rig = this.ensure(c);
      setCrateLabel(rig, labels.get(c.id) ?? '');
      rig.group.position.set(c.x, c.y + fp.fy / 2, c.z);
      rig.group.quaternion.copy(quatOf(c));
      uprightLabel(rig, rig.group.quaternion);
      rig.outline.visible = c.id === selectedId || c.id === this.hintId;
      rig.group.updateMatrixWorld(true);
    }
    // les axes du repère couvrent juste les caisses posées (marge 5 cm), lettre au bout positif
    const bb = host.domain.bounds();
    this.axes.setExtent('x', Math.min(bb.minX, 0) - 0.5, Math.max(bb.maxX, 0) + 0.5);
    this.axes.setExtent('z', Math.min(bb.minZ, 0) - 0.5, Math.max(bb.maxZ, 0) + 0.5);
    this.axes.setExtent('y', 0, Math.max(bb.maxY, 1) + 0.5);
    // flèches de rotation autour de la caisse sélectionnée (masquées pendant la lecture d'un livre)
    const sel = selectedId ? crates.find((c) => c.id === selectedId) : undefined;
    const selRig = sel && this.rigs.get(sel.id);
    this.rotGizmo.group.visible = !!selRig && !host.openId() && mode === 'edit';
    this.moveGizmo.group.visible = this.rotGizmo.group.visible;
    if (sel && selRig) {
      const { fx, fy, fz } = extents(sel);
      this.rotGizmo.group.position.copy(selRig.group.position);
      this.rotGizmo.fit(Math.hypot(fx, fy, fz) / 2 + 0.15);
      this.moveGizmo.group.position.copy(selRig.group.position);
      this.moveGizmo.fit(fx, fy, fz);
      // monter seulement s'il y a une caisse au-dessus (elle redescend à sa place) ; jamais descendre :
      // ça déplacerait les caisses du dessous, interdit
      const fps = footprint(sel);
      const above = crates.some((o) => o !== sel && o.y > sel.y && overlaps(fps, footprint(o)));
      this.moveGizmo.setVertical(above, false);
    }
  }

  dispose(): void {
    for (const id of [...this.rigs.keys()]) this.remove(id);
    disposeGroup(this.rotGizmo.group);
    disposeGroup(this.moveGizmo.group);
    this.scene.remove(this.rotGizmo.group, this.moveGizmo.group);
  }
}
