/**
 * Boucle d'animation : à chaque image, avance le livre sorti, le défilé des manquants, la mésange et
 * les livres vers leur cible (interpolation), signale à la scène ce qui a changé (`touch`) puis
 * demande le rendu à la demande. Parle au moteur par `LoopHost`.
 */
import * as THREE from 'three';

import type { Id } from '@/types';

import type { BookRig } from './books';
import { BirdLabel } from './birdLabel';
import { NEIGHBOR_SCALE } from './constants';
import type { Decor } from './decor';
import type { MissingPile } from './missingPile';
import type { Stage } from './stage';
import type { Showcase } from './view';

export type LoopHost = {
  stage: Stage;
  showcase: Showcase;
  missing: MissingPile;
  decor: Decor;
  canvas: HTMLCanvasElement;
  bookRigs: Map<Id, BookRig>;
  openId: () => Id | null;
  openBack: () => boolean;
  /** Écran en portrait (téléphone) : un seul livre est présenté. */
  isPortrait: () => boolean;
  finishExit: () => void;
  hovered: () => BookRig | null;
  updateHover: () => void;
};

export class RenderLoop {
  readonly birdLabel = new BirdLabel();
  private readonly timer = new THREE.Timer();
  private readonly tv = new THREE.Vector3();
  private lastBirdFrame = 0;
  private raf = 0;
  private stopped = false;

  constructor(private readonly host: LoopHost) {}

  start(): void {
    this.tick();
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
  }

  private readonly tick = (): void => {
    if (this.stopped) return;
    const { stage, showcase, missing, decor, bookRigs } = this.host;
    const { camera } = stage;
    const openId = this.host.openId();
    const portrait = this.host.isPortrait();
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const k = 1 - Math.exp(-dt * 7);
    showcase.update(
      camera,
      openId ? bookRigs.get(openId) : undefined,
      bookRigs,
      this.host.openBack(),
      portrait,
      this.host.finishExit,
    );
    missing.updateCamera(camera, stage.controls.target, k);
    decor.update(dt, this.timer.getElapsed());
    // la mésange s'anime en continu : une image sur deux environ suffit (jamais si elle est cachée)
    const now = performance.now();
    if (decor.group?.visible && now - this.lastBirdFrame > 50) {
      this.lastBirdFrame = now;
      stage.touchFrame(); // pas touch : la mésange seule ne change pas les ombres
    }
    const hovered = this.host.hovered();
    for (const rig of bookRigs.values()) {
      this.tv.copy(rig.target);
      if (rig === hovered && rig.id !== openId) this.tv.y += 0.15;
      const s = openId && !portrait && showcase.neighbors.includes(rig.id) ? NEIGHBOR_SCALE : 1;
      // un livre encore en mouvement (position, rotation ou taille) demande une nouvelle image
      if (
        rig.mesh.position.distanceToSquared(this.tv) > 1e-8 ||
        1 - Math.abs(rig.mesh.quaternion.dot(rig.quat)) > 1e-9 ||
        Math.abs(rig.mesh.scale.x - s) > 1e-5
      )
        stage.touch();
      rig.mesh.position.lerp(this.tv, k);
      rig.mesh.quaternion.slerp(rig.quat, k);
      rig.mesh.scale.setScalar(rig.mesh.scale.x + (s - rig.mesh.scale.x) * k);
    }
    this.host.updateHover();
    stage.controls.update();
    if (camera.position.y < 0.25) camera.position.y = 0.25; // jamais sous le sol
    this.birdLabel.place(decor.group, !!openId, camera, this.host.canvas);
    stage.draw(!!openId);
    this.raf = requestAnimationFrame(this.tick);
  };
}
