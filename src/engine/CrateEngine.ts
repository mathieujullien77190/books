import * as THREE from 'three';

import { PAD, SIZES } from '@/constants';
import { uid } from '@/helpers';
import type {
  Book,
  Crate,
  CrateSize,
  Dims,
  Id,
  Mode,
  RotAxis,
  SavedState,
  Snapshot,
} from '@/types';

import { applyBookPatch, type BookPatch } from './bookPatch';
import {
  disposeBookRig,
  ensureCover,
  makeBookRig,
  setBookResolution,
  updateBookTextures,
  type BookRig,
} from './books';
import { OPEN_BOOK_SCALE } from './constants';
import { CrateRigs } from './crateRigs';
import { crateBounds, nextStepPosition, type Bounds } from './cratePlacement';
import { Decor } from './decor';
import { DisplayMode } from './displayMode';
import { History } from './history';
import { PointerInput } from './input';
import { layoutBooks } from './layout';
import { disposeGroup } from './materials';
import { loadMesange } from './mesange';
import { RenderLoop } from './loop';
import { MissingPile } from './missingPile';
import { Q_TRANCHE, rotatedQuat } from './orientation';
import { Persistence } from './persistence';
import { Stage } from './stage';
import { Showcase, focusCrateView, recenterView } from './view';

export type { BookPatch };

/**
 * Scène three.js des caisses et des livres. Façade : détient l'état du domaine (caisses, livres,
 * sélection, mode), câble les modules du moteur (persistence, history, layout, cratePlacement,
 * input, view, missingPile, decor) et l'expose à React via subscribe / getSnapshot. La
 * sauvegarde est MongoDB (voir persistence.ts).
 */
