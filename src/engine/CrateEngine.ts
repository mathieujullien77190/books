import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { PAD, SCENE_BG, SIZES } from '@/constants';
import { crateDims, crateLabels, uid } from '@/helpers';
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

import {
  disposeBookRig,
  ensureCover,
  makeBookRig,
  applyLiteMode,
  onTextureReady,
  setLiteBooks,
  setBookResolution,
  updateBookTextures,
  type BookRig,
} from './books';
import { applyGravity, crateBounds, nextStepPosition, type Bounds } from './cratePlacement';
import { LITE_KEY, NEIGHBOR_SCALE, OPEN_BOOK_SCALE } from './constants';
import { buildCrate, forgetCrateLabel, setCrateLabel, uprightLabel, type CrateRig } from './crate';
import { Decor } from './decor';
import { History } from './history';
import { PointerInput } from './input';
import { layoutBooks } from './layout';
import { disposeGroup } from './materials';
import { loadMesange } from './mesange';
import { MissingPile } from './missingPile';
import { buildMoveGizmo, type MoveGizmo } from './moveGizmo';
import { Q_TRANCHE, extents, footprint, overlaps, quatOf, rotatedQuat } from './orientation';
import { Persistence } from './persistence';
import { buildRotateGizmo, type RotateGizmo } from './rotateGizmo';
import { Showcase, focusCrateView, recenterView } from './view';
import { buildGrid, buildWorldAxes, type WorldAxes } from './worldAxes';

/** Champs modifiables d'un livre depuis la fiche. */
export type BookPatch = Partial<
  Pick<
    Book,
    | 'title'
    | 'summary'
    | 'color'
    | 'cover'
    | 'author'
    | 'publisher'
    | 'year'
    | 'kind'
    | 'isbn'
    | 'isbnConfidence'
  >
>;

/**
 * Scène three.js des caisses et des livres. Façade : détient l'état du domaine (caisses, livres,
 * sélection, mode), câble les modules du moteur (persistence, history, layout, cratePlacement,
 * input, view, missingPile, decor) et l'expose à React via subscribe / getSnapshot. La
 * sauvegarde est MongoDB (voir persistence.ts).
 */
