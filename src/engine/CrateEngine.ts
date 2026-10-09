import type { CrateSize, Dims, Id, Mode, RotAxis, SavedState } from '@/types';

import { BookEditor, type BookPatch } from './bookPatch';
import { BookRigs } from './bookRigs';
import { buildStl } from './stlExport';
import { CrateOps } from './crateOps';
import { CrateRigs } from './crateRigs';
import { Decor } from './decor';
import { DisplayMode } from './displayMode';
import { Domain } from './domain';
import { PointerInput } from './input';
import { layoutBooks } from './layout';
import { LoadState } from './loadState';
import { RenderLoop } from './loop';
import { disposeGroup } from './materials';
import { MissingPile } from './missingPile';
import { OpenBook } from './openBook';
import { Persistence } from './persistence';
import { Stage } from './stage';
import { Store } from './store';
import { focusCrateView, recenterView } from './view';

export type { BookPatch };

/**
 * Scène three.js des caisses et des livres. Façade : possède l'état du domaine (`Domain`), câble
 * les modules du moteur (stage, loop, crateRigs, bookRigs, openBook, displayMode, persistence,
 * input, layout, missingPile, decor…) et l'expose à React via subscribe / getSnapshot. Chaque
 * mutation passe par pushHistory() puis refresh(). La sauvegarde est MongoDB (voir persistence.ts).
 */
