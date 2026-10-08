import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { GRID_STEP, OUTLINE_PAD, PAD, PLANK as T, SCENE_BG, SIZES } from '@/constants';
import { clearLegacyState, crateDims, crateLabels, loadLegacyState, snap, uid } from '@/helpers';
import type {
  Book,
  Crate,
  CratePreset,
  CrateSize,
  Dims,
  Id,
  Prop,
  Mode,
  RotAxis,
  SavedState,
  Snapshot,
} from '@/types';

import {
  bookQuat,
  crateFrame,
  disposeBookRig,
  makeBookRig,
  newFillState,
  placeInCrate,
  setSpineFlat,
  setBookResolution,
  updateBookTextures,
  type BookRig,
} from './books';
import { buildCrate, forgetCrateLabel, setCrateLabel, uprightLabel, type CrateRig } from './crate';
import { buildRotateGizmo, type RotateGizmo } from './rotateGizmo';
import { buildGrid, buildWorldAxes, type WorldAxes } from './worldAxes';
import { disposeGroup } from './materials';
import { buildRubik, type RubikRig } from './rubik';
import { buildMoveGizmo, type MoveGizmo } from './moveGizmo';
import {
  AXES,
  Q_DEBOUT,
  Q_TRANCHE,
  extents,
  footprint,
  overlaps,
  quatOf,
  rotatedQuat,
} from './orientation';

type Drag = {
  c: Crate;
  dx: number;
  dz: number;
  plane: number;
  moved: boolean;
  sx: number;
  sy: number;
};
/** Déplacement libre d'un objet (cube) en Édition : aucune gravité, aucune collision. */
type DragProp = {
  p: Prop;
  /** Écart entre le centre de l'objet et le point saisi. */
  dx: number;
  dy: number;
  dz: number;
  /** Hauteur du plan horizontal sur lequel on le glisse. */
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
/** Champs modifiables d'un livre depuis la fiche. */
export type BookPatch = Partial<
  Pick<Book, 'title' | 'summary' | 'color' | 'cover' | 'author' | 'publisher' | 'year' | 'kind'>
>;

type Bounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
  cx: number;
  cz: number;
};

const HOME_DIR = new THREE.Vector3(0.62, 0.45, 0.76).normalize();
/** Résolution des textures du livre sorti (1 = celle des livres rangés). */
const OPEN_BOOK_SCALE = 2;
/** Taille des livres précédent / suivant présentés à côté du livre sorti. */
const NEIGHBOR_SCALE = 0.6;

/** Caisses de départ quand la base est vide et qu'il n'y a aucune ancienne sauvegarde. */
const defaultCrates = (): Crate[] => {
  const mk = (size: CrateSize, x: number, z: number, q = Q_TRANCHE): Crate => ({
    id: uid(),
    size,
    q: q.slice() as Crate['q'],
    x,
    z,
    y: 0,
  });
  return [
    mk('L', 0, 0),
    mk('M', 2.85, 0),
    mk('L', -3.1, 0),
    mk('S', 0, 0),
    mk('M', -3.1, 0),
    mk('S', 5.2, 0, Q_DEBOUT),
  ];
};
const isTyping = (): boolean => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');

/**
 * Scène three.js des caisses et des livres. Détient l'état du domaine (caisses, livres), le
 * persiste en localStorage et l'expose à React via subscribe / getSnapshot.
 */