export class CrateEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  private readonly controls: OrbitControls;
  private readonly aniso: number;
  private readonly timer = new THREE.Timer();
  private readonly resizeObserver: ResizeObserver;

  private readonly crateRigs = new Map<Id, CrateRig>();
  private readonly hitboxes: THREE.Mesh[] = [];
  private readonly booksGroup = new THREE.Group();
  /** Tas des tomes manquants, à gauche des caisses. */
  private readonly missing: MissingPile;
  private readonly bookRigs = new Map<Id, BookRig>();

  private crates: Crate[] = [];
  private books: Book[] = [];
  private selectedId: Id | null = null;
  /** Résultats d'une recherche présentés l'un après l'autre (précédent / suivant) ; null : voisins de la caisse. */
  private resultIds: Id[] | null = null;
  /** Caisse mise en surbrillance quand on survole sa place dans la fiche du livre sorti. */
  private hintId: Id | null = null;
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
  private lite = false;
  private sun!: THREE.DirectionalLight;
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
  private readonly rotGizmo: RotateGizmo;
  private readonly moveGizmo: MoveGizmo;
  /** États précédents pour « Annuler » (le plus récent en dernier). */
  private readonly history = new History();
  private lastEdit: { id: Id; ts: number } | null = null;
  private readonly axes: WorldAxes;
  private readonly grid: THREE.GridHelper;
  private mode: Mode = 'view';
  private texTimer = 0;
  /**
   * Rendu à la demande : l'image n'est redessinée que si quelque chose a changé (caméra, livre en
   * mouvement, état, couverture chargée, événement souris/clavier) ou, pour la mésange, une image sur
   * deux environ. Une scène immobile ne coûte plus de GPU.
   */
  private dirty = true;
  /** Les ombres (statiques) ne sont recalculées que si la scène a changé, pas pour la seule mésange. */
  private shadowDirty = true;
  private lastBirdFrame = 0;
  private readonly stopTextureWatch: () => void;
  private touch(): void {
    this.dirty = true;
    this.shadowDirty = true;
  }
  private readonly invalidate = (): void => this.touch();
  /** Premier rendu déjà fait derrière l'indicateur de chargement. */
  private warmed = false;
  private raf = 0;
  private disposed = false;

  private readonly listeners = new Set<() => void>();
  /** Données modifiées depuis la dernière copie du snapshot (voir makeSnapshot). */
  private dataDirty = true;
  private snapCrates: Crate[] = [];
  private snapBooks: Book[] = [];
  private snapshot: Snapshot;

  // vecteurs de travail
  private readonly _tv = new THREE.Vector3();
  private birdLabel: HTMLElement | null = null;
  private readonly _box = new THREE.Box3();

  /** `transparent` : fond et sol invisibles (seules les ombres restent), pour la poser sur un autre décor. */
  constructor(
    canvas: HTMLCanvasElement,
    private readonly transparent = false,
  ) {
    this.canvas = canvas;
    try {
      this.lite = localStorage.getItem(LITE_KEY) === '1';
    } catch {
      this.lite = false;
    }
    setLiteBooks(this.lite);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false; // recalculées à la demande (voir `shadowDirty`)
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.autoClear = false;
    this.renderer = renderer;
    this.aniso = renderer.capabilities.getMaxAnisotropy();
    this.missing = new MissingPile(this.aniso);

    this.scene.background = transparent ? null : new THREE.Color(SCENE_BG);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const controls = new OrbitControls(this.camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI - 0.05; // peut descendre sous sa cible ; le sol est géré dans tick()
    controls.minDistance = 1;
    controls.maxDistance = 60;
    controls.zoomToCursor = true; // la molette zoome vers le point sous le curseur, pas vers le centre de la vue
    // souris : molette enfoncée = tourner autour de la bibliothèque, clic droit = déplacer la vue, molette =
    // zoomer ; le clic gauche reste réservé aux caisses et aux livres. Tactile : un doigt déplace, deux
    // doigts zooment (pas de rotation).
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls = controls;
    controls.addEventListener('change', this.invalidate);
    this.stopTextureWatch = onTextureReady(this.invalidate);
    for (const type of ['pointermove', 'pointerdown', 'pointerup', 'wheel'])
      canvas.addEventListener(type, this.invalidate, { passive: true });
    window.addEventListener('keydown', this.invalidate);

    // couche 1 : livre sorti, rendu par-dessus la scène
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8fa3b5, 0.35);
    hemi.layers.enable(1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.layers.enable(1);
    sun.position.set(10, 16, 8);
    sun.castShadow = !this.lite;
    this.sun = sun;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.scene.add(this.buildGround());
    this.scene.add(this.booksGroup);
    this.scene.add(this.missing.group);
    this.axes = buildWorldAxes();
    this.grid = buildGrid();
    this.grid.visible = this.mode === 'edit';
    this.axes.group.visible = this.mode === 'edit';
    this.scene.add(this.grid, this.axes.group);
    this.rotGizmo = buildRotateGizmo();
    this.moveGizmo = buildMoveGizmo();
    this.scene.add(this.rotGizmo.group, this.moveGizmo.group, this.decor.gizmo.group);

    this.snapshot = this.makeSnapshot();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.input = new PointerInput({
      canvas,
      camera: this.camera,
      controls,
      hitboxes: this.hitboxes,
      rotGizmo: this.rotGizmo,
      moveGizmo: this.moveGizmo,
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
        this.placeCrates();
        this.layoutBooks();
      },
    });
    this.input.attach();

    this.refresh();
    this.recenter();
    this.tick();
    void loadMesange().then((bird) => {
      if (!bird) return;
      if (this.disposed) return disposeGroup(bird.group);
      this.decor.setBird(bird);
      this.scene.add(bird.group);
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
      lite: this.lite,
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
    this.touch();
    this.snapshot = this.makeSnapshot();
    for (const l of this.listeners) l();
  }

  /**
   * Mode léger : livres rangés en pavés d'une couleur, sans caisses, mésange ni ombres (pour les téléphones
   * qui rament). Le choix est gardé sur l'appareil.
   */
  setLite(on: boolean): void {
    if (this.lite === on) return;
    this.lite = on;
    setLiteBooks(on);
    try {
      localStorage.setItem(LITE_KEY, on ? '1' : '0');
    } catch {
      // stockage indisponible : le choix vaut pour cette visite seulement
    }
    this.sun.castShadow = !on;
    for (const rig of this.crateRigs.values()) rig.group.visible = !on;
    for (const [id, rig] of this.bookRigs) {
      const b = this.books.find((x) => x.id === id);
      if (b) applyLiteMode(rig, b, this.aniso);
    }
    this.missing.invalidate();
    this.syncGhosts();
    this.refresh();
    const open = this.openId ? this.books.find((b) => b.id === this.openId) : undefined;
    const openRig = open && this.bookRigs.get(open.id);
    if (open && openRig) setBookResolution(openRig, open, this.aniso, OPEN_BOOK_SCALE);
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
    void this.renderer
      .compileAsync(this.scene, this.camera)
      .catch(() => undefined)
      .then(() => {
        if (this.disposed) return;
        this.renderer.shadowMap.needsUpdate = true;
        this.renderer.render(this.scene, this.camera);
        this.renderer.getContext().finish();
        this.loading = false;
        this.emit();
      });
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
    this.placeCrates();
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
      lite: this.lite,
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
    for (const id of [...this.crateRigs.keys()])
      if (!this.crates.some((c) => c.id === id)) this.removeCrateRig(id);
    for (const [id, rig] of [...this.bookRigs]) {
      if (this.books.some((b) => b.id === id)) continue;
      disposeBookRig(rig);
      this.booksGroup.remove(rig.mesh);
      this.bookRigs.delete(id);
      if (this.input.hovered === rig) this.input.hovered = null;
    }
    for (const b of this.books) {
      const rig = this.bookRigs.get(b.id);
      if (rig) updateBookTextures(rig, b, this.aniso);
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
    this.removeCrateRig(id);
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
    const title = patch.title?.trim();
    if (title) b.title = title;
    if (patch.color !== undefined) b.color = patch.color;
    if (patch.summary !== undefined) b.summary = patch.summary;
    if ('cover' in patch) b.cover = patch.cover || undefined;
    if ('author' in patch) b.author = patch.author?.trim() || undefined;
    if ('publisher' in patch) b.publisher = patch.publisher?.trim() || undefined;
    if ('year' in patch)
      b.year = patch.year && Number.isFinite(patch.year) ? patch.year : undefined;
    if ('kind' in patch) b.kind = patch.kind;
    if ('isbn' in patch) b.isbn = patch.isbn?.trim() || undefined;
    if ('isbnConfidence' in patch) b.isbnConfidence = b.isbn ? patch.isbnConfidence : undefined;
    const meta =
      'author' in patch ||
      'publisher' in patch ||
      'year' in patch ||
      'kind' in patch ||
      'isbn' in patch ||
      'isbnConfidence' in patch;
    if (
      patch.title !== undefined ||
      patch.color !== undefined ||
      patch.summary !== undefined ||
      'cover' in patch ||
      meta
    ) {
      window.clearTimeout(this.texTimer);
      this.texTimer = window.setTimeout(() => {
        const rig = this.bookRigs.get(id);
        if (!rig) return;
        updateBookTextures(rig, b, this.aniso);
        if (this.openId === id) setBookResolution(rig, b, this.aniso, OPEN_BOOK_SCALE);
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
    if (book) setBookResolution(rig, book, this.aniso, OPEN_BOOK_SCALE);
    this.refresh();
  }

  /** Recalcule les voisins du livre sorti et les fait passer au premier plan (couche 1). */
  private updateNeighbors(): void {
    const open = this.openId ? this.books.find((b) => b.id === this.openId) : undefined;
    let next: [Id | null, Id | null] = [null, null];
    if (open) {
      const stored = (b: Book): boolean => !!b.crate && this.crateRigs.has(b.crate);
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
      if (nb) ensureCover(rig, nb, this.aniso, true);
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
      if (book) setBookResolution(rig, book, this.aniso, 1);
    }
    this.openId = null;
    this.hintId = null;
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
    return this.camera.aspect < 1;
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
    if (book) setBookResolution(ex.rig, book, this.aniso, 1);
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
    if (this.hintId === id) return;
    this.hintId = id;
    for (const rig of this.crateRigs.values())
      rig.outline.visible = rig.id === this.selectedId || rig.id === id;
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
    this.grid.visible = mode === 'edit';
    this.axes.group.visible = mode === 'edit';
    this.refresh();
  }

  /** Cadre la caméra sur une caisse, en gardant la direction de vue. */
  focusCrate(id: Id): void {
    const c = this.crate(id);
    const rig = c && this.crateRigs.get(id);
    if (!c || !rig) return;
    focusCrateView(this.camera, this.controls.target, c, rig);
  }

  // ---------- API publique : vue ----------
  recenter(): void {
    recenterView(this.camera, this.controls.target, this.bounds());
  }

  /** Élément HTML de l'infobulle (titre du livre survolé), positionné par le moteur. */
  /** Étiquette HTML que le moteur colle à côté de la mésange (déplacée à chaque image, sans passer par React). */
  attachBirdLabel(el: HTMLElement | null): void {
    this.birdLabel = el;
  }

  attachTooltip(el: HTMLElement | null): void {
    this.input.attachTooltip(el);
  }

  dispose(): void {
    this.disposed = true;
    this.decor.disposeBird(this.scene);
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.texTimer);
    this.stopTextureWatch();
    for (const type of ['pointermove', 'pointerdown', 'pointerup', 'wheel'])
      this.canvas.removeEventListener(type, this.invalidate);
    window.removeEventListener('keydown', this.invalidate);
    this.resizeObserver.disconnect();
    this.input.detach();
    for (const id of [...this.crateRigs.keys()]) this.removeCrateRig(id);
    for (const rig of this.bookRigs.values()) disposeBookRig(rig);
    this.bookRigs.clear();
    disposeGroup(this.rotGizmo.group);
    disposeGroup(this.moveGizmo.group);
    this.missing.dispose();
    disposeGroup(this.decor.gizmo.group);
    this.scene.remove(this.rotGizmo.group, this.moveGizmo.group, this.decor.gizmo.group);
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ---------- état ----------
  private crate(id: Id): Crate | undefined {
    return this.crates.find((c) => c.id === id);
  }

  /** Colle l'étiquette de la mésange à sa position écran (cachée si la mésange l'est ou si un livre est sorti). */
  private placeBirdLabel(): void {
    const el = this.birdLabel;
    const bird = this.decor.group;
    if (!el) return;
    if (!bird?.visible || this.openId) {
      el.style.opacity = '0';
      el.style.visibility = 'hidden'; // le lien qu'elle contient ne doit plus être cliquable
      return;
    }
    // la tête est le haut de l'oiseau perché : sommet de sa boîte englobante, légèrement en dessous
    const box = this._box.setFromObject(bird);
    const p = box.getCenter(this._tv);
    p.y = box.max.y - (box.max.y - box.min.y) * 0.08;
    p.project(this.camera);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    el.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px)`;
    const shown = p.z < 1;
    el.style.opacity = shown ? '1' : '0';
    el.style.visibility = shown ? 'visible' : 'hidden';
  }

  // ---------- scène ----------
  /** Sol plat, uni. */
  private buildGround(): THREE.Mesh {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      this.transparent
        ? new THREE.ShadowMaterial({ opacity: 0.25 })
        : new THREE.MeshStandardMaterial({ color: 0xa9c29a, roughness: 1, envMapIntensity: 0.3 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    return ground;
  }

  private resize(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.touch();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private ensureCrateRig(c: Crate): CrateRig {
    let rig = this.crateRigs.get(c.id);
    const dims = crateDims(c);
    const key = `${dims.w}|${dims.h}|${dims.d}`;
    if (rig && (rig.size !== c.size || rig.dimsKey !== key)) {
      this.removeCrateRig(c.id);
      rig = undefined;
    }
    if (!rig) {
      rig = buildCrate(c.id, c.size, dims);
      rig.group.visible = !this.lite; // mode léger : les livres seuls, sans caisses
      this.scene.add(rig.group);
      this.crateRigs.set(c.id, rig);
      this.hitboxes.push(rig.hit);
    }
    return rig;
  }

  private removeCrateRig(id: Id): void {
    const rig = this.crateRigs.get(id);
    if (!rig) return;
    forgetCrateLabel(rig);
    disposeGroup(rig.group);
    this.scene.remove(rig.group);
    this.crateRigs.delete(id);
    const i = this.hitboxes.indexOf(rig.hit);
    if (i >= 0) this.hitboxes.splice(i, 1);
  }

  /** Gravité : chaque caisse repose sur le sol ou sur la plus haute caisse posée avant elle qu'elle chevauche. */
  private placeCrates(): void {
    applyGravity(this.crates);
    const labels = crateLabels(this.crates);
    for (const c of this.crates) {
      const fp = footprint(c);
      const rig = this.ensureCrateRig(c);
      setCrateLabel(rig, labels.get(c.id) ?? '');
      rig.group.position.set(c.x, c.y + fp.fy / 2, c.z);
      rig.group.quaternion.copy(quatOf(c));
      uprightLabel(rig, rig.group.quaternion);
      rig.outline.visible = c.id === this.selectedId || c.id === this.hintId;
      rig.group.updateMatrixWorld(true);
    }
    // les axes du repère couvrent juste les caisses posées (marge 5 cm), lettre au bout positif
    const bb = this.bounds();
    this.axes.setExtent('x', Math.min(bb.minX, 0) - 0.5, Math.max(bb.maxX, 0) + 0.5);
    this.axes.setExtent('z', Math.min(bb.minZ, 0) - 0.5, Math.max(bb.maxZ, 0) + 0.5);
    this.axes.setExtent('y', 0, Math.max(bb.maxY, 1) + 0.5);
    // flèches de rotation autour de la caisse sélectionnée (masquées pendant la lecture d'un livre)
    const sel = this.selectedId ? this.crate(this.selectedId) : undefined;
    const selRig = sel && this.crateRigs.get(sel.id);
    this.rotGizmo.group.visible = !!selRig && !this.openId && this.mode === 'edit';
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
      const above = this.crates.some(
        (o) => o !== sel && o.y > sel.y && overlaps(fps, footprint(o)),
      );
      this.moveGizmo.setVertical(above, false);
    }
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
      rig = makeBookRig(b, this.aniso);
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
      crateRigs: this.crateRigs,
      bounds: this.bounds(),
      aniso: this.aniso,
      mode: this.mode,
      rigOf: (b) => this.bookRig(b),
      isHeld: (b) => this.input.heldBook === b || b.id === this.openId,
    });
    this.counts = counts;
    this.stats = stats;
  }

  // ---------- boucle ----------
  private readonly tick = (): void => {
    if (this.disposed) return;
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const k = 1 - Math.exp(-dt * 7);
    this.showcase.update(
      this.camera,
      this.openId ? this.bookRigs.get(this.openId) : undefined,
      this.bookRigs,
      this.openBack,
      this.isPortrait(),
      () => this.finishExit(),
    );
    this.missing.updateCamera(this.camera, this.controls.target, k);
    this.decor.update(dt, this.timer.getElapsed());
    // la mésange s'anime en continu : une image sur deux environ suffit (jamais si elle est cachée)
    const now = performance.now();
    if (this.decor.group?.visible && now - this.lastBirdFrame > 50) {
      this.lastBirdFrame = now;
      this.dirty = true; // pas shadowDirty : la mésange seule ne change pas les ombres
    }
    for (const rig of this.bookRigs.values()) {
      this._tv.copy(rig.target);
      if (rig === this.input.hovered && rig.id !== this.openId) this._tv.y += 0.15;
      const s =
        this.openId && !this.isPortrait() && this.showcase.neighbors.includes(rig.id)
          ? NEIGHBOR_SCALE
          : 1;
      // un livre encore en mouvement (position, rotation ou taille) demande une nouvelle image
      if (
        rig.mesh.position.distanceToSquared(this._tv) > 1e-8 ||
        1 - Math.abs(rig.mesh.quaternion.dot(rig.quat)) > 1e-9 ||
        Math.abs(rig.mesh.scale.x - s) > 1e-5
      )
        this.touch();
      rig.mesh.position.lerp(this._tv, k);
      rig.mesh.quaternion.slerp(rig.quat, k);
      rig.mesh.scale.setScalar(rig.mesh.scale.x + (s - rig.mesh.scale.x) * k);
    }
    this.input.updateHover();
    this.controls.update();
    if (this.camera.position.y < 0.25) this.camera.position.y = 0.25; // jamais sous le sol
    this.placeBirdLabel();
    if (!this.dirty) {
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    this.dirty = false;
    this.renderer.shadowMap.needsUpdate = this.shadowDirty;
    this.shadowDirty = false;
    this.renderer.clear();
    this.camera.layers.set(0);
    this.renderer.render(this.scene, this.camera);
    if (this.openId) {
      // seconde passe : le livre sorti par-dessus tout (sans fond ni brouillard, qui forceraient un clear)
      const bg = this.scene.background;
      const fog = this.scene.fog;
      this.scene.background = null;
      this.scene.fog = null;
      this.renderer.clearDepth();
      this.camera.layers.set(1);
      this.renderer.render(this.scene, this.camera);
      this.camera.layers.set(0);
      this.scene.background = bg;
      this.scene.fog = fog;
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}