export class CrateEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly stage: Stage;
  private readonly loop: RenderLoop;

  private readonly crateRigs: CrateRigs;
  /** Tas des tomes manquants, à gauche des caisses. */
  private readonly missing: MissingPile;
  private readonly bookRigs: BookRigs;

  private readonly domain = new Domain();
  private readonly opened: OpenBook;
  private readonly crateOps: CrateOps;
  private readonly bookEditor: BookEditor;

  private readonly decor = new Decor();
  private readonly load: LoadState;
  private readonly display: DisplayMode;
  private readonly persistence = new Persistence({
    isDisposed: () => this.disposed,
    getState: () => ({
      crates: this.domain.crates,
      books: this.domain.books,
      decor: this.decor.state,
    }),
    load: (state, decor) => {
      this.restore(state);
      this.domain.history.clear();
      this.decor.state = decor;
    },
    failed: () => {
      this.load.failed = true;
    },
    loaded: (first) => {
      this.load.failed = false;
      if (first) this.recenter();
      this.syncGhosts();
    },
    progress: (label, value) => this.load.step(label, value),
    endLoading: () => this.load.end(),
  });

  /** Souris, doigts et clavier (gestes en cours, survol, infobulle). */
  private readonly input: PointerInput;
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
      domain: this.domain,
      openId: () => this.opened.id,
      lite: () => this.display.lite,
    });
    stage.scene.add(this.decor.gizmo.group);
    this.crateOps = new CrateOps({
      domain: this.domain,
      removeRig: (id) => this.crateRigs.remove(id),
      refresh: () => this.refresh(),
      recenter: () => this.recenter(),
    });
    this.bookEditor = new BookEditor({
      domain: this.domain,
      rigOf: (id) => this.bookRigs.rigs.get(id),
      openId: () => this.opened.id,
      aniso: stage.aniso,
      changed: () => {
        this.store.markData();
        this.save();
        this.emit();
      },
      relayout: () => this.refresh(),
    });
    this.opened = new OpenBook({
      domain: this.domain,
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
      domain: this.domain,
      openId: () => this.opened.id,
      touch: () => stage.touch(),
      syncGhosts: () => this.syncGhosts(),
      refresh: () => this.refresh(),
      emit: () => this.emit(),
    });

    this.load = new LoadState({
      stage,
      isDisposed: () => this.disposed,
      emit: () => this.emit(),
      shown: () => this.display.upgrade(),
    });
    this.store = new Store(() => ({
      crates: this.domain.crates,
      books: this.domain.books,
      loading: this.load.pending,
      loadError: this.load.failed,
      progress: this.load.pending ? this.load.progress : this.display.progress,
      lite: this.display.choice,
      selectedId: this.domain.selectedId,
      openId: this.opened.id,
      openSide: this.opened.back ? 'back' : 'front',
      counts: Object.fromEntries(this.domain.counts),
      ...this.domain.stats,
      canUndo: this.domain.history.canUndo,
      browsing: this.opened.resultIds !== null,
      hasPrev: !!this.opened.showcase.neighbors[0],
      hasNext: !!this.opened.showcase.neighbors[1],
      missingBrowse: this.missing.current,
      mode: this.domain.mode,
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
      mode: () => this.domain.mode,
      selectedId: () => this.domain.selectedId,
      setSelected: (id) => {
        this.domain.selectedId = id;
      },
      openId: () => this.opened.id,
      neighbors: () => this.opened.showcase.neighbors,
      crates: () => this.domain.crates,
      crateById: (id) => this.domain.crate(id),
      bookById: (id) => this.domain.books.find((b) => b.id === id),
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
      pushHistory: () => this.domain.pushHistory(),
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
    this.decor.loadBird(
      stage.scene,
      () => this.disposed,
      () => this.placeDecor(),
    );
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
    this.missing.sync(this.domain.books, this.domain.bounds());
  }

  private placeDecor(): void {
    this.decor.place(this.domain.crates, {
      selectedId: this.domain.selectedId,
      mode: this.domain.mode,
      openId: this.opened.id,
      lite: this.display.lite,
    });
  }

  /** Fichier STL (binaire, en mm, Z vers le haut) des caisses et des livres tels qu'ils sont posés. */
  exportStl(): ArrayBuffer {
    return buildStl(
      [...this.crateRigs.rigs.values()].map((r) => ({ group: r.group, shell: r.shell })),
      [...this.bookRigs.rigs.values()].map((r) => r.mesh),
    );
  }

  // ---------- historique ----------
  /** Annule la dernière action (Ctrl+Z). */
  undo(): void {
    const s = this.domain.history.pop();
    if (s) this.restore(s);
  }

  /** Remplace tout l'état (annulation, ou chargement depuis la base). */
  private restore(s: SavedState): void {
    this.closeBook(false);
    this.domain.replace(s);
    for (const id of [...this.crateRigs.rigs.keys()])
      if (!this.domain.crates.some((c) => c.id === id)) this.crateRigs.remove(id);
    this.bookRigs.sync(this.domain.books);
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
    this.domain.selectedId = id;
    this.refresh();
  }

  // ---------- API publique : livres ----------
  removeBook(id: Id): void {
    this.domain.pushHistory();
    if (this.opened.id === id) this.closeBook(false);
    this.domain.books = this.domain.books.filter((b) => b.id !== id);
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
    if (this.domain.mode === mode) return;
    this.domain.mode = mode;
    if (mode === 'view') {
      this.domain.selectedId = null;
      this.decor.selected = false;
    }
    this.crateRigs.setEditing(mode === 'edit');
    this.refresh();
  }

  /** Cadre la caméra sur une caisse, en gardant la direction de vue. */
  focusCrate(id: Id): void {
    const c = this.domain.crate(id);
    const rig = c && this.crateRigs.rigs.get(id);
    if (!c || !rig) return;
    focusCrateView(this.stage.camera, this.stage.controls.target, c, rig);
  }

  // ---------- API publique : vue ----------
  recenter(): void {
    recenterView(this.stage.camera, this.stage.controls.target, this.domain.bounds());
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
  /** Déplace la mésange d'un cran le long d'un axe du monde. */
  private stepMesange(axis: RotAxis, sign: 1 | -1): void {
    this.decor.step(axis, sign);
    this.placeDecor();
    this.save();
    this.emit();
  }

  /** Chaque livre appartient à une caisse (b.crate) ou à la pile « à côté » (voir layout.ts). */
  private layoutBooks(): void {
    const { counts, stats } = layoutBooks({
      crates: this.domain.crates,
      books: this.domain.books,
      crateRigs: this.crateRigs.rigs,
      bounds: this.domain.bounds(),
      aniso: this.stage.aniso,
      mode: this.domain.mode,
      rigOf: (b) => this.bookRigs.ensure(b),
      isHeld: (b) => this.input.heldBook === b || b.id === this.opened.id,
    });
    this.domain.counts = counts;
    this.domain.stats = stats;
  }
}
