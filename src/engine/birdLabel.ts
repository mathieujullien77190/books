/**
 * Étiquette HTML collée à côté de la mésange : déplacée à chaque image par le moteur, sans passer par
 * React. Cachée si la mésange l'est ou si un livre est sorti.
 */
import * as THREE from 'three';

export class BirdLabel {
  private el: HTMLElement | null = null;
  private readonly box = new THREE.Box3();
  private readonly point = new THREE.Vector3();

  attach(el: HTMLElement | null): void {
    this.el = el;
  }

  /** Colle l'étiquette à la position écran de la mésange (`bird` : son modèle 3D, s'il est chargé). */
  place(
    bird: THREE.Object3D | null,
    hidden: boolean,
    camera: THREE.Camera,
    canvas: HTMLCanvasElement,
  ): void {
    const el = this.el;
    if (!el) return;
    if (!bird?.visible || hidden) {
      el.style.opacity = '0';
      el.style.visibility = 'hidden'; // le lien qu'elle contient ne doit plus être cliquable
      return;
    }
    // la tête est le haut de l'oiseau perché : sommet de sa boîte englobante, légèrement en dessous
    const box = this.box.setFromObject(bird);
    const p = box.getCenter(this.point);
    p.y = box.max.y - (box.max.y - box.min.y) * 0.08;
    p.project(camera);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    el.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px)`;
    const shown = p.z < 1;
    el.style.opacity = shown ? '1' : '0';
    el.style.visibility = shown ? 'visible' : 'hidden';
  }
}
