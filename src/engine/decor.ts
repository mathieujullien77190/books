/**
 * Décor : la mésange perchée sur une caisse (position de base + décalage réglable en Édition avec
 * les flèches, sauvé en base dans `DecorState`) et le gizmo de déplacement qui l'entoure.
 */
import type * as THREE from 'three';

import { crateLabels } from '@/helpers';
import type { Crate, DecorState, Id, Mode, RotAxis } from '@/types';

import {
  MESANGE_MARGIN,
  MESANGE_PERCH,
  MESANGE_REACH,
  MESANGE_SINK,
  MESANGE_STEP,
} from './constants';
import { disposeGroup } from './materials';
import { loadMesange, type Mesange } from './mesange';
import { buildMoveGizmo, type MoveGizmo } from './moveGizmo';
import { extents } from './orientation';

export class Decor {
  /** Décalage de la mésange par rapport à son perchoir (sauvé en base avec le reste). */
  state: DecorState = { mesange: { dx: 0, dy: 0, dz: 0 } };
  /** La mésange est sélectionnée en Édition : ses flèches sont affichées. */
  selected = false;
  readonly gizmo: MoveGizmo = buildMoveGizmo();
  private bird: Mesange | null = null;

  /** Le modèle 3D de la mésange, une fois chargé. */
  get group(): THREE.Group | null {
    return this.bird?.group ?? null;
  }

  /** Charge le modèle de la mésange et l'ajoute à la scène ; `onReady` : il reste à la poser. */
  loadBird(scene: THREE.Scene, isDisposed: () => boolean, onReady: () => void): void {
    void loadMesange().then((bird) => {
      if (!bird) return;
      if (isDisposed()) return disposeGroup(bird.group);
      this.bird = bird;
      scene.add(bird.group);
      onReady();
    });
  }

  /** La mésange est perchée sur le coin avant droit de la caisse `MESANGE_PERCH` et la suit si on la déplace. */
  place(
    crates: Crate[],
    ctx: { selectedId: Id | null; mode: Mode; openId: Id | null; lite?: boolean },
  ): void {
    const bird = this.bird;
    if (!bird) return;
    const labels = crateLabels(crates);
    const perch = crates.find((c) => labels.get(c.id) === MESANGE_PERCH);
    bird.group.visible = !!perch && !ctx.lite; // pas de mésange en mode léger
    this.gizmo.group.visible = false;
    if (!perch) return;
    // coin avant droit du dessus (le plus proche de l'observateur : la vue est de face, vers +Z)
    const { fx, fy, fz } = extents(perch, 0);
    const m = this.state.mesange;
    bird.group.position.set(
      perch.x + fx / 2 - MESANGE_MARGIN + m.dx,
      perch.y + fy - MESANGE_SINK + m.dy,
      perch.z + fz / 2 - MESANGE_MARGIN + m.dz,
    );
    // flèches de déplacement autour de la mésange sélectionnée (comme celles d'une caisse)
    if (ctx.selectedId) this.selected = false;
    this.gizmo.group.visible = this.selected && ctx.mode === 'edit' && !ctx.openId;
    if (this.gizmo.group.visible) {
      this.gizmo.group.position.copy(bird.group.position).y += MESANGE_REACH.y / 2;
      this.gizmo.fit(MESANGE_REACH.x, MESANGE_REACH.y, MESANGE_REACH.z);
      this.gizmo.setVertical(true, true);
    }
  }

  /** Déplace la mésange d'un cran le long d'un axe du monde (l'appelant la replace). */
  step(axis: RotAxis, sign: 1 | -1): void {
    const m = this.state.mesange;
    const key = axis === 'x' ? 'dx' : axis === 'y' ? 'dy' : 'dz';
    m[key] = Math.round((m[key] + sign * MESANGE_STEP) * 1000) / 1000;
  }

  /** Flèche du gizmo touchée par le rayon (axe et sens), ou null. */
  hitArrow(raycaster: THREE.Raycaster): { axis: RotAxis; sign: 1 | -1 } | null {
    const hd = raycaster.intersectObjects(this.gizmo.activeHits(), false)[0];
    return hd ? (hd.object.userData as { axis: RotAxis; sign: 1 | -1 }) : null;
  }

  /** Le rayon touche la mésange (visible). */
  hitsBird(raycaster: THREE.Raycaster): boolean {
    const g = this.bird?.group;
    return !!g?.visible && raycaster.intersectObject(g, true).length > 0;
  }

  /** Animation, à appeler à chaque image. */
  update(dt: number, t: number): void {
    if (this.bird?.group.visible) this.bird.update(dt, t);
  }

  /** Retire la mésange de la scène et libère ses ressources. */
  disposeBird(scene: THREE.Scene): void {
    if (!this.bird) return;
    scene.remove(this.bird.group);
    disposeGroup(this.bird.group);
  }
}
