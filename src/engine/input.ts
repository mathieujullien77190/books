/**
 * Saisie : pointeur (clic, glisser de caisse, pincement), survol (infobulle, curseur) et clavier
 * (Échap, flèches, Ctrl+Z, Suppr). Possède l'état des gestes en cours ; tout ce qui touche au
 * domaine (caisses, livres, sélection) passe par `InputHost`, fourni par le moteur.
 * L'ordre des tests au clic compte : flèches, papier / tas manquants, mésange, livre, caisse.
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { Book, Crate, Id, Mode, RotAxis } from '@/types';

import type { BookRig } from './books';
import { magnet } from './cratePlacement';
import type { Decor } from './decor';
import type { MissingPile } from './missingPile';
import type { MoveGizmo } from './moveGizmo';
import { AXES } from './orientation';
import type { RotateGizmo } from './rotateGizmo';

type Drag = {
  c: Crate;
  dx: number;
  dz: number;
  plane: number;
  moved: boolean;
  sx: number;
  sy: number;
};
/** Geste en cours sur un livre : un livre ne se déplace jamais, seulement un clic (ouvrir / sélectionner). */
type DragBook = {
  b: Book;
  /** Le geste a dépassé le seuil de glisser : ce n'est plus un clic. */
  dragged: boolean;
  sx: number;
  sy: number;
};

/** Ce que la saisie lit et déclenche dans le moteur. */
export type InputHost = {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  hitboxes: THREE.Mesh[];
  rotGizmo: RotateGizmo;
  moveGizmo: MoveGizmo;
  decor: Decor;
  missing: MissingPile;
  // état lu à la demande
  mode: () => Mode;
  selectedId: () => Id | null;
  /** Change la sélection sans rafraîchir (l'appelant rafraîchit ensuite). */
  setSelected: (id: Id | null) => void;
  openId: () => Id | null;
  neighbors: () => [Id | null, Id | null];
  crates: () => Crate[];
  crateById: (id: Id) => Crate | undefined;
  bookById: (id: Id) => Book | undefined;
  bookRigById: (id: Id) => BookRig | undefined;
  /** Maillages des livres visibles (cibles du rayon). */
  bookMeshes: () => THREE.Object3D[];
  // actions
  stepCrate: (id: Id, axis: RotAxis, sign: 1 | -1) => void;
  rotateCrate: (id: Id, axis: RotAxis, sign: 1 | -1) => void;
  stepMesange: (axis: RotAxis, sign: 1 | -1) => void;
  browseMissing: () => void;
  stepMissing: (dir: 1 | -1) => void;
  endMissingBrowse: () => void;
  openBook: (id: Id) => void;
  closeBook: (refresh?: boolean) => void;
  flipBook: () => void;
  undo: () => void;
  removeCrate: (id: Id) => void;
  focusCrate: (id: Id) => void;
  pushHistory: () => void;
  refresh: () => void;
  emit: () => void;
  /** Replace les caisses et re-range les livres (pendant un glissé). */
  relayout: () => void;
};

const isTyping = (): boolean => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');

export class PointerInput {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(2, 2);
  private readonly _hitP = new THREE.Vector3();
  private readonly _plane = new THREE.Plane();
  private tooltip: HTMLElement | null = null;
  /** Livre survolé (il se soulève un peu, son titre s'affiche en infobulle). */
  hovered: BookRig | null = null;
  private drag: Drag | null = null;
  private dragBook: DragBook | null = null;
  private downEmpty: [number, number] | null = null;
  /** Caisse sous le pointeur au clic en lecture : un clic simple zoome dessus. */
  private downCrate: Id | null = null;
  private crateClickZoom = true;
  /** Appelé quand on tente de déplacer un livre en Lecture. */
  private onEditDenied: (() => void) | null = null;
  /** Doigts actuellement posés : à deux, c'est un pincement (zoom), jamais un clic sur un livre. */
  private readonly touchIds = new Set<number>();

  constructor(private readonly h: InputHost) {
    this.raycaster.layers.enableAll();
  }

  /** Livre tenu par un geste en cours (il garde sa place dans le rangement). */
  get heldBook(): Book | null {
    return this.dragBook?.b ?? null;
  }

  /** Branche les écouteurs sur le canevas et la fenêtre. */
  attach(): void {
    const c = this.h.canvas;
    c.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointercancel', this.onPointerUp);
    c.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('keydown', this.onKeyDown);
  }

