import type { Book, Crate, CrateSize, Dims, Id, Mode, RotAxis, SavedState } from '@/types';

import { BookEditor, type BookPatch } from './bookPatch';
import { BookRigs } from './bookRigs';
import { OpenBook } from './openBook';
import { CrateOps } from './crateOps';
import { CrateRigs } from './crateRigs';
import { crateBounds, type Bounds } from './cratePlacement';
import { Decor } from './decor';
import { DisplayMode } from './displayMode';
import { History } from './history';
import { PointerInput } from './input';
import { layoutBooks } from './layout';
import { disposeGroup } from './materials';
import { loadMesange } from './mesange';
import { RenderLoop } from './loop';
import { MissingPile } from './missingPile';
import { Persistence } from './persistence';
import { Stage } from './stage';
import { Store } from './store';
import { focusCrateView, recenterView } from './view';

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
  /** Tas des tomes manquants, à gauche des caisses. */
  private readonly missing: MissingPile;
  private readonly bookRigs: BookRigs;

  private crates: Crate[] = [];
  private books: Book[] = [];
  private selectedId: Id | null = null;
  private readonly opened: OpenBook;
  private readonly crateOps: CrateOps;
  private readonly bookEditor: BookEditor;
  private counts = new Map<Id, number>();
  private stats = { stored: 0, loose: 0, full: 0 };

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
  private mode: Mode = 'view';
  /** Premier rendu déjà fait derrière l'indicateur de chargement. */
  private warmed = false;
  private disposed = false;

  /** État lu par React : abonnement et instantané. */
  private readonly store: Store;
  readonly subscribe: Store['subscribe'];
  readonly getSnapshot: Store['getSnapshot'];

  /** `transparent` : fond et sol invisibles (seules les ombres restent), pour la poser sur un autre décor. */
  constructor(
    canvas: HTMLCanvasElement,
    private readonly transparent = false,
  ) {
    this.canvas = canvas;
    const stage = new Stage(canvas, transparent);
    this.stage = stage;
    this.missing = new MissingPile(stage.aniso);
    this.bookRigs = new BookRigs(stage.aniso, (rig) => {
      if (this.input.hovered === rig) this.input.hovered = null;
    });
    stage.scene.add(this.bookRigs.group);
    stage.scene.add(this.missing.group);
    this.crateRigs = new CrateRigs(stage.scene, {
      crates: () => this.crates,
      selectedId: () => this.selectedId,
      openId: () => this.opened.id,
      mode: () => this.mode,
      lite: () => this.display.lite,
      bounds: () => this.bounds(),
    });
    stage.scene.add(this.decor.gizmo.group);
    this.crateOps = new CrateOps({
      crates: () => this.crates,
      setCrates: (crates) => {
        this.crates = crates;
      },
      books: () => this.books,
      selectedId: () => this.selectedId,
      setSelected: (id) => {
        this.selectedId = id;
      },
      bounds: () => this.bounds(),
      removeRig: (id) => this.crateRigs.remove(id),
      pushHistory: () => this.pushHistory(),
      refresh: () => this.refresh(),
      recenter: () => this.recenter(),
    });
    this.bookEditor = new BookEditor({
      books: () => this.books,
      rigOf: (id) => this.bookRigs.rigs.get(id),
      openId: () => this.opened.id,
      aniso: stage.aniso,
      pushHistory: () => this.pushHistory(),
      changed: () => {
        this.store.markData();
        this.save();
        this.emit();
      },
    });
    this.opened = new OpenBook({
      books: () => this.books,
      bookRigs: this.bookRigs.rigs,
      hasCrate: (id) => this.crateRigs.rigs.has(id),
      aniso: stage.aniso,
      isPortrait: () => stage.isPortrait(),
      clearHint: () => {
        this.crateRigs.hintId = null;
      },
      layoutBooks: () => this.layoutBooks(),
      refresh: () => this.refresh(),
      emit: () => this.emit(),
    });
    this.display = new DisplayMode({
      isDisposed: () => this.disposed,
      transparent,
      aniso: stage.aniso,
      sun: stage.sun,
      missing: this.missing,
      crateRigs: this.crateRigs.rigs,
      bookRigs: this.bookRigs.rigs,
      books: () => this.books,
      openId: () => this.opened.id,
      touch: () => stage.touch(),
      syncGhosts: () => this.syncGhosts(),
      refresh: () => this.refresh(),
      emit: () => this.emit(),
    });

    this.store = new Store(() => ({
      crates: this.crates,
      books: this.books,
      loading: this.loading,
      loadError: this.loadError,
      lite: this.display.choice,
      selectedId: this.selectedId,
      openId: this.opened.id,
      openSide: this.opened.back ? 'back' : 'front',
      counts: Object.fromEntries(this.counts),
      ...this.stats,
      canUndo: this.history.canUndo,
      browsing: this.opened.resultIds !== null,
      hasPrev: !!this.opened.showcase.neighbors[0],
      hasNext: !!this.opened.showcase.neighbors[1],
      missingBrowse: this.missing.current,
      mode: this.mode,
    }));
    this.subscribe = this.store.subscribe;
    this.getSnapshot = this.store.getSnapshot;
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
      openId: () => this.opened.id,
      neighbors: () => this.opened.showcase.neighbors,
      crates: () => this.crates,
      crateById: (id) => this.crate(id),
      bookById: (id) => this.books.find((b) => b.id === id),
      bookRigById: (id) => this.bookRigs.rigs.get(id),
      bookMeshes: () => this.bookRigs.group.children.filter((m) => m.visible),
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
      showcase: this.opened.showcase,
      missing: this.missing,
      decor: this.decor,
      canvas,
      bookRigs: this.bookRigs.rigs,
      openId: () => this.opened.id,
      openBack: () => this.opened.back,
      isPortrait: () => stage.isPortrait(),
      finishExit: () => this.opened.finishExit(),
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

  private emit(): void {
    this.stage.touch();
    this.store.emit();
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
    this.store.markData();
    this.opened.updateNeighbors();
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
      openId: this.opened.id,
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
    this.bookRigs.sync(this.books);
    if (this.selectedId && !this.crates.some((c) => c.id === this.selectedId))
      this.selectedId = null;
    this.bookEditor.reset();
    this.refresh();
    this.bookRigs.settle();
  }

  // ---------- API publique : caisses ----------
  addCrate(size: CrateSize): void {
    this.crateOps.add(size);
  }

  removeCrate(id: Id): void {
    this.crateOps.remove(id);
  }

  setCrateSize(id: Id, size: CrateSize): void {
    this.crateOps.setSize(id, size);
  }

  /** Livres debout ou à plat dans cette caisse. */
  setCrateFlat(id: Id, flat: boolean): void {
    this.crateOps.setFlat(id, flat);
  }

  /** Les livres plus profonds que la caisse y sont admis et dépassent devant. */
  setCrateOverhang(id: Id, overhang: boolean): void {
    this.crateOps.setOverhang(id, overhang);
  }

  /** Cotes d'une caisse transparente (unités scène). */
  setCrateDims(id: Id, dims: Dims): void {
    this.crateOps.setDims(id, dims);
  }

  rotateCrate(id: Id, axis: RotAxis, sign: 1 | -1): void {
    this.crateOps.rotate(id, axis, sign);
  }

  selectCrate(id: Id | null): void {
    this.selectedId = id;
    this.refresh();
  }

  // ---------- API publique : livres ----------
  removeBook(id: Id): void {
    this.pushHistory();
    if (this.opened.id === id) this.closeBook(false);
    this.books = this.books.filter((b) => b.id !== id);
    this.bookRigs.remove(id);
    this.refresh();
  }

  updateBook(id: Id, patch: BookPatch): void {
    this.bookEditor.update(id, patch);
  }

  openBook(id: Id): void {
    this.opened.open(id);
  }

  /** Retourne le livre sorti : couverture ↔ dos (résumé). */
  flipBook(): void {
    this.opened.flip();
  }

  closeBook(doRefresh = true): void {
    this.opened.close(doRefresh);
  }

  /** Présente les résultats d'une recherche : ouvre le premier, précédent / suivant parcourent la liste. */
  showBooks(ids: Id[]): void {
    this.opened.showResults(ids);
  }

  /** Passe au livre précédent (-1) ou suivant (1) : voisins de la caisse ou résultats de la recherche. */
  stepBook(dir: -1 | 1): void {
    this.opened.step(dir);
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

  /** Déplace la caisse d'un cran dans un sens (voir CrateOps.step). */
  stepCrate(id: Id, axis: RotAxis, sign: 1 | -1): void {
    this.crateOps.step(id, axis, sign);
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
    this.bookEditor.dispose();
    this.input.detach();
    this.bookRigs.dispose();
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

  /** Chaque livre appartient à une caisse (b.crate) ou à la pile « à côté » (voir layout.ts). */
  private layoutBooks(): void {
    const { counts, stats } = layoutBooks({
      crates: this.crates,
      books: this.books,
      crateRigs: this.crateRigs.rigs,
      bounds: this.bounds(),
      aniso: this.stage.aniso,
      mode: this.mode,
      rigOf: (b) => this.bookRigs.ensure(b),
      isHeld: (b) => this.input.heldBook === b || b.id === this.opened.id,
    });
    this.counts = counts;
    this.stats = stats;
  }
}