export class CrateEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(2, 2);
  private readonly aniso: number;
  private readonly timer = new THREE.Timer();
  private readonly resizeObserver: ResizeObserver;

  private readonly crateRigs = new Map<Id, CrateRig>();
  private readonly hitboxes: THREE.Mesh[] = [];
  private readonly booksGroup = new THREE.Group();
  private readonly bookRigs = new Map<Id, BookRig>();

  private props: Prop[] = [];
  private readonly propRigs = new Map<Id, RubikRig>();
  /** Boîtes de sélection des objets libres (cube…), pour le picking en Édition. */
  private readonly propHits: THREE.Mesh[] = [];
  private crates: Crate[] = [];
  private books: Book[] = [];
  private messy = false;
  private selectedId: Id | null = null;
  /** Résultats d'une recherche présentés l'un après l'autre (précédent / suivant) ; null : voisins de la caisse. */
  private resultIds: Id[] | null = null;
  /** Caisse mise en surbrillance quand on survole sa place dans la fiche du livre sorti. */
  private hintId: Id | null = null;
  private openId: Id | null = null;
  /** Face visible du livre sorti : false = couverture, true = dos (résumé). */
  private openBack = false;
  private readonly counts = new Map<Id, number>();
  private stats = { stored: 0, loose: 0, full: 0 };

  /** Voisins du livre sorti (même caisse), présentés de part et d'autre : [précédent, suivant]. */
  private neighbors: [Id | null, Id | null] = [null, null];
  /** Livre qui sort de l'écran en glissant (téléphone) pendant que le suivant arrive. */
  private exiting: { rig: BookRig; dir: -1 | 1; start: number } | null = null;
  /** Sens d'arrivée du livre qui vient d'être ouvert par ‹ › (0 : pas d'animation). */
  private enterDir: -1 | 0 | 1 = 0;
  /** Appelé quand on tente de déplacer un livre en Lecture. */
  private onEditDenied: (() => void) | null = null;
  private hovered: BookRig | null = null;
  private hoverCrate: THREE.Mesh | null = null;
  private drag: Drag | null = null;
  private dragProp: DragProp | null = null;
  private dragBook: DragBook | null = null;
  private downEmpty: [number, number] | null = null;
  private readonly rotGizmo: RotateGizmo;
  private readonly moveGizmo: MoveGizmo;
  /** États précédents pour « Annuler » (le plus récent en dernier). */
  private readonly history: SavedState[] = [];
  private lastEdit: { id: Id; ts: number } | null = null;
  private readonly axes: WorldAxes;
  private readonly grid: THREE.GridHelper;
  private mode: Mode = 'view';
  private tooltip: HTMLElement | null = null;
  private texTimer = 0;
  private raf = 0;
  private disposed = false;

  private readonly listeners = new Set<() => void>();
  private snapshot: Snapshot;

  // vecteurs de travail
  private readonly _tv = new THREE.Vector3();
  private readonly _fwd = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _bx = new THREE.Vector3();
  private readonly _by = new THREE.Vector3();
  private readonly _bz = new THREE.Vector3();
  private readonly _local = new THREE.Vector3();
  private readonly _hitP = new THREE.Vector3();
  private readonly _basis = new THREE.Matrix4();
  private readonly _euler = new THREE.Euler();
  private readonly _q = new THREE.Quaternion();
  private readonly _plane = new THREE.Plane();
  private readonly _tilt = new THREE.Quaternion().setFromAxisAngle(AXES.x, -0.12);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.autoClear = false;
    this.renderer = renderer;
    this.aniso = renderer.capabilities.getMaxAnisotropy();

    this.scene.background = new THREE.Color(SCENE_BG);
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
    // clic molette = tourner autour, clic droit = déplacer la vue, clic gauche réservé aux caisses
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    this.controls = controls;

    // couche 1 : livre sorti, rendu par-dessus la scène
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8fa3b5, 0.35);
    hemi.layers.enable(1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.layers.enable(1);
    sun.position.set(10, 16, 8);
    sun.castShadow = true;
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
    this.axes = buildWorldAxes();
    this.grid = buildGrid();
    this.grid.visible = this.mode === 'edit';
    this.axes.group.visible = this.mode === 'edit';
    this.scene.add(this.grid, this.axes.group);
    this.rotGizmo = buildRotateGizmo();
    this.moveGizmo = buildMoveGizmo();
    this.scene.add(this.rotGizmo.group, this.moveGizmo.group);
    this.raycaster.layers.enableAll();

    this.snapshot = this.makeSnapshot();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    canvas.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('keydown', this.onKeyDown);

    this.refresh();
    this.recenter();
    this.tick();
    void this.hydrate();
  }

  // ---------- store ----------
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  private makeSnapshot(): Snapshot {
    return {
      crates: this.crates.map((c) => ({ ...c })),
      books: this.books.map((b) => ({ ...b })),
      messy: this.messy,
      selectedId: this.selectedId,
      openId: this.openId,
      openSide: this.openBack ? 'back' : 'front',
      counts: Object.fromEntries(this.counts),
      ...this.stats,
      canUndo: this.history.length > 0,
      browsing: this.resultIds !== null,
      hasPrev: !!this.neighbors[0],
      hasNext: !!this.neighbors[1],
      mode: this.mode,
    };
  }

  private emit(): void {
    this.snapshot = this.makeSnapshot();
    for (const l of this.listeners) l();
  }

  private syncTimer = 0;
  /** État MongoDB lu : avant ça, envoyer l'état local écraserait la base (sync = remplacement total). */
  private hydrated = false;

  /**
   * Charge l'état depuis MongoDB, seule sauvegarde. Base vide : on y migre une fois l'ancienne
   * sauvegarde localStorage (ou les caisses par défaut), puis on efface cette copie locale.
   */
  private async hydrate(first = true): Promise<void> {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      const data = (await res.json()) as {
        ok: boolean;
        rev?: number;
        crates?: Crate[];
        books?: Book[];
        props?: Prop[];
      };
      if (this.disposed || !data.ok) return;
      this.hydrated = false; // pas de renvoi de l'état qu'on est en train de charger
      const legacy = data.crates?.length ? null : loadLegacyState();
      this.restore(
        data.crates?.length
          ? { crates: data.crates, books: data.books ?? [], props: data.props ?? [], messy: false }
          : (legacy ?? { crates: defaultCrates(), books: [], messy: false }),
      );
      this.history.length = 0;
      this.rev = data.rev ?? 0;
      this.lastSent = data.crates?.length ? this.payload() : '';
      this.hydrated = true;
      if (data.crates?.length || (await this.push())) clearLegacyState();
      if (first) this.recenter();
      this.emit();
    } catch {
      // base injoignable : rien n'est envoyé, pour ne jamais écraser la base avec un état vide
    }
  }

  /** Révision de la base sur laquelle repose l'état affiché (voir /api/sync). */
  private rev = 0;
  /** Dernier état envoyé : ouvrir un livre ou sélectionner une caisse ne réécrit pas la base. */
  private lastSent = '';

  private payload(): string {
    return JSON.stringify({ crates: this.crates, books: this.books, props: this.props });
  }

  /** Recharge l'état depuis la base (modifiée ailleurs : Claude, un script…). */
  reload(): void {
    void this.hydrate(false);
  }

  /** Envoie l'état complet à MongoDB ; refusé si la base a changé ailleurs → on la recharge. */
  private async push(): Promise<boolean> {
    const body = this.payload();
    if (body === this.lastSent) return true;
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: `{"rev":${this.rev},${body.slice(1)}`,
      });
      const data = (await res.json()) as { ok: boolean; rev?: number; reason?: string };
      if (data.ok) {
        this.rev = data.rev ?? this.rev + 1;
        this.lastSent = body;
      } else if (data.reason === 'conflict') void this.hydrate(false);
      return data.ok;
    } catch {
      return false;
    }
  }

  private save(): void {
    if (!this.hydrated) return;
    window.clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => void this.push(), 800);
  }

  private refresh(): void {
    this.updateNeighbors();
    this.placeCrates();
    this.layoutBooks();
    this.syncProps();
    this.save();
    this.emit();
  }

  // ---------- historique ----------
  private pushHistory(): void {
    this.history.push(
      structuredClone({
        crates: this.crates,
        books: this.books,
        props: this.props,
        messy: this.messy,
      }),
    );
    if (this.history.length > 60) this.history.shift();
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
    this.props = s.props ?? [];
    this.messy = s.messy;
    for (const id of [...this.crateRigs.keys()])
      if (!this.crates.some((c) => c.id === id)) this.removeCrateRig(id);
    for (const [id, rig] of [...this.bookRigs]) {
      if (this.books.some((b) => b.id === id)) continue;
      disposeBookRig(rig);
      this.booksGroup.remove(rig.mesh);
      this.bookRigs.delete(id);
      if (this.hovered === rig) this.hovered = null;
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

  /** Crée, place et retire les objets libres (cube…) selon la liste `props`. */
  private syncProps(): void {
    for (const [id, rig] of [...this.propRigs]) {
      if (this.props.some((p) => p.id === id)) continue;
      this.scene.remove(rig.group);
      disposeGroup(rig.group);
      this.propHits.splice(this.propHits.indexOf(rig.hit), 1);
      this.propRigs.delete(id);
    }
    for (const p of this.props) {
      let rig = this.propRigs.get(p.id);
      if (!rig) {
        rig = buildRubik(p.id);
        this.scene.add(rig.group);
        this.propRigs.set(p.id, rig);
        this.propHits.push(rig.hit);
      }
      rig.group.position.set(p.x, p.y, p.z);
      rig.group.rotation.y = p.ry;
    }
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

  /** Cotes d'une caisse transparente (unités scène). */
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

  setCratePreset(id: Id, preset: CratePreset): void {
    const c = this.crate(id);
    if (!c) return;
    this.pushHistory();
    c.q = (preset === 'debout' ? Q_DEBOUT : Q_TRANCHE).slice() as Crate['q'];
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
      if (this.hovered === rig) this.hovered = null;
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
    const meta = 'author' in patch || 'publisher' in patch || 'year' in patch || 'kind' in patch;
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
    for (const id of this.neighbors) {
      const rig = id && !next.includes(id) && this.bookRigs.get(id);
      if (!rig) continue;
      rig.mesh.layers.set(0);
      rig.mesh.castShadow = true;
    }
    for (const id of next) {
      const rig = id && this.bookRigs.get(id);
      if (!rig || this.isPortrait()) continue;
      rig.mesh.layers.set(1);
      rig.mesh.castShadow = false;
    }
    this.neighbors = next;
  }

  /** Retourne le livre sorti : couverture ↔ dos (résumé). */
  flipBook(): void {
    if (!this.openId) return;
    this.openBack = !this.openBack;
    this.emit();
  }

  closeBook(doRefresh = true): void {
    const rig = this.openId ? this.bookRigs.get(this.openId) : undefined;
    if (rig && rig !== this.exiting?.rig) {
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
    const id = this.neighbors[dir < 0 ? 0 : 1];
    if (!id) return;
    const out = this.openId ? this.bookRigs.get(this.openId) : undefined;
    if (!this.isPortrait() || !out) {
      this.openBook(id);
      return;
    }
    // téléphone : le livre actuel part du côté opposé, le suivant arrive du côté où on va
    this.finishExit();
    this.exiting = { rig: out, dir, start: performance.now() };
    this.enterDir = dir;
    this.openBook(id);
  }

  /** Remet le livre sorti de l'écran à sa place dans la caisse, sans qu'on le voie voler. */
  private finishExit(): void {
    const ex = this.exiting;
    if (!ex) return;
    this.exiting = null;
    ex.rig.mesh.layers.set(0);
    ex.rig.mesh.castShadow = true;
    const book = this.books.find((b) => b.id === ex.rig.id);
    if (book) setBookResolution(ex.rig, book, this.aniso, 1);
    this.layoutBooks();
    ex.rig.mesh.position.copy(ex.rig.target);
    ex.rig.mesh.quaternion.copy(ex.rig.quat);
  }

  /** Fonction appelée quand un geste cherche à modifier la bibliothèque en Lecture (null : rien). */
  setEditDeniedHandler(handler: (() => void) | null): void {
    this.onEditDenied = handler;
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
    const cur = axis === 'x' ? c.x : c.z;
    const { fx, fz } = extents(c);
    const half = axis === 'x' ? fx / 2 : fz / 2;
    const { fx: ox, fz: oz } = extents(c, OUTLINE_PAD);
    const candidates = [snap(cur) + GRID_STEP, snap(cur) - GRID_STEP, snap(cur)];
    candidates.push(axis === 'x' ? ox / 2 : oz / 2, axis === 'x' ? -ox / 2 : -oz / 2);
    for (const o of this.crates) {
      if (o === c) continue;
      const fp = footprint(o);
      const [lo, hi, mid] = axis === 'x' ? [fp.x0, fp.x1, o.x] : [fp.z0, fp.z1, o.z];
      candidates.push(hi + half, lo - half, lo + half, hi - half, mid);
    }
    let best: number | null = null;
    for (const v of candidates) {
      if (sign * (v - cur) <= 1e-3) continue;
      if (best === null || Math.abs(v - cur) < Math.abs(best - cur)) best = v;
    }
    const next = Math.round((best ?? cur + sign * GRID_STEP) * 1000) / 1000;
    if (axis === 'x') c.x = next;
    else c.z = next;
    // ordre d'empilement inchangé : la caisse glisse à son niveau, elle ne passe pas au-dessus des autres
    this.refresh();
  }

  /** Édition (caisses réglables) ou bibliothèque (lecture seule, sans repère ni poignées). */
  setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'view') this.selectedId = null;
    this.grid.visible = mode === 'edit';
    this.axes.group.visible = mode === 'edit';
    this.refresh();
  }

  /** Cadre la caméra sur une caisse, en gardant la direction de vue. */
  focusCrate(id: Id): void {
    const c = this.crate(id);
    const rig = c && this.crateRigs.get(id);
    if (!c || !rig) return;
    const { fx, fy, fz } = extents(c);
    const dir = this._tv.copy(this.camera.position).sub(this.controls.target).normalize();
    this.controls.target.copy(rig.group.position);
    this.camera.position
      .copy(rig.group.position)
      .addScaledVector(dir, Math.max(fx, fy, fz) * 2.4 + 1);
  }

  // ---------- API publique : vue ----------
  recenter(): void {
    const bb = this.bounds();
    const extent = Math.max(bb.maxX - bb.minX, bb.maxZ - bb.minZ, bb.maxY * 1.6, 6);
    this.controls.target.set(bb.cx, bb.maxY * 0.45, bb.cz);
    this.camera.position.copy(this.controls.target).addScaledVector(HOME_DIR, extent * 1.55 + 3);
  }

  /** Élément HTML de l'infobulle (titre du livre survolé), positionné par le moteur. */
  attachTooltip(el: HTMLElement | null): void {
    this.tooltip = el;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.texTimer);
    this.resizeObserver.disconnect();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('keydown', this.onKeyDown);
    for (const id of [...this.crateRigs.keys()]) this.removeCrateRig(id);
    for (const rig of this.bookRigs.values()) disposeBookRig(rig);
    this.bookRigs.clear();
    for (const rig of this.propRigs.values()) disposeGroup(rig.group);
    this.propRigs.clear();
    disposeGroup(this.rotGizmo.group);
    disposeGroup(this.moveGizmo.group);
    this.scene.remove(this.rotGizmo.group, this.moveGizmo.group);
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ---------- état ----------
  private crate(id: Id): Crate | undefined {
    return this.crates.find((c) => c.id === id);
  }

  // ---------- scène ----------
  /** Sol plat, uni. */
  private buildGround(): THREE.Mesh {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: 0xa9c29a, roughness: 1, envMapIntensity: 0.3 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    return ground;
  }

  private resize(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
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
    const placed: { fp: ReturnType<typeof footprint>; top: number }[] = [];
    const labels = crateLabels(this.crates);
    for (const c of this.crates) {
      const fp = footprint(c);
      let top = 0;
      for (const p of placed) if (overlaps(fp, p.fp)) top = Math.max(top, p.top);
      c.y = top;
      placed.push({ fp, top: top + fp.fy });
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

  private bounds(): Bounds {
    if (!this.crates.length) return { minX: -3, maxX: 3, minZ: -3, maxZ: 3, maxY: 3, cx: 0, cz: 0 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let maxY = 0;
    for (const c of this.crates) {
      const fp = footprint(c);
      minX = Math.min(minX, fp.x0);
      maxX = Math.max(maxX, fp.x1);
      minZ = Math.min(minZ, fp.z0);
      maxZ = Math.max(maxZ, fp.z1);
      maxY = Math.max(maxY, c.y + fp.fy);
    }
    return { minX, maxX, minZ, maxZ, maxY, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
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

  /** Chaque livre appartient à une caisse (b.crate) ou à la pile « à côté ». Aucune redistribution automatique. */
  private layoutBooks(): void {
    this.counts.clear();
    for (const c of this.crates) this.counts.set(c.id, 0);
    const bb = this.bounds();
    let pileY = 0;
    let loose = 0;
    let full = 0;
    const toPile = (b: Book, rig: BookRig): void => {
      loose++;
      rig.target.set(
        bb.maxX + 1.2 + (Math.random() - 0.5) * 0.1,
        pileY + b.t / 2,
        bb.cz + (Math.random() - 0.5) * 0.15,
      );
      rig.quat.setFromEuler(this._euler.set(0, (Math.random() - 0.5) * 0.25, Math.PI / 2));
      rig.r = null;
      setSpineFlat(rig, false);
      pileY += b.t;
    };
    const held = (b: Book): boolean => this.dragBook?.b === b || b.id === this.openId;

    const byCrate = new Map<Id, Book[]>();
    const unassigned: Book[] = [];
    for (const b of this.books) {
      if (b.crate && this.crateRigs.has(b.crate)) {
        const list = byCrate.get(b.crate) ?? [];
        list.push(b);
        byCrate.set(b.crate, list);
      } else unassigned.push(b);
    }
    for (const [cid, list] of byCrate) {
      const c = this.crate(cid)!;
      const rig = this.crateRigs.get(cid)!;
      const fr = crateFrame(c, Math.max(...list.map((b) => b.h)));
      const st = newFillState(fr, Math.max(...list.map((k) => k.h)));
      const deepest = Math.max(...list.map((k) => k.d));
      const standQ = fr && bookQuat(fr.R, fr.U, fr.F);
      const flatQ = fr && bookQuat(fr.U, fr.R, fr.F);
      for (const b of list) {
        const br = this.bookRig(b);
        const ru = fr ? placeInCrate(fr, st, b) : null;
        if (!ru || !fr) {
          if (fr) full++;
          toPile(b, br);
          continue;
        }
        this.counts.set(cid, (this.counts.get(cid) ?? 0) + 1);
        br.r = ru[0];
        setSpineFlat(br, fr.mode === 'flat');
        if (held(b)) continue; // livre en main ou sorti : garde sa place, suit la souris / la caméra
        // au ras de l'ouverture ; un livre plus profond que la caisse est calé au fond et dépasse devant.
        // À plat, la pile se cale sur son livre le plus profond et les autres y sont centrés.
        const fOf = (d: number): number =>
          d > fr.innerF ? -fr.innerF / 2 + T / 2 + d / 2 : fr.innerF / 2 + T / 2 - 0.1 - d / 2;
        const f = !fr.front ? 0 : fOf(fr.mode === 'flat' ? deepest : b.d);
        this._local
          .set(0, 0, 0)
          .addScaledVector(fr.R, ru[0])
          .addScaledVector(fr.U, ru[1])
          .addScaledVector(fr.F, f);
        rig.group.localToWorld(this._local);
        br.target.copy(this._local);
        this._q.setFromEuler(
          this._euler.set(
            0,
            this.messy ? (Math.random() - 0.5) * 0.12 : 0,
            this.messy ? (Math.random() - 0.5) * 0.08 : 0,
          ),
        );
        br.quat
          .copy(rig.group.quaternion)
          .multiply(fr.mode === 'stand' ? standQ! : flatQ!)
          .multiply(this._q);
      }
    }
    for (const b of unassigned) {
      const br = this.bookRig(b);
      if (held(b)) {
        loose++;
        pileY += b.t;
        continue;
      }
      toPile(b, br);
    }
    this.stats = { stored: this.books.length - loose, loose, full };
    // lecture : un espace transparent n'est qu'un regroupement, sa coque s'efface (livres et numéro restent)
    for (const c of this.crates) {
      const rig = this.crateRigs.get(c.id);
      if (!rig || !rig.shell.length) continue;
      for (const o of rig.shell) o.visible = this.mode !== 'view';
    }
  }

  // ---------- pointeur ----------
  private setPointer(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  private groundPoint(y: number): THREE.Vector3 | null {
    this._plane.set(AXES.y, -y);
    return this.raycaster.ray.intersectPlane(this._plane, this._hitP);
  }

  private visibleBookMeshes(): THREE.Object3D[] {
    return this.booksGroup.children.filter((m) => m.visible);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.setPointer(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // flèches : déplacement d'un cran, ou quart de tour dans le sens de la flèche
    if (this.mode === 'edit' && this.rotGizmo.group.visible && this.selectedId) {
      const hm = this.raycaster.intersectObjects(this.moveGizmo.activeHits(), false)[0];
      if (hm) {
        const { axis, sign } = hm.object.userData as { axis: RotAxis; sign: 1 | -1 };
        this.stepCrate(this.selectedId, axis, sign);
        return;
      }
      const hr = this.raycaster.intersectObjects(this.rotGizmo.hits, false)[0];
      if (hr) {
        const { axis, sign } = hr.object.userData as { axis: RotAxis; sign: 1 | -1 };
        this.rotateCrate(this.selectedId, axis, sign);
        return;
      }
    }
    // objet libre (cube) : se saisit en Édition, avant les livres et les caisses
    const hp =
      this.mode === 'edit' ? this.raycaster.intersectObjects(this.propHits, false)[0] : undefined;
    const prop = hp && this.props.find((q) => q.id === hp.object.userData.propId);
    if (hp && prop) {
      this.dragProp = {
        p: prop,
        dx: prop.x - hp.point.x,
        dy: prop.y - hp.point.y,
        dz: prop.z - hp.point.z,
        plane: hp.point.y,
        moved: false,
        sx: e.clientX,
        sy: e.clientY,
      };
      this.controls.enabled = false;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    // livre d'abord
    const hb = this.raycaster.intersectObjects(this.visibleBookMeshes(), false)[0];
    if (hb) {
      const id = hb.object.userData.id as Id;
      // voisin présenté à côté du livre sorti : un clic l'ouvre à son tour
      if (this.openId && this.neighbors.includes(id)) {
        this.openBook(id);
        return;
      }
      // le livre sorti ne se déplace plus : un clic dessus le retourne (couverture ↔ dos)
      if (id === this.openId) {
        this.flipBook();
        return;
      }
      const b = this.books.find((k) => k.id === id);
      const rig = this.bookRigs.get(id);
      if (b && rig) {
        this.dragBook = { b, dragged: false, sx: e.clientX, sy: e.clientY };
        this.controls.enabled = false;
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
    }
    const hit = this.raycaster.intersectObjects(this.hitboxes, false)[0];
    if (!hit || this.mode === 'view') {
      this.downEmpty = [e.clientX, e.clientY];
      return;
    }
    const c = this.crate(hit.object.userData.id as Id);
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
    this.controls.enabled = false;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    this.setPointer(e);
    if (this.tooltip) {
      this.tooltip.style.left = `${e.clientX}px`;
      this.tooltip.style.top = `${e.clientY}px`;
    }
    const dp = this.dragProp;
    if (dp) {
      if (!dp.moved) {
        if (Math.hypot(e.clientX - dp.sx, e.clientY - dp.sy) < 5) return;
        dp.moved = true;
        this.pushHistory();
        this.canvas.style.cursor = 'grabbing';
      }
      this.raycaster.setFromCamera(this.pointer, this.camera);
      if (e.shiftKey) {
        // Maj : monter / descendre, sur un plan vertical face à la caméra
        this.camera.getWorldDirection(this._fwd);
        this._fwd.y = 0;
        this._plane.setFromNormalAndCoplanarPoint(
          this._fwd.normalize(),
          this._tv.set(dp.p.x - dp.dx, dp.plane, dp.p.z - dp.dz),
        );
        const hit = this.raycaster.ray.intersectPlane(this._plane, this._hitP);
        if (hit) dp.p.y = Math.max(0, hit.y + dp.dy);
      } else {
        const gp = this.groundPoint(dp.plane);
        if (gp) {
          dp.p.x = gp.x + dp.dx;
          dp.p.z = gp.z + dp.dz;
        }
      }
      this.syncProps();
      return;
    }
    const db = this.dragBook;
    if (db) {
      // un livre ne se déplace pas : un glisser est signalé une fois (« pas touche ») et ignoré
      if (!db.dragged && Math.hypot(e.clientX - db.sx, e.clientY - db.sy) >= 5) {
        db.dragged = true;
        this.onEditDenied?.();
      }
      return;
    }
    const d = this.drag;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
      d.moved = true;
      this.pushHistory();
      // la caisse glissée devient la dernière posée → atterrit sur ce qu'elle chevauche
      this.crates.splice(this.crates.indexOf(d.c), 1);
      this.crates.push(d.c);
      this.selectedId = d.c.id;
      this.canvas.style.cursor = 'grabbing';
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const gp = this.groundPoint(d.plane);
    if (!gp) return;
    [d.c.x, d.c.z] = this.magnet(d.c, gp.x + d.dx, gp.z + d.dz);
    this.placeCrates();
    this.layoutBooks();
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const dp = this.dragProp;
    if (dp) {
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        // capture déjà relâchée
      }
      this.dragProp = null;
      this.controls.enabled = true;
      this.canvas.style.cursor = '';
      if (dp.moved) this.refresh();
      return;
    }
    const db = this.dragBook;
    if (db) {
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        // capture déjà relâchée
      }
      this.dragBook = null;
      this.controls.enabled = true;
      this.canvas.style.cursor = '';
      if (db.dragged) {
        // glisser sur un livre : rien ne bouge, rien ne s'ouvre
      } else if (this.openId === db.b.id)
        this.closeBook(); // clic sur le livre sorti : on le range
      else if (this.mode === 'edit') {
        // édition : on règle les caisses, un clic sur un livre sélectionne celle qui le contient
        if (db.b.crate && this.crate(db.b.crate)) this.selectedId = db.b.crate;
        this.refresh();
      } else this.openBook(db.b.id); // lecture : clic simple, on le sort
      this.downEmpty = null;
      return;
    }
    const d = this.drag;
    if (d) {
      if (!d.moved) this.selectedId = this.selectedId === d.c.id ? null : d.c.id;
      this.refresh();
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        // capture déjà relâchée
      }
      this.drag = null;
      this.controls.enabled = true;
      this.canvas.style.cursor = '';
    } else if (this.downEmpty) {
      if (Math.hypot(e.clientX - this.downEmpty[0], e.clientY - this.downEmpty[1]) < 5) {
        if (this.openId) this.closeBook(false);
        this.selectedId = null;
        this.refresh();
      }
    }
    this.downEmpty = null;
  };

  private readonly onPointerLeave = (): void => {
    this.pointer.set(2, 2);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.openId) {
      this.closeBook();
      return;
    }
    if (isTyping()) return;
    if (this.openId && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const id = this.neighbors[e.key === 'ArrowLeft' ? 0 : 1];
      if (id) this.openBook(id);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.undo();
      return;
    }
    if (e.key === 'Delete' && this.selectedId && !this.openId && this.mode === 'edit') {
      this.removeCrate(this.selectedId);
    }
  };

  /**
   * Aimantation : colle les bords de la caisse glissée aux bords des autres, sinon grille.
   * Contre une autre caisse, on se cale sur trois positions par axe : collée sur le côté → derrière,
   * milieu, devant ; collée devant ou derrière → gauche, milieu, droite ; posée dessus → les deux.
   */
  private magnet(c: Crate, rawX: number, rawZ: number): [number, number] {
    const { fx, fz } = extents(c);
    const TH = 0.45;
    const nearest = (raw: number, candidates: number[]): number =>
      candidates.reduce((best, v) => (Math.abs(v - raw) < Math.abs(best - raw) ? v : best));
    let bx = { v: snap(rawX), d: TH };
    let bz = { v: snap(rawZ), d: TH };
    // le cadre de sélection vient se poser sur les axes du repère (X : z = 0, Z : x = 0)
    const { fx: ox, fz: oz } = extents(c, OUTLINE_PAD);
    for (const v of [ox / 2, -ox / 2]) {
      const d = Math.abs(v - rawX);
      if (d < bx.d) bx = { v, d };
    }
    for (const v of [oz / 2, -oz / 2]) {
      const d = Math.abs(v - rawZ);
      if (d < bz.d) bz = { v, d };
    }
    const others = this.crates.filter((o) => o !== c).map((o) => ({ o, fp: footprint(o) }));
    for (const { o, fp } of others) {
      for (const v of [fp.x1 + fx / 2, fp.x0 - fx / 2, fp.x0 + fx / 2, fp.x1 - fx / 2, o.x]) {
        const d = Math.abs(v - rawX);
        if (d < bx.d) bx = { v, d };
      }
      for (const v of [fp.z1 + fz / 2, fp.z0 - fz / 2, fp.z0 + fz / 2, fp.z1 - fz / 2, o.z]) {
        const d = Math.abs(v - rawZ);
        if (d < bz.d) bz = { v, d };
      }
    }
    const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
    let x = bx.v;
    let z = bz.v;
    const contacts = others.map(({ o, fp }) => ({
      o,
      fp,
      sideX: near(bx.v, fp.x1 + fx / 2) || near(bx.v, fp.x0 - fx / 2),
      sideZ: near(bz.v, fp.z1 + fz / 2) || near(bz.v, fp.z0 - fz / 2),
      overlapZ: rawZ + fz / 2 > fp.z0 && rawZ - fz / 2 < fp.z1,
      overlapX: rawX + fx / 2 > fp.x0 && rawX - fx / 2 < fp.x1,
      xs: [fp.x0 + fx / 2, o.x, fp.x1 - fx / 2],
      zs: [fp.z0 + fz / 2, o.z, fp.z1 - fz / 2],
    }));
    // 1) contact latéral : prioritaire, c'est lui qui permet de glisser une caisse dans un trou
    let touching = false;
    for (const k of contacts) {
      // collée à gauche ou à droite : derrière (fonds alignés), milieu, devant (ouvertures alignées)
      if (k.sideX && k.overlapZ) {
        z = nearest(rawZ, k.zs);
        touching = true;
      }
      // collée devant ou derrière : bord gauche, milieu, bord droit
      if (k.sideZ && k.overlapX) {
        x = nearest(rawX, k.xs);
        touching = true;
      }
    }
    // 2) posée dessus (contact en Y) : seulement si aucun contact latéral, et si le centre de la caisse
    //    glissée est au-dessus de l'autre (un simple frôlement n'empêche pas de venir contre un flanc)
    if (!touching)
      for (const k of contacts) {
        const above = rawX > k.fp.x0 && rawX < k.fp.x1 && rawZ > k.fp.z0 && rawZ < k.fp.z1;
        if (!above) continue;
        x = nearest(rawX, k.xs);
        z = nearest(rawZ, k.zs);
      }
    return [Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000];
  }

  private showTooltip(on: boolean, text?: string): void {
    if (!this.tooltip) return;
    if (text !== undefined) this.tooltip.textContent = text;
    this.tooltip.style.opacity = on ? '1' : '0';
  }

  private updateHover(): void {
    if (this.drag || this.dragBook || this.dragProp) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.mode === 'edit' && this.raycaster.intersectObjects(this.propHits, false).length) {
      this.hovered = null;
      this.hoverCrate = null;
      this.showTooltip(false);
      this.canvas.style.cursor = 'move';
      return;
    }
    if (this.rotGizmo.group.visible) {
      const hm = this.raycaster.intersectObjects(this.moveGizmo.activeHits(), false)[0];
      this.moveGizmo.highlight(hm ? (hm.object.userData.axis as RotAxis) : null);
      const hr = hm ? undefined : this.raycaster.intersectObjects(this.rotGizmo.hits, false)[0];
      this.rotGizmo.highlight(hr ? (hr.object.userData.axis as RotAxis) : null);
      if (hm || hr) {
        this.hovered = null;
        this.hoverCrate = null;
        this.showTooltip(false);
        this.canvas.style.cursor = 'grab';
        return;
      }
    }
    const hitBook = this.raycaster.intersectObjects(this.visibleBookMeshes(), false)[0];
    const rig = hitBook ? (this.bookRigs.get(hitBook.object.userData.id as Id) ?? null) : null;
    if (rig !== this.hovered) {
      this.hovered = rig;
      const b = rig ? this.books.find((x) => x.id === rig.id) : undefined;
      if (b) this.showTooltip(false, b.title);
    }
    this.showTooltip(!!this.hovered && this.hovered.id !== this.openId);
    const hitCrate = rig ? undefined : this.raycaster.intersectObjects(this.hitboxes, false)[0];
    this.hoverCrate = hitCrate ? (hitCrate.object as THREE.Mesh) : null;
    this.canvas.style.cursor = rig ? 'pointer' : this.hoverCrate ? 'move' : '';
  }

  // ---------- boucle ----------
  /** Le livre sorti flotte devant la caméra, décalé à gauche pour laisser la fiche à droite. */
  private updateShowcase(): void {
    this.camera.getWorldDirection(this._fwd);
    this._right.crossVectors(this._fwd, this.camera.up).normalize();
    const rig = this.openId ? this.bookRigs.get(this.openId) : undefined;
    if (!rig) return;
    let dist = Math.max(3.8, rig.mesh.geometry.parameters.height * 1.9);
    const portrait = this.isPortrait();
    const openW = rig.mesh.geometry.parameters.depth;
    const spread = 1.15;
    const gaps = this.neighbors.map((id) => {
      const nr = id && this.bookRigs.get(id);
      return nr ? (openW + nr.mesh.geometry.parameters.depth * NEIGHBOR_SCALE) / 2 + 0.3 : 0;
    });
    if (portrait) {
      // téléphone : un seul livre, le plus grand possible (largeur ou hauteur, 8 % de marge)
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const fitH = (rig.mesh.geometry.parameters.height / 2) * 1.08;
      const fitW = (openW / 2) * 1.08;
      dist = Math.max(fitH / tanHalf, fitW / (tanHalf * this.camera.aspect));
    }
    const shift = portrait ? 0 : -dist * 0.22;
    this._tv
      .copy(this.camera.position)
      .addScaledVector(this._fwd, dist)
      .addScaledVector(this._right, shift);
    rig.target.copy(this._tv);
    const tanHalfV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const off = tanHalfV * this.camera.aspect * dist * 2;
    if (this.enterDir !== 0)
      rig.mesh.position.copy(this._tv).addScaledVector(this._right, this.enterDir * off);
    // couverture (+X) par défaut, dos avec le résumé (-X) une fois retourné
    this._bx.copy(this._fwd);
    if (!this.openBack) this._bx.negate();
    this._bz.crossVectors(this._bx, this.camera.up).normalize();
    this._by.crossVectors(this._bz, this._bx);
    this._basis.makeBasis(this._bx, this._by, this._bz);
    rig.quat.setFromRotationMatrix(this._basis);
    if (this.enterDir !== 0) {
      rig.mesh.quaternion.copy(rig.quat);
      this.enterDir = 0;
    }
    const ex = this.exiting;
    if (ex) {
      ex.rig.target.copy(this._tv).addScaledVector(this._right, -ex.dir * off);
      ex.rig.quat.copy(rig.quat);
      if (performance.now() - ex.start > 600) this.finishExit();
    }

    // voisins : couverture visible, un peu en retrait, tournés vers le livre sorti (pas sur téléphone)
    if (portrait) return;
    this.neighbors.forEach((id, i) => {
      const nr = id && this.bookRigs.get(id);
      if (!nr) return;
      const side = i === 0 ? -1 : 1;
      const gap = gaps[i] ?? 0;
      nr.target
        .copy(this.camera.position)
        .addScaledVector(this._fwd, dist + 0.6)
        .addScaledVector(this._right, shift + side * gap * spread);
      this._bx.copy(this._fwd).negate();
      this._bz.crossVectors(this._bx, this.camera.up).normalize();
      this._by.crossVectors(this._bz, this._bx);
      this._basis.makeBasis(this._bx, this._by, this._bz);
      nr.quat
        .setFromRotationMatrix(this._basis)
        .premultiply(this._q.setFromAxisAngle(this.camera.up, -side * 0.45));
    });
  }

  private readonly tick = (): void => {
    if (this.disposed) return;
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const k = 1 - Math.exp(-dt * 7);
    this.updateShowcase();
    for (const rig of this.bookRigs.values()) {
      this._tv.copy(rig.target);
      if (rig === this.hovered && rig.id !== this.openId) this._tv.y += 0.15;
      rig.mesh.position.lerp(this._tv, k);
      rig.mesh.quaternion.slerp(rig.quat, k);
      const s =
        this.openId && !this.isPortrait() && this.neighbors.includes(rig.id) ? NEIGHBOR_SCALE : 1;
      rig.mesh.scale.setScalar(rig.mesh.scale.x + (s - rig.mesh.scale.x) * k);
    }
    this.updateHover();
    this.controls.update();
    if (this.camera.position.y < 0.25) this.camera.position.y = 0.25; // jamais sous le sol
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