  detach(): void {
    const c = this.h.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  /** Élément HTML de l'infobulle (titre du livre survolé), positionné ici. */
  attachTooltip(el: HTMLElement | null): void {
    this.tooltip = el;
  }

  /** Un clic sur une caisse zoome dessus (désactivé sur téléphone : on zoome au pincement). */
  setCrateClickZoom(on: boolean): void {
    this.crateClickZoom = on;
  }

  /** Fonction appelée quand un geste cherche à modifier la bibliothèque en Lecture (null : rien). */
  setEditDeniedHandler(handler: (() => void) | null): void {
    this.onEditDenied = handler;
  }

  private setPointer(e: PointerEvent): void {
    const r = this.h.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  private groundPoint(y: number): THREE.Vector3 | null {
    this._plane.set(AXES.y, -y);
    return this.raycaster.ray.intersectPlane(this._plane, this._hitP);
  }

  /** Abandonne le geste en cours sur un livre ou une caisse et rend la main à la caméra (pincement). */
  private cancelGesture(): void {
    this.dragBook = null;
    this.drag = null;
    this.downEmpty = null;
    this.downCrate = null;
    this.h.controls.enabled = true;
    this.h.canvas.style.cursor = '';
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    const h = this.h;
    if (e.button !== 0) return;
    if (e.pointerType === 'touch') {
      this.touchIds.add(e.pointerId);
      if (this.touchIds.size > 1) {
        // deuxième doigt : on lâche le livre ou la caisse visés par le premier, la caméra zoome
        this.cancelGesture();
        return;
      }
    }
    this.setPointer(e);
    this.raycaster.setFromCamera(this.pointer, h.camera);
    // flèches : déplacement d'un cran, ou quart de tour dans le sens de la flèche
    const sel = h.selectedId();
    if (h.mode() === 'edit' && h.rotGizmo.group.visible && sel) {
      const hm = this.raycaster.intersectObjects(h.moveGizmo.activeHits(), false)[0];
      if (hm) {
        const { axis, sign } = hm.object.userData as { axis: RotAxis; sign: 1 | -1 };
        h.stepCrate(sel, axis, sign);
        return;
      }
      const hr = this.raycaster.intersectObjects(h.rotGizmo.hits, false)[0];
      if (hr) {
        const { axis, sign } = hr.object.userData as { axis: RotAxis; sign: 1 | -1 };
        h.rotateCrate(sel, axis, sign);
        return;
      }
    }
    // papier « Livres à acheter » : un clic ouvre la liste des tomes manquants
    if (!h.openId() && h.missing.hitsNote(this.raycaster)) {
      h.browseMissing();
      return;
    }
    // un livre manquant du tas : un clic le montre en gros plan, comme le défilé
    if (!h.openId()) {
      const idx = h.missing.hitIndex(this.raycaster);
      if (idx >= 0) {
        h.closeBook(false);
        h.missing.show(idx);
        h.emit();
        return;
      }
    }
    // mésange (Édition) : ses flèches déplacent d'un cran, un clic sur elle la sélectionne
    if (h.mode() === 'edit' && h.decor.gizmo.group.visible) {
      const hd = h.decor.hitArrow(this.raycaster);
      if (hd) {
        h.stepMesange(hd.axis, hd.sign);
        return;
      }
    }
    if (h.mode() === 'edit' && !h.openId() && h.decor.hitsBird(this.raycaster)) {
      h.setSelected(null);
      h.decor.selected = true;
      h.refresh();
      return;
    }
    // livre d'abord
    const hb = this.raycaster.intersectObjects(h.bookMeshes(), false)[0];
    if (hb) {
      const id = hb.object.userData.id as Id;
      // voisin présenté à côté du livre sorti : un clic l'ouvre à son tour
      if (h.openId() && h.neighbors().includes(id)) {
        h.openBook(id);
        return;
      }
      // le livre sorti ne se déplace plus : un clic dessus le retourne (couverture ↔ dos)
      if (id === h.openId()) {
        h.flipBook();
        return;
      }
      const b = h.bookById(id);
      const rig = h.bookRigById(id);
      if (b && rig) {
        this.dragBook = { b, dragged: false, sx: e.clientX, sy: e.clientY };
        // au doigt, la caméra reste active : sinon un pincement posé sur un livre ne zoomerait pas
        if (e.pointerType !== 'touch') {
          h.controls.enabled = false;
          h.canvas.setPointerCapture(e.pointerId);
        }
        return;
      }
    }
    const hit = this.raycaster.intersectObjects(h.hitboxes, false)[0];
    if (!hit || h.mode() === 'view') {
      this.downEmpty = [e.clientX, e.clientY];
      this.downCrate = hit && this.crateClickZoom ? (hit.object.userData.id as Id) : null;
      return;
    }
    const c = h.crateById(hit.object.userData.id as Id);
    if (!c) return;
    const gp = this.groundPoint(c.y);
    this.drag = {
      c,
      dx: gp ? c.x - gp.x : 0,
      dz: gp ? c.z - gp.z : 0,
      plane: c.y,
      moved: false,
      sx: e.clientX,
      sy: e.clientY,
    };
    h.controls.enabled = false;
    h.canvas.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const h = this.h;
    this.setPointer(e);
    if (this.tooltip) {
      this.tooltip.style.left = `${e.clientX}px`;
      this.tooltip.style.top = `${e.clientY}px`;
    }
    const db = this.dragBook;
    if (db) {
      // un livre ne se déplace pas : un glisser est signalé une fois (« pas touche ») et ignoré
      if (!db.dragged && Math.hypot(e.clientX - db.sx, e.clientY - db.sy) >= 5) {
        db.dragged = true;
        if (e.pointerType !== 'touch') this.onEditDenied?.(); // au doigt, un glisser est un déplacement de la vue
      }
      return;
    }
    const d = this.drag;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
      d.moved = true;
      h.pushHistory();
      // la caisse glissée devient la dernière posée → atterrit sur ce qu'elle chevauche
      const crates = h.crates();
      crates.splice(crates.indexOf(d.c), 1);
      crates.push(d.c);
      h.setSelected(d.c.id);
      h.canvas.style.cursor = 'grabbing';
    }
    this.raycaster.setFromCamera(this.pointer, h.camera);
    const gp = this.groundPoint(d.plane);
    if (!gp) return;
    [d.c.x, d.c.z] = magnet(h.crates(), d.c, gp.x + d.dx, gp.z + d.dz);
    h.relayout();
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const h = this.h;
    this.touchIds.delete(e.pointerId);
    const db = this.dragBook;
    if (db) {
      try {
        h.canvas.releasePointerCapture(e.pointerId);
      } catch {
        // capture déjà relâchée
      }
      this.dragBook = null;
      h.controls.enabled = true;
      h.canvas.style.cursor = '';
      if (db.dragged) {
        // glisser sur un livre : rien ne bouge, rien ne s'ouvre
      } else if (h.openId() === db.b.id)
        h.closeBook(); // clic sur le livre sorti : on le range
      else if (h.mode() === 'edit') {
        // édition : on règle les caisses, un clic sur un livre sélectionne celle qui le contient
        if (db.b.crate && h.crateById(db.b.crate)) h.setSelected(db.b.crate);
        h.refresh();
      } else h.openBook(db.b.id); // lecture : clic simple, on le sort
      this.downEmpty = null;
      return;
    }
    const d = this.drag;
    if (d) {
      if (!d.moved) h.setSelected(h.selectedId() === d.c.id ? null : d.c.id);
      h.refresh();
      if (!d.moved && h.selectedId() && this.crateClickZoom) h.focusCrate(d.c.id);
      try {
        h.canvas.releasePointerCapture(e.pointerId);
      } catch {
        // capture déjà relâchée
      }
      this.drag = null;
      h.controls.enabled = true;
      h.canvas.style.cursor = '';
    } else if (this.downEmpty) {
      if (Math.hypot(e.clientX - this.downEmpty[0], e.clientY - this.downEmpty[1]) < 5) {
        if (h.openId()) h.closeBook(false);
        h.setSelected(null);
        h.decor.selected = false;
        h.refresh();
        if (this.downCrate) h.focusCrate(this.downCrate); // clic sur une caisse : on zoome dessus
      }
    }
    this.downEmpty = null;
    this.downCrate = null;
  };

  private readonly onPointerLeave = (): void => {
    this.pointer.set(2, 2);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const h = this.h;
    if (e.key === 'Escape' && h.missing.browsing) {
      h.endMissingBrowse();
      return;
    }
    if (e.key === 'Escape' && h.openId()) {
      h.closeBook();
      return;
    }
    if (isTyping()) return;
    if (h.missing.browsing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      h.stepMissing(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (h.openId() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const id = h.neighbors()[e.key === 'ArrowLeft' ? 0 : 1];
      if (id) h.openBook(id);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      h.undo();
      return;
    }
    const sel = h.selectedId();
    if (e.key === 'Delete' && sel && !h.openId() && h.mode() === 'edit') {
      h.removeCrate(sel);
    }
  };

  private showTooltip(on: boolean, text?: string): void {
    if (!this.tooltip) return;
    if (text !== undefined) this.tooltip.textContent = text;
    this.tooltip.style.opacity = on ? '1' : '0';
  }

  /** Survol (à chaque image) : poignées des gizmos, livre sous le pointeur, curseur. */
  updateHover(): void {
    if (this.drag || this.dragBook) return;
    const h = this.h;
    this.raycaster.setFromCamera(this.pointer, h.camera);
    if (h.rotGizmo.group.visible) {
      const hm = this.raycaster.intersectObjects(h.moveGizmo.activeHits(), false)[0];
      h.moveGizmo.highlight(hm ? (hm.object.userData.axis as RotAxis) : null);
      const hr = hm ? undefined : this.raycaster.intersectObjects(h.rotGizmo.hits, false)[0];
      h.rotGizmo.highlight(hr ? (hr.object.userData.axis as RotAxis) : null);
      if (hm || hr) {
        this.hovered = null;
        this.showTooltip(false);
        h.canvas.style.cursor = 'grab';
        return;
      }
    }
    const hitBook = this.raycaster.intersectObjects(h.bookMeshes(), false)[0];
    const rig = hitBook ? (h.bookRigById(hitBook.object.userData.id as Id) ?? null) : null;
    if (rig !== this.hovered) {
      this.hovered = rig;
      const b = rig ? h.bookById(rig.id) : undefined;
      if (b) this.showTooltip(false, b.title);
    }
    this.showTooltip(!!this.hovered && this.hovered.id !== h.openId());
    const hitCrate = rig ? undefined : this.raycaster.intersectObjects(h.hitboxes, false)[0];
    h.canvas.style.cursor = rig ? 'pointer' : hitCrate ? 'move' : '';
  }
}