export class CrateEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly stage: Stage;
  private readonly loop: RenderLoop;

  private readonly crateRigs: CrateRigs;
  private readonly booksGroup = new THREE.Group();
  /** Tas des tomes manquants, à gauche des caisses. */
  private readonly missing: MissingPile;
  private readonly bookRigs = new Map<Id, BookRig>();

  private crates: Crate[] = [];
  private books: Book[] = [];
  private selectedId: Id | null = null;
  /** Résultats d'une recherche présentés l'un après l'autre (précédent / suivant) ; null : voisins de la caisse. */
  private resultIds: Id[] | null = null;
  private openId: Id | null = null;
  /** Face visible du livre sorti : false = couverture, true = dos (résumé). */
  private openBack = false;
  private counts = new Map<Id, number>();
  private stats = { stored: 0, loose: 0, full: 0 };

  /** Voisins du livre sorti, animation de sortie et position flottante devant la caméra. */
  private readonly showcase = new Showcase();
  private readonly decor = new Decor();
  /** Vrai jusqu'à la fin du premier chargement : l'interface affiche un indicateur. */
  private loading = true;
  private loadError = false;
  private readonly display: DisplayMode;
  private readonly persistence = new Persistence({
    isDisposed: () => this.disposed,
    getState: () => ({ crates: this.crates, books: this.books, decor: this.decor.state }),
    load: (state, decor) => {
      this.restore(state);
      this.history.clear();
      this.decor.state = decor;
    },
    failed: () => {
      this.loadError = true;
    },
    loaded: (first) => {
      this.loadError = false;
      if (first) this.recenter();
      this.syncGhosts();
    },
    endLoading: () => this.endLoading(),
  });

  /** Souris, doigts et clavier (gestes en cours, survol, infobulle). */
  private readonly input: PointerInput;
  /** États précédents pour « Annuler » (le plus récent en dernier). */
  private readonly history = new History();
  private lastEdit: { id: Id; ts: number } | null = null;
  private mode: Mode = 'view';
  private texTimer = 0;
  /** Premier rendu déjà fait derrière l'indicateur de chargement. */
  private warmed = false;
  private disposed = false;

  private readonly listeners = new Set<() => void>();
  /** Données modifiées depuis la dernière copie du snapshot (voir makeSnapshot). */
  private dataDirty = true;
  private snapCrates: Crate[] = [];
  private snapBooks: Book[] = [];
  private snapshot: Snapshot;

  /** `transparent` : fond et sol invisibles (seules les ombres restent), pour la poser sur un autre décor. */
  constructor(
    canvas: HTMLCanvasElement,
    private readonly transparent = false,
  ) {
    this.canvas = canvas;
    const stage = new Stage(canvas, transparent);
    this.stage = stage;
    this.missing = new MissingPile(stage.aniso);
    stage.scene.add(this.booksGroup);
    stage.scene.add(this.missing.group);
    this.crateRigs = new CrateRigs(stage.scene, {
      crates: () => this.crates,
      selectedId: () => this.selectedId,
      openId: () => this.openId,
      mode: () => this.mode,
      lite: () => this.display.lite,
      bounds: () => this.bounds(),
    });
    stage.scene.add(this.decor.gizmo.group);
    this.display = new DisplayMode({
      isDisposed: () => this.disposed,
      transparent,
      aniso: stage.aniso,
      sun: stage.sun,
      missing: this.missing,
      crateRigs: this.crateRigs.rigs,
      bookRigs: this.bookRigs,
      books: () => this.books,
      openId: () => this.openId,
      touch: () => stage.touch(),
      syncGhosts: () => this.syncGhosts(),
      refresh: () => this.refresh(),
      emit: () => this.emit(),
    });

    this.snapshot = this.makeSnapshot();
    stage.resize();
    this.input = new PointerInput({
      canvas,
      camera: stage.camera,
      controls: stage.controls,
      hitboxes: this.crateRigs.hitboxes,
      rotGizmo: this.crateRigs.rotGizmo,
      moveGizmo: this.crateRigs.moveGizmo,
      decor: this.decor,
      missing: this.missing,
      mode: () => this.mode,
      selectedId: () => this.selectedId,
      setSelected: (id) => {
        this.selectedId = id;
      },
      openId: () => this.openId,
      neighbors: () => this.showcase.neighbors,
      crates: () => this.crates,
      crateById: (id) => this.crate(id),
      bookById: (id) => this.books.find((b) => b.id === id),
      bookRigById: (id) => this.bookRigs.get(id),
      bookMeshes: () => this.booksGroup.children.filter((m) => m.visible),
      stepCrate: (id, axis, sign) => this.stepCrate(id, axis, sign),
      rotateCrate: (id, axis, sign) => this.rotateCrate(id, axis, sign),
      stepMesange: (axis, sign) => this.stepMesange(axis, sign),
      browseMissing: () => this.browseMissing(),
      stepMissing: (dir) => this.stepMissing(dir),
      endMissingBrowse: () => this.endMissingBrowse(),
      openBook: (id) => this.openBook(id),
      closeBook: (refresh) => this.closeBook(refresh),
      flipBook: () => this.flipBook(),
      undo: () => this.undo(),
      removeCrate: (id) => this.removeCrate(id),
      focusCrate: (id) => this.focusCrate(id),
      pushHistory: () => this.pushHistory(),
      refresh: () => this.refresh(),
      emit: () => this.emit(),
      relayout: () => {
        this.crateRigs.place();
        this.layoutBooks();
      },
    });
    this.input.attach();

    this.refresh();
    this.recenter();
    this.loop = new RenderLoop({
      stage,
      showcase: this.showcase,
      missing: this.missing,
      decor: this.decor,
      canvas,
      bookRigs: this.bookRigs,
      openId: () => this.openId,
      openBack: () => this.openBack,
      isPortrait: () => this.isPortrait(),
      finishExit: () => this.finishExit(),
      hovered: () => this.input.hovered,
      updateHover: () => this.input.updateHover(),
    });
    this.loop.start();
    void loadMesange().then((bird) => {
      if (!bird) return;
      if (this.disposed) return disposeGroup(bird.group);
      this.decor.setBird(bird);
      this.stage.scene.add(bird.group);
      this.placeDecor();
    });
    void this.persistence.hydrate();
  }

  // ---------- store ----------
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  private makeSnapshot(): Snapshot {
    // copies profondes refaites seulement quand les données ont changé (refresh, updateBook) : ouvrir
    // un livre, le retourner ou parcourir les manquants garde les mêmes tableaux pour React
    if (this.dataDirty) {
      this.snapCrates = this.crates.map((c) => ({ ...c }));
      this.snapBooks = this.books.map((b) => ({ ...b }));
      this.dataDirty = false;
    }
    return {
      crates: this.snapCrates,
      books: this.snapBooks,
      messy: false,
      loading: this.loading,
      loadError: this.loadError,
      lite: this.display.choice,
      selectedId: this.selectedId,
      openId: this.openId,
      openSide: this.openBack ? 'back' : 'front',
      counts: Object.fromEntries(this.counts),
      ...this.stats,
      canUndo: this.history.canUndo,
      browsing: this.resultIds !== null,
      hasPrev: !!this.showcase.neighbors[0],
      hasNext: !!this.showcase.neighbors[1],
      missingBrowse: this.missing.current,
      mode: this.mode,
    };
  }

  private emit(): void {
    this.stage.touch();
    this.snapshot = this.makeSnapshot();
    for (const l of this.listeners) l();
  }

  /**
   * Mode léger : livres rangés en pavés d'une couleur, sans caisses, mésange ni ombres (pour les téléphones
   * qui rament). Le choix est gardé sur l'appareil.
   */
  setLite(on: boolean): void {
    this.display.set(on);
  }

  /** Chargement terminé (ou impossible) : l'interface retire l'indicateur. */
  private endLoading(): void {
    if (this.warmed) {
      this.loading = false;
      this.emit();
      return;
    }
    // premier chargement : compilation des shaders et envoi des textures au GPU pendant que
    // l'indicateur est encore affiché, sinon la scène reste vide plusieurs secondes une fois retiré
    this.warmed = true;
    this.stage.warmUp(
      () => this.disposed,
      () => {
        this.loading = false;
        this.emit();
        this.display.upgrade();
      },
    );
  }

  /** Recharge l'état depuis la base (modifiée ailleurs : Claude, un script…). */
  reload(): void {
    void this.persistence.hydrate(false);
  }

  private save(): void {
    this.persistence.save();
  }

  private refresh(): void {
    this.dataDirty = true;
    this.updateNeighbors();
    this.crateRigs.place();
    this.layoutBooks();
    this.placeDecor();
    this.syncGhosts();
    this.save();
    this.emit();
  }

  /** Reconstruit le tas des tomes manquants quand la liste (ou la position des caisses) change. */
  private syncGhosts(): void {
    if (!this.persistence.hydrated) return; // pas pendant le chargement : la liste des livres n'est pas complète
    this.missing.sync(this.books, this.bounds());
  }

  private placeDecor(): void {
    this.decor.place(this.crates, {
      selectedId: this.selectedId,
      mode: this.mode,
      openId: this.openId,
      lite: this.display.lite,
    });
  }

  // ---------- historique ----------
  private pushHistory(): void {
    this.history.push({ crates: this.crates, books: this.books, messy: false });
  }

  /** Annule la dernière action (Ctrl+Z). */
  undo(): void {
    const s = this.history.pop();
    if (s) this.restore(s);
  }

  /** Remplace tout l'état (annulation, ou chargement depuis la base). */
  private restore(s: SavedState): void {
    this.closeBook(false);
    this.crates = s.crates;
    this.books = s.books;
    for (const id of [...this.crateRigs.rigs.keys()])
      if (!this.crates.some((c) => c.id === id)) this.crateRigs.remove(id);
    for (const [id, rig] of [...this.bookRigs]) {
      if (this.books.some((b) => b.id === id)) continue;
      disposeBookRig(rig);
      this.booksGroup.remove(rig.mesh);
      this.bookRigs.delete(id);
      if (this.input.hovered === rig) this.input.hovered = null;
    }
    for (const b of this.books) {
      const rig = this.bookRigs.get(b.id);
      if (rig) updateBookTextures(rig, b, this.stage.aniso);
    }
    if (this.selectedId && !this.crates.some((c) => c.id === this.selectedId))
      this.selectedId = null;
    this.lastEdit = null;
    this.refresh();
    this.settleBooks();
  }

  /** Pose chaque livre directement à sa place, sans l'animation d'arrivée (chargement, restauration). */
  private settleBooks(): void {
    for (const rig of this.bookRigs.values()) {
      rig.mesh.position.copy(rig.target);
      rig.mesh.quaternion.copy(rig.quat);
    }
  }

  // ---------- API publique : caisses ----------
  addCrate(size: CrateSize): void {
    this.pushHistory();
    const s = SIZES[size];
    const bb = this.bounds();
    // nouvelle caisse derrière l'axe X (face avant sur l'axe), à droite du groupe ; la première au coin
    const c: Crate = {
      id: uid(),
      size,
      q: Q_TRANCHE.slice() as Crate['q'],
      x: this.crates.length ? bb.maxX + s.w / 2 + PAD : s.w / 2 + PAD,
      z: -(s.d / 2 + PAD),
      y: 0,
      dims: size === 'X' ? { w: s.w, h: s.h, d: s.d } : undefined,
    };
    this.crates.push(c);
    this.selectedId = c.id;
    this.refresh();
    this.recenter(); // la nouvelle caisse est posée à droite du groupe, parfois hors champ
  }

  removeCrate(id: Id): void {
    this.pushHistory();
    this.crates = this.crates.filter((c) => c.id !== id);
    this.crateRigs.remove(id);
    if (this.selectedId === id) this.selectedId = null;
    for (const b of this.books) if (b.crate === id) b.crate = null;
    this.refresh();
  }

  setCrateSize(id: Id, size: CrateSize): void {
    const c = this.crate(id);
    if (!c || c.size === size) return;
    this.pushHistory();
    c.size = size;
    if (size === 'X' && !c.dims) c.dims = { ...SIZES.X };
    this.refresh();
  }

  /** Livres debout ou à plat dans cette caisse. */
  setCrateFlat(id: Id, flat: boolean): void {
    const c = this.crate(id);
    if (!c || !!c.flat === flat) return;
    this.pushHistory();
    c.flat = flat;
    this.refresh();
  }

  /** Les livres plus profonds que la caisse y sont admis et dépassent devant. */
  setCrateOverhang(id: Id, overhang: boolean): void {
    const c = this.crate(id);
    if (!c || !!c.overhang === overhang) return;
    this.pushHistory();
    c.overhang = overhang || undefined;
    this.refresh();
  }

  /** Cotes d'une caisse transparente (unités scène). */
  setCrateDims(id: Id, dims: Dims): void {
    const c = this.crate(id);
    if (!c || c.size !== 'X') return;
    this.pushHistory();
    c.dims = { ...dims };
    this.refresh();
  }

  rotateCrate(id: Id, axis: RotAxis, sign: 1 | -1): void {
    const c = this.crate(id);
    if (!c) return;
    this.pushHistory();
    c.q = rotatedQuat(c, axis, sign);
    this.refresh();
  }

  selectCrate(id: Id | null): void {
    this.selectedId = id;
    this.refresh();
  }

  // ---------- API publique : livres ----------
  removeBook(id: Id): void {
    this.pushHistory();
    if (this.openId === id) this.closeBook(false);
    this.books = this.books.filter((b) => b.id !== id);
    const rig = this.bookRigs.get(id);
    if (rig) {
      disposeBookRig(rig);
      this.booksGroup.remove(rig.mesh);
      this.bookRigs.delete(id);
      if (this.input.hovered === rig) this.input.hovered = null;
    }
    this.refresh();
  }

  updateBook(id: Id, patch: BookPatch): void {
    const b = this.books.find((k) => k.id === id);
    if (!b) return;
    // une « session » de saisie sur le même livre = une seule entrée d'historique
    const now = Date.now();
    if (!this.lastEdit || this.lastEdit.id !== id || now - this.lastEdit.ts > 1500)
      this.pushHistory();
    this.lastEdit = { id, ts: now };
    if (applyBookPatch(b, patch)) {
      window.clearTimeout(this.texTimer);
      this.texTimer = window.setTimeout(() => {
        const rig = this.bookRigs.get(id);
        if (!rig) return;
        updateBookTextures(rig, b, this.stage.aniso);
        if (this.openId === id) setBookResolution(rig, b, this.stage.aniso, OPEN_BOOK_SCALE);
      }, 250);
    }
    this.dataDirty = true;
    this.save();
    this.emit();
  }

  openBook(id: Id): void {
    if (this.openId && this.openId !== id) this.closeBook(false);
    const rig = this.bookRigs.get(id);
    if (!rig) return;
    this.openId = id;
    this.openBack = false; // toujours la couverture d'abord
    rig.mesh.layers.set(1);
    rig.mesh.castShadow = false;
    const book = this.books.find((b) => b.id === id);
    if (book) setBookResolution(rig, book, this.stage.aniso, OPEN_BOOK_SCALE);
    this.refresh();
  }

  /** Recalcule les voisins du livre sorti et les fait passer au premier plan (couche 1). */
  private updateNeighbors(): void {
    const open = this.openId ? this.books.find((b) => b.id === this.openId) : undefined;
    let next: [Id | null, Id | null] = [null, null];
    if (open) {
      const stored = (b: Book): boolean => !!b.crate && this.crateRigs.rigs.has(b.crate);
      const list = this.resultIds?.includes(open.id)
        ? this.resultIds.flatMap((id) => this.books.find((b) => b.id === id) ?? [])
        : this.books.filter((b) => (stored(open) ? b.crate === open.crate : !stored(b)));
      const i = list.indexOf(open);
      next = [list[i - 1]?.id ?? null, list[i + 1]?.id ?? null];
    }
    for (const id of this.showcase.neighbors) {
      const rig = id && !next.includes(id) && this.bookRigs.get(id);
      if (!rig) continue;
      rig.mesh.layers.set(0);
      rig.mesh.castShadow = true;
    }
    for (const id of next) {
      const rig = id && this.bookRigs.get(id);
      if (!rig || this.isPortrait()) continue;
      const nb = this.books.find((k) => k.id === id);
      if (nb) ensureCover(rig, nb, this.stage.aniso, true);
      rig.mesh.layers.set(1);
      rig.mesh.castShadow = false;
    }
    this.showcase.neighbors = next;
  }

  /** Retourne le livre sorti : couverture ↔ dos (résumé). */
  flipBook(): void {
    if (!this.openId) return;
    this.openBack = !this.openBack;
    this.emit();
  }

  closeBook(doRefresh = true): void {
    const rig = this.openId ? this.bookRigs.get(this.openId) : undefined;
    if (rig && rig !== this.showcase.exiting?.rig) {
      rig.mesh.layers.set(0);
      rig.mesh.castShadow = true;
      const book = this.books.find((b) => b.id === this.openId);
      if (book) setBookResolution(rig, book, this.stage.aniso, 1);
    }
    this.openId = null;
    this.crateRigs.hintId = null;
    if (doRefresh) this.resultIds = null;
    if (doRefresh) this.refresh();
  }

  /** Présente les résultats d'une recherche : ouvre le premier, précédent / suivant parcourent la liste. */
  showBooks(ids: Id[]): void {
    const first = ids[0];
    if (!first) return;
    this.resultIds = ids;
    this.openBook(first);
  }

  /** Écran en portrait (téléphone) : un seul livre est présenté, sans voisins. */
  private isPortrait(): boolean {
    return this.stage.camera.aspect < 1;
  }

  /** Passe au livre précédent (-1) ou suivant (1) : voisins de la caisse ou résultats de la recherche. */
  stepBook(dir: -1 | 1): void {
    const id = this.showcase.neighbors[dir < 0 ? 0 : 1];
    if (!id) return;
    const out = this.openId ? this.bookRigs.get(this.openId) : undefined;
    if (!this.isPortrait() || !out) {
      this.openBook(id);
      return;
    }
    // téléphone : le livre actuel part du côté opposé, le suivant arrive du côté où on va
    this.finishExit();
    this.showcase.exiting = { rig: out, dir, start: performance.now() };
    this.showcase.enterDir = dir;
    this.openBook(id);
  }

  /** Remet le livre sorti de l'écran à sa place dans la caisse, sans qu'on le voie voler. */
  private finishExit(): void {
    const ex = this.showcase.exiting;
    if (!ex) return;
    this.showcase.exiting = null;
    ex.rig.mesh.layers.set(0);
    ex.rig.mesh.castShadow = true;
    const book = this.books.find((b) => b.id === ex.rig.id);
    if (book) setBookResolution(ex.rig, book, this.stage.aniso, 1);
    this.layoutBooks();
    ex.rig.mesh.position.copy(ex.rig.target);
    ex.rig.mesh.quaternion.copy(ex.rig.quat);
  }

  /** Un clic sur une caisse zoome dessus (désactivé sur téléphone : on zoome au pincement). */
  setCrateClickZoom(on: boolean): void {
    this.input.setCrateClickZoom(on);
  }

  /** Lance le défilé des tomes manquants : caméra en gros plan sur le dernier du tas (le plus petit). */
  browseMissing(): void {
    if (!this.missing.count) return;
    this.closeBook(false);
    this.missing.browse();
    this.emit();
  }

  /** Tome manquant suivant (dir 1, vers le bas du tas) ou précédent (-1, vers le haut), en boucle. */
  stepMissing(dir: 1 | -1): void {
    if (!this.missing.browsing || !this.missing.count) return;
    this.missing.step(dir);
    this.emit();
  }

  endMissingBrowse(): void {
    if (!this.missing.browsing) return;
    this.missing.end();
    this.emit();
  }

  /** Fonction appelée quand un geste cherche à modifier la bibliothèque en Lecture (null : rien). */
  setEditDeniedHandler(handler: (() => void) | null): void {
    this.input.setEditDeniedHandler(handler);
  }

  /** Met une caisse en surbrillance (survol de sa place dans la fiche), ou l'éteint avec null. */
  hintCrate(id: Id | null): void {
    this.crateRigs.hint(id);
  }

  /**
   * Déplace la caisse d'un cran dans un sens : jusqu'à la prochaine position « intéressante »
   * (contact ou alignement avec une autre caisse, bord sur un axe) ou, à défaut, d'un pas de grille.
   * Sur l'axe vertical : vers le haut seulement, la caisse passe au sommet de sa pile.
   */
  stepCrate(id: Id, axis: RotAxis, sign: 1 | -1): void {
    const c = this.crate(id);
    if (!c || (axis === 'y' && sign < 0)) return;
    this.pushHistory();
    if (axis === 'y') {
      this.crates.splice(this.crates.indexOf(c), 1);
      this.crates.push(c);
      this.refresh();
      return;
    }
    const next = nextStepPosition(this.crates, c, axis, sign);
    if (axis === 'x') c.x = next;
    else c.z = next;
    // ordre d'empilement inchangé : la caisse glisse à son niveau, elle ne passe pas au-dessus des autres
    this.refresh();
  }

  /** Édition (caisses réglables) ou bibliothèque (lecture seule, sans repère ni poignées). */
  setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'view') {
      this.selectedId = null;
      this.decor.selected = false;
    }
    this.crateRigs.setEditing(mode === 'edit');
    this.refresh();
  }

  /** Cadre la caméra sur une caisse, en gardant la direction de vue. */
  focusCrate(id: Id): void {
    const c = this.crate(id);
    const rig = c && this.crateRigs.rigs.get(id);
    if (!c || !rig) return;
    focusCrateView(this.stage.camera, this.stage.controls.target, c, rig);
  }

  // ---------- API publique : vue ----------
  recenter(): void {
    recenterView(this.stage.camera, this.stage.controls.target, this.bounds());
  }

  /** Élément HTML de l'infobulle (titre du livre survolé), positionné par le moteur. */
  /** Étiquette HTML que le moteur colle à côté de la mésange (déplacée à chaque image, sans passer par React). */
  attachBirdLabel(el: HTMLElement | null): void {
    this.loop.birdLabel.attach(el);
  }

  attachTooltip(el: HTMLElement | null): void {
    this.input.attachTooltip(el);
  }

  dispose(): void {
    this.disposed = true;
    this.decor.disposeBird(this.stage.scene);
    this.loop.stop();
    window.clearTimeout(this.texTimer);
    this.input.detach();
    for (const rig of this.bookRigs.values()) disposeBookRig(rig);
    this.bookRigs.clear();
    this.crateRigs.dispose();
    this.missing.dispose();
    disposeGroup(this.decor.gizmo.group);
    this.stage.scene.remove(this.decor.gizmo.group);
    this.stage.dispose();
  }

  // ---------- état ----------
  private crate(id: Id): Crate | undefined {
    return this.crates.find((c) => c.id === id);
  }

  /** Déplace la mésange d'un cran le long d'un axe du monde. */
  private stepMesange(axis: RotAxis, sign: 1 | -1): void {
    this.decor.step(axis, sign);
    this.placeDecor();
    this.save();
    this.emit();
  }

  private bounds(): Bounds {
    return crateBounds(this.crates);
  }

  private bookRig(b: Book): BookRig {
    let rig = this.bookRigs.get(b.id);
    if (!rig) {
      rig = makeBookRig(b, this.stage.aniso);
      this.booksGroup.add(rig.mesh);
      this.bookRigs.set(b.id, rig);
    }
    return rig;
  }

  /** Chaque livre appartient à une caisse (b.crate) ou à la pile « à côté » (voir layout.ts). */
  private layoutBooks(): void {
    const { counts, stats } = layoutBooks({
      crates: this.crates,
      books: this.books,
      crateRigs: this.crateRigs.rigs,
      bounds: this.bounds(),
      aniso: this.stage.aniso,
      mode: this.mode,
      rigOf: (b) => this.bookRig(b),
      isHeld: (b) => this.input.heldBook === b || b.id === this.openId,
    });
    this.counts = counts;
    this.stats = stats;
  }
}
