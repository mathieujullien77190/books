import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeBook, makeCrate } from '@/test/fixtures';
import type { Book, Crate, Id, Mode } from '@/types';

import type { BookRig } from './books';
import type { Decor } from './decor';
import { PointerInput, type InputHost } from './input';
import type { MissingPile } from './missingPile';
import type { MoveGizmo } from './moveGizmo';
import type { RotateGizmo } from './rotateGizmo';

type Handler = (e: unknown) => void;
type Spied = ReturnType<typeof vi.fn>;

type Ev = {
  button?: number;
  pointerType?: string;
  pointerId?: number;
  clientX?: number;
  clientY?: number;
};
const ev = (over: Ev = {}) => ({
  button: 0,
  pointerType: 'mouse',
  pointerId: 1,
  clientX: 400,
  clientY: 300,
  ...over,
});

// ---- état et doubles ----
let mode: Mode;
let selected: Id | null;
let open: Id | null;
let neighbors: [Id | null, Id | null];
let crates: Crate[];
let books: Book[];
let rigs: Map<Id, BookRig>;
/** Objets « sous le pointeur » : le rayon ne touche que ceux-là. */
let under: Set<object>;
let activeTag: string | undefined;

let canvasHandlers: Map<string, { fn: Handler; opts: unknown }>;
let windowHandlers: Map<string, Handler>;
let canvas: {
  addEventListener: Spied;
  removeEventListener: Spied;
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number };
  setPointerCapture: Spied;
  releasePointerCapture: Spied;
  style: { cursor: string };
};
let camera: THREE.PerspectiveCamera;
let controls: { enabled: boolean };
let hitboxes: THREE.Mesh[];
let moveHit: THREE.Mesh;
let rotHit: THREE.Mesh;
let moveGizmo: { group: { visible: boolean }; activeHits: Spied; highlight: Spied };
let rotGizmo: { group: { visible: boolean }; hits: THREE.Mesh[]; highlight: Spied };
let decor: {
  selected: boolean;
  gizmo: { group: { visible: boolean } };
  hitArrow: Spied;
  hitsBird: Spied;
};
let missing: { browsing: boolean; hitsNote: Spied; hitIndex: Spied; show: Spied };
let h: Record<string, Spied>;
let input: PointerInput;
let tooltip: { style: Record<string, string>; textContent: string };

const mesh = (id: string, extra: object = {}): THREE.Mesh => {
  const m = new THREE.Mesh();
  m.userData = { id, ...extra };
  return m;
};

const bookMesh = (b: Book): THREE.Mesh => {
  const m = mesh(b.id);
  const rig = { id: b.id, mesh: m } as unknown as BookRig;
  rigs.set(b.id, rig);
  books.push(b);
  return m;
};

let bookMeshes: THREE.Object3D[];

const build = (): void => {
  h = {
    setSelected: vi.fn((id: Id | null) => {
      selected = id;
    }),
    stepCrate: vi.fn(),
    rotateCrate: vi.fn(),
    stepMesange: vi.fn(),
    browseMissing: vi.fn(),
    stepMissing: vi.fn(),
    endMissingBrowse: vi.fn(),
    openBook: vi.fn(),
    closeBook: vi.fn(),
    flipBook: vi.fn(),
    undo: vi.fn(),
    removeCrate: vi.fn(),
    focusCrate: vi.fn(),
    pushHistory: vi.fn(),
    refresh: vi.fn(),
    emit: vi.fn(),
    relayout: vi.fn(),
  };
  const host: InputHost = {
    canvas: canvas as unknown as HTMLCanvasElement,
    camera,
    controls: controls as unknown as OrbitControls,
    hitboxes,
    rotGizmo: rotGizmo as unknown as RotateGizmo,
    moveGizmo: moveGizmo as unknown as MoveGizmo,
    decor: decor as unknown as Decor,
    missing: missing as unknown as MissingPile,
    mode: () => mode,
    selectedId: () => selected,
    openId: () => open,
    neighbors: () => neighbors,
    crates: () => crates,
    crateById: (id) => crates.find((c) => c.id === id),
    bookById: (id) => books.find((b) => b.id === id),
    bookRigById: (id) => rigs.get(id),
    bookMeshes: () => bookMeshes,
    setSelected: h.setSelected!,
    stepCrate: h.stepCrate!,
    rotateCrate: h.rotateCrate!,
    stepMesange: h.stepMesange!,
    browseMissing: h.browseMissing!,
    stepMissing: h.stepMissing!,
    endMissingBrowse: h.endMissingBrowse!,
    openBook: h.openBook!,
    closeBook: h.closeBook!,
    flipBook: h.flipBook!,
    undo: h.undo!,
    removeCrate: h.removeCrate!,
    focusCrate: h.focusCrate!,
    pushHistory: h.pushHistory!,
    refresh: h.refresh!,
    emit: h.emit!,
    relayout: h.relayout!,
  };
  input = new PointerInput(host);
  input.attach();
};

const fire = (type: string, e: unknown = ev()): void => canvasHandlers.get(type)!.fn(e);
const key = (k: string, extra: object = {}): { preventDefault: Spied } => {
  const e = { key: k, preventDefault: vi.fn(), ...extra };
  windowHandlers.get('keydown')!(e);
  return e;
};

beforeEach(() => {
  mode = 'view';
  selected = null;
  open = null;
  neighbors = [null, null];
  crates = [];
  books = [];
  rigs = new Map();
  under = new Set();
  activeTag = undefined;
  bookMeshes = [];
  canvasHandlers = new Map();
  windowHandlers = new Map();
  canvas = {
    addEventListener: vi.fn((type: string, fn: Handler, opts?: unknown) => {
      canvasHandlers.set(type, { fn, opts });
    }),
    removeEventListener: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    style: { cursor: '' },
  };
  vi.stubGlobal('window', {
    addEventListener: vi.fn((type: string, fn: Handler) => windowHandlers.set(type, fn)),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('document', {
    get activeElement() {
      return activeTag ? { tagName: activeTag } : null;
    },
  });
  // le rayon ne touche que les objets désignés par `under` (la géométrie réelle n'est pas l'objet du test)
  vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockImplementation(
    (objs: THREE.Object3D[]) =>
      objs.filter((o) => under.has(o)).map((object) => ({ object }) as THREE.Intersection),
  );
  // caméra au-dessus du sol, regardant l'origine : le centre de l'écran vise (0, 0, 0)
  camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100);
  camera.position.set(0, 10, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  controls = { enabled: true };
  hitboxes = [];
  moveHit = mesh('', { axis: 'x', sign: 1 });
  rotHit = mesh('', { axis: 'y', sign: -1 });
  moveGizmo = {
    group: { visible: false },
    activeHits: vi.fn(() => [moveHit]),
    highlight: vi.fn(),
  };
  rotGizmo = { group: { visible: false }, hits: [rotHit], highlight: vi.fn() };
  decor = {
    selected: false,
    gizmo: { group: { visible: false } },
    hitArrow: vi.fn(() => null),
    hitsBird: vi.fn(() => false),
  };
  missing = {
    browsing: false,
    hitsNote: vi.fn(() => false),
    hitIndex: vi.fn(() => -1),
    show: vi.fn(),
  };
  tooltip = { style: {}, textContent: '' };
  build();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('attach / detach', () => {
  it('écoute le canevas (pointerdown en capture) et le clavier de la fenêtre', () => {
    expect([...canvasHandlers.keys()].sort()).toEqual([
      'pointercancel',
      'pointerdown',
      'pointerleave',
      'pointermove',
      'pointerup',
    ]);
    expect(canvasHandlers.get('pointerdown')!.opts).toEqual({ capture: true });
    expect(canvasHandlers.get('pointercancel')!.fn).toBe(canvasHandlers.get('pointerup')!.fn);
    expect(windowHandlers.has('keydown')).toBe(true);
  });

  it('detach retire exactement les mêmes écouteurs', () => {
    input.detach();
    const removed = canvas.removeEventListener.mock.calls.map((c) => c[0]).sort();
    expect(removed).toEqual([
      'pointercancel',
      'pointerdown',
      'pointerleave',
      'pointermove',
      'pointerup',
    ]);
    for (const [type, fn] of canvas.removeEventListener.mock.calls)
      expect(fn).toBe(canvasHandlers.get(type as string)!.fn);
    expect(canvas.removeEventListener.mock.calls.find((c) => c[0] === 'pointerdown')![2]).toEqual({
      capture: true,
    });
    const w = (window as unknown as { removeEventListener: Spied }).removeEventListener;
    expect(w).toHaveBeenCalledWith('keydown', windowHandlers.get('keydown'));
  });
});

describe('clic sur une flèche (Édition)', () => {
  beforeEach(() => {
    mode = 'edit';
    selected = 'c1';
    rotGizmo.group.visible = true;
    crates = [makeCrate({ id: 'c1' })];
  });

  it('une flèche de déplacement déplace la caisse sélectionnée d’un cran', () => {
    under.add(moveHit);
    fire('pointerdown');
    expect(h.stepCrate).toHaveBeenCalledWith('c1', 'x', 1);
    expect(h.rotateCrate).not.toHaveBeenCalled();
  });

  it('une flèche de rotation tourne la caisse d’un quart de tour', () => {
    under.add(rotHit);
    fire('pointerdown');
    expect(h.rotateCrate).toHaveBeenCalledWith('c1', 'y', -1);
    expect(h.stepCrate).not.toHaveBeenCalled();
  });

  it('les flèches ne répondent ni en lecture, ni cachées, ni sans caisse sélectionnée', () => {
    under.add(moveHit).add(rotHit);
    mode = 'view';
    fire('pointerdown');
    mode = 'edit';
    rotGizmo.group.visible = false;
    fire('pointerdown');
    rotGizmo.group.visible = true;
    selected = null;
    fire('pointerdown');
    expect(h.stepCrate).not.toHaveBeenCalled();
    expect(h.rotateCrate).not.toHaveBeenCalled();
  });
});

describe('clic sur les manquants', () => {
  it('le papier « Livres à acheter » lance le défilé', () => {
    missing.hitsNote.mockReturnValue(true);
    fire('pointerdown');
    expect(h.browseMissing).toHaveBeenCalledTimes(1);
  });

  it('un livre manquant du tas est montré en gros plan, le livre sorti est rangé', () => {
    missing.hitIndex.mockReturnValue(2);
    fire('pointerdown');
    expect(h.closeBook).toHaveBeenCalledWith(false);
    expect(missing.show).toHaveBeenCalledWith(2);
    expect(h.emit).toHaveBeenCalledTimes(1);
  });

  it('ces gestes sont ignorés pendant la lecture d’un livre', () => {
    open = 'o';
    missing.hitsNote.mockReturnValue(true);
    missing.hitIndex.mockReturnValue(1);
    fire('pointerdown');
    expect(h.browseMissing).not.toHaveBeenCalled();
    expect(missing.show).not.toHaveBeenCalled();
    expect(missing.hitsNote).not.toHaveBeenCalled();
  });
});

describe('clic sur la mésange (Édition)', () => {
  beforeEach(() => {
    mode = 'edit';
  });

  it('une flèche de la mésange la déplace d’un cran', () => {
    decor.gizmo.group.visible = true;
    decor.hitArrow.mockReturnValue({ axis: 'z', sign: -1 });
    fire('pointerdown');
    expect(h.stepMesange).toHaveBeenCalledWith('z', -1);
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it('sans flèche touchée, le geste continue vers la mésange elle-même', () => {
    decor.gizmo.group.visible = true;
    decor.hitsBird.mockReturnValue(true);
    fire('pointerdown');
    expect(h.stepMesange).not.toHaveBeenCalled();
    expect(decor.selected).toBe(true);
  });

  it('un clic sur elle la sélectionne et désélectionne la caisse', () => {
    selected = 'c1';
    decor.hitsBird.mockReturnValue(true);
    fire('pointerdown');
    expect(selected).toBeNull();
    expect(decor.selected).toBe(true);
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it('en lecture ou livre ouvert, la mésange ne se sélectionne pas', () => {
    decor.hitsBird.mockReturnValue(true);
    decor.gizmo.group.visible = true;
    decor.hitArrow.mockReturnValue({ axis: 'x', sign: 1 });
    mode = 'view';
    fire('pointerdown');
    mode = 'edit';
    open = 'o';
    fire('pointerdown');
    expect(decor.selected).toBe(false);
    expect(h.stepMesange).toHaveBeenCalledTimes(1); // l'ouverture d'un livre ne masque pas ses flèches
  });
});

describe('clic sur un livre', () => {
  it('démarre un geste : caméra suspendue et pointeur capturé à la souris', () => {
    const m = bookMesh(makeBook({ id: 'a' }));
    bookMeshes = [m];
    under.add(m);
    fire('pointerdown', ev({ pointerId: 7 }));
    expect(controls.enabled).toBe(false);
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(7);
    expect(input.heldBook?.id).toBe('a');
  });

  it('au doigt, la caméra reste active pour permettre le pincement', () => {
    const m = bookMesh(makeBook({ id: 'a' }));
    bookMeshes = [m];
    under.add(m);
    fire('pointerdown', ev({ pointerType: 'touch' }));
    expect(controls.enabled).toBe(true);
    expect(canvas.setPointerCapture).not.toHaveBeenCalled();
    expect(input.heldBook?.id).toBe('a');
  });

  it('un voisin du livre sorti s’ouvre à son tour', () => {
    const m = bookMesh(makeBook({ id: 'n' }));
    bookMeshes = [m];
    under.add(m);
    open = 'o';
    neighbors = [null, 'n'];
    fire('pointerdown');
    expect(h.openBook).toHaveBeenCalledWith('n');
    expect(input.heldBook).toBeNull();
  });

  it('un clic sur le livre sorti le retourne', () => {
    const m = bookMesh(makeBook({ id: 'o' }));
    bookMeshes = [m];
    under.add(m);
    open = 'o';
    fire('pointerdown');
    expect(h.flipBook).toHaveBeenCalledTimes(1);
    expect(input.heldBook).toBeNull();
  });

  it('un livre dont la fiche ou le rig manque ne démarre aucun geste', () => {
    const m = mesh('fantome');
    bookMeshes = [m];
    under.add(m);
    fire('pointerdown');
    expect(input.heldBook).toBeNull();
    expect(controls.enabled).toBe(true);
  });

  it('un livre sans rig ne démarre pas de geste non plus', () => {
    const m = bookMesh(makeBook({ id: 'a' }));
    rigs.delete('a');
    bookMeshes = [m];
    under.add(m);
    fire('pointerdown');
    expect(input.heldBook).toBeNull();
  });

  it('un second doigt abandonne le geste en cours et rend la main à la caméra', () => {
    const m = bookMesh(makeBook({ id: 'a' }));
    bookMeshes = [m];
    under.add(m);
    fire('pointerdown', ev({ pointerType: 'touch', pointerId: 1 }));
    controls.enabled = false;
    canvas.style.cursor = 'grabbing';
    fire('pointerdown', ev({ pointerType: 'touch', pointerId: 2 }));
    expect(input.heldBook).toBeNull();
    expect(controls.enabled).toBe(true);
    expect(canvas.style.cursor).toBe('');
    // lever un doigt puis en reposer un seul : redevient un clic normal
    fire('pointerup', ev({ pointerType: 'touch', pointerId: 2 }));
    fire('pointerup', ev({ pointerType: 'touch', pointerId: 1 }));
    fire('pointerdown', ev({ pointerType: 'touch', pointerId: 3 }));
    expect(input.heldBook?.id).toBe('a');
  });

  it('ignore les boutons autres que le gauche', () => {
    const m = bookMesh(makeBook({ id: 'a' }));
    bookMeshes = [m];
    under.add(m);
    fire('pointerdown', ev({ button: 2 }));
    expect(input.heldBook).toBeNull();
  });
});

describe('geste sur un livre : relâchement', () => {
  const start = (id = 'a', pointerType = 'mouse'): Book => {
    const b = makeBook({ id, crate: 'c1' });
    const m = bookMesh(b);
    bookMeshes = [m];
    under.add(m);
    fire('pointerdown', ev({ pointerType }));
    return b;
  };

  it('en lecture, un clic simple sort le livre', () => {
    start();
    fire('pointerup');
    expect(h.openBook).toHaveBeenCalledWith('a');
    expect(controls.enabled).toBe(true);
    expect(canvas.releasePointerCapture).toHaveBeenCalled();
    expect(input.heldBook).toBeNull();
  });

  it('un glisser ne sort rien et n’ouvre rien', () => {
    start();
    fire('pointermove', ev({ clientX: 420, clientY: 300 }));
    fire('pointerup', ev({ clientX: 420, clientY: 300 }));
    expect(h.openBook).not.toHaveBeenCalled();
    expect(h.closeBook).not.toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it('un clic sur le livre déjà sorti le range', () => {
    start();
    open = 'a';
    fire('pointerup');
    expect(h.closeBook).toHaveBeenCalledTimes(1);
    expect(h.openBook).not.toHaveBeenCalled();
  });

  it('en Édition, un clic sélectionne la caisse qui le contient', () => {
    mode = 'edit';
    crates = [makeCrate({ id: 'c1' })];
    start();
    fire('pointerup');
    expect(selected).toBe('c1');
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.openBook).not.toHaveBeenCalled();
  });

  it('en Édition, un livre hors caisse ne change pas la sélection', () => {
    mode = 'edit';
    selected = 'autre';
    start();
    fire('pointerup');
    expect(selected).toBe('autre');
    expect(h.refresh).toHaveBeenCalledTimes(1);
    // livre rangé dans une caisse qui n'existe plus : idem
    books[0]!.crate = 'disparue';
    fire('pointerdown');
    fire('pointerup');
    expect(selected).toBe('autre');
  });

  it('tolère une capture de pointeur déjà relâchée', () => {
    start();
    canvas.releasePointerCapture.mockImplementation(() => {
      throw new Error('déjà relâchée');
    });
    expect(() => fire('pointerup')).not.toThrow();
    expect(h.openBook).toHaveBeenCalled();
  });
});

describe('geste sur un livre : glisser', () => {
  const start = (pointerType = 'mouse'): void => {
    const m = bookMesh(makeBook({ id: 'a' }));
    bookMeshes = [m];
    under.add(m);
    fire('pointerdown', ev({ pointerType }));
  };

  it('signale une fois « pas touche » après 5 px, à la souris', () => {
    const denied = vi.fn();
    input.setEditDeniedHandler(denied);
    start();
    fire('pointermove', ev({ clientX: 403, clientY: 300 }));
    expect(denied).not.toHaveBeenCalled();
    fire('pointermove', ev({ clientX: 405, clientY: 300 }));
    fire('pointermove', ev({ clientX: 450, clientY: 300 }));
    expect(denied).toHaveBeenCalledTimes(1);
  });

  it('au doigt, un glisser est un déplacement de la vue : rien n’est signalé', () => {
    const denied = vi.fn();
    input.setEditDeniedHandler(denied);
    start('touch');
    fire('pointermove', ev({ clientX: 450, pointerType: 'touch' }));
    expect(denied).not.toHaveBeenCalled();
  });

  it('sans gestionnaire, un glisser ne plante pas', () => {
    start();
    expect(() => fire('pointermove', ev({ clientX: 450 }))).not.toThrow();
    input.setEditDeniedHandler(null);
    expect(() => fire('pointermove', ev({ clientX: 460 }))).not.toThrow();
  });
});

describe('glisser une caisse (Édition)', () => {
  let hit: THREE.Mesh;
  let c1: Crate;
  let c2: Crate;

  beforeEach(() => {
    mode = 'edit';
    c1 = makeCrate({ id: 'c1', x: 0, z: 0 });
    c2 = makeCrate({ id: 'c2', x: 20, z: 0 });
    crates = [c1, c2];
    hit = mesh('c1');
    hitboxes.push(hit);
    under.add(hit);
  });

  it('un clic simple (sans bouger) sélectionne la caisse puis zoome dessus', () => {
    fire('pointerdown', ev({ pointerId: 4 }));
    expect(controls.enabled).toBe(false);
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(4);
    selected = null;
    fire('pointerup', ev({ pointerId: 4 }));
    expect(selected).toBe('c1');
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.focusCrate).toHaveBeenCalledWith('c1');
    expect(controls.enabled).toBe(true);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(4);
  });

  it('un second clic désélectionne la caisse sans zoomer', () => {
    selected = 'c1';
    fire('pointerdown');
    fire('pointerup');
    expect(selected).toBeNull();
    expect(h.focusCrate).not.toHaveBeenCalled();
  });

  it('sans zoom au clic (téléphone), la caisse est sélectionnée sans cadrage', () => {
    input.setCrateClickZoom(false);
    fire('pointerdown');
    fire('pointerup');
    expect(selected).toBe('c1');
    expect(h.focusCrate).not.toHaveBeenCalled();
  });

  it('un mouvement de moins de 5 px ne déplace rien', () => {
    fire('pointerdown');
    fire('pointermove', ev({ clientX: 402, clientY: 301 }));
    expect(h.pushHistory).not.toHaveBeenCalled();
    expect(h.relayout).not.toHaveBeenCalled();
  });

  it('dépasser 5 px commence le glisser : historique, caisse au sommet de la pile, curseur', () => {
    fire('pointerdown');
    fire('pointermove', ev({ clientX: 420, clientY: 300 }));
    expect(h.pushHistory).toHaveBeenCalledTimes(1);
    expect(crates.map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(selected).toBe('c1');
    expect(canvas.style.cursor).toBe('grabbing');
    expect(h.relayout).toHaveBeenCalledTimes(1);
    // l'historique n'est pris qu'une fois pour tout le glisser
    fire('pointermove', ev({ clientX: 440, clientY: 300 }));
    expect(h.pushHistory).toHaveBeenCalledTimes(1);
    expect(h.relayout).toHaveBeenCalledTimes(2);
  });

  it('suit le pointeur sur le sol, avec aimantation, en gardant le décalage de la prise', () => {
    fire('pointerdown');
    // pointeur vers la droite : la caisse (centre sous le curseur au départ) se déplace en +X
    fire('pointermove', ev({ clientX: 500, clientY: 300 }));
    expect(c1.x).toBeGreaterThan(1);
    expect(c1.z).toBeCloseTo(0, 1);
    const x1 = c1.x;
    fire('pointermove', ev({ clientX: 600, clientY: 300 }));
    expect(c1.x).toBeGreaterThan(x1);
    // les coordonnées sont arrondies au millième par l'aimantation
    expect(Math.round(c1.x * 1000)).toBeCloseTo(c1.x * 1000, 6);
  });

  it('relâcher après un glisser garde la sélection et ne zoome pas', () => {
    fire('pointerdown');
    fire('pointermove', ev({ clientX: 500 }));
    h.refresh!.mockClear();
    fire('pointerup', ev({ clientX: 500 }));
    expect(selected).toBe('c1');
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.focusCrate).not.toHaveBeenCalled();
    expect(controls.enabled).toBe(true);
    expect(canvas.style.cursor).toBe('');
  });

  it('ne bouge pas quand le rayon ne coupe pas le sol', () => {
    fire('pointerdown');
    fire('pointermove', ev({ clientX: 430 }));
    h.relayout!.mockClear();
    const x = c1.x;
    // caméra tournée vers le ciel : le rayon ne touche plus le plan du sol
    camera.lookAt(0, 30, 0);
    camera.updateMatrixWorld(true);
    fire('pointermove', ev({ clientX: 600, clientY: 100 }));
    expect(c1.x).toBe(x);
    expect(h.relayout).not.toHaveBeenCalled();
  });

  it('une caisse inconnue du moteur ne démarre aucun glisser', () => {
    hitboxes[0]!.userData.id = 'fantome';
    fire('pointerdown');
    expect(controls.enabled).toBe(true);
    fire('pointermove', ev({ clientX: 500 }));
    expect(h.relayout).not.toHaveBeenCalled();
  });

  it('tolère une capture déjà relâchée après un clic sur une caisse', () => {
    fire('pointerdown');
    canvas.releasePointerCapture.mockImplementation(() => {
      throw new Error('déjà relâchée');
    });
    expect(() => fire('pointerup')).not.toThrow();
    expect(controls.enabled).toBe(true);
  });

  /** Point du sol sous la colonne de pixels px (milieu de l’écran en hauteur), pour la caméra courante. */
  const ground = (px: number): THREE.Vector3 => {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((px / 800) * 2 - 1, 0), camera);
    return ray.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      new THREE.Vector3(),
    )!;
  };

  it('prise décentrée : conserve l’écart entre le curseur et le centre de la caisse', () => {
    c1.x = 3;
    fire('pointerdown');
    // le curseur est sur l'origine, la caisse à x = 3 : l'écart de 3 est reporté sur le déplacement
    fire('pointermove', ev({ clientX: 500 }));
    // aimantation à la grille de 0,5 au plus
    expect(Math.abs(c1.x - (ground(500).x + 3))).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it('si le rayon ne touche pas le sol à la prise, la caisse se cale directement sous le curseur', () => {
    c1.x = 3;
    camera.lookAt(0, 30, 0);
    camera.updateMatrixWorld(true);
    fire('pointerdown');
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    fire('pointermove', ev({ clientX: 500 }));
    expect(Math.abs(c1.x - ground(500).x)).toBeLessThanOrEqual(0.25 + 1e-9);
  });
});

describe('clic dans le vide ou en lecture', () => {
  it('un clic dans le vide ferme le livre, désélectionne et rafraîchit', () => {
    open = 'o';
    selected = 'c1';
    decor.selected = true;
    fire('pointerdown');
    fire('pointerup');
    expect(h.closeBook).toHaveBeenCalledWith(false);
    expect(selected).toBeNull();
    expect(decor.selected).toBe(false);
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.focusCrate).not.toHaveBeenCalled();
  });

  it('sans livre ouvert, ne ferme rien', () => {
    fire('pointerdown');
    fire('pointerup');
    expect(h.closeBook).not.toHaveBeenCalled();
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it('un clic sur une caisse en lecture zoome dessus', () => {
    const hit = mesh('c1');
    hitboxes.push(hit);
    under.add(hit);
    fire('pointerdown');
    fire('pointerup');
    expect(h.focusCrate).toHaveBeenCalledWith('c1');
    expect(h.pushHistory).not.toHaveBeenCalled();
  });

  it('sans zoom au clic (téléphone), la caisse n’est pas cadrée', () => {
    input.setCrateClickZoom(false);
    const hit = mesh('c1');
    hitboxes.push(hit);
    under.add(hit);
    fire('pointerdown');
    fire('pointerup');
    expect(h.focusCrate).not.toHaveBeenCalled();
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it('un geste qui a bougé de 5 px n’est plus un clic (déplacement de la vue)', () => {
    fire('pointerdown');
    fire('pointerup', ev({ clientX: 420 }));
    expect(h.refresh).not.toHaveBeenCalled();
    expect(h.closeBook).not.toHaveBeenCalled();
  });

  it('un relâchement sans appui préalable ne fait rien', () => {
    fire('pointerup');
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it('un clic en Édition sans caisse sous le pointeur est un clic dans le vide', () => {
    mode = 'edit';
    fire('pointerdown');
    fire('pointerup');
    expect(selected).toBeNull();
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('clavier', () => {
  it('Échap termine le défilé des manquants avant tout', () => {
    missing.browsing = true;
    open = 'o';
    key('Escape');
    expect(h.endMissingBrowse).toHaveBeenCalledTimes(1);
    expect(h.closeBook).not.toHaveBeenCalled();
  });

  it('Échap range le livre sorti, même pendant une saisie', () => {
    open = 'o';
    activeTag = 'INPUT';
    key('Escape');
    expect(h.closeBook).toHaveBeenCalledTimes(1);
  });

  it('ignore le reste du clavier pendant une saisie dans un champ', () => {
    activeTag = 'TEXTAREA';
    open = 'o';
    neighbors = ['p', 'n'];
    selected = 'c1';
    mode = 'edit';
    missing.browsing = true;
    key('ArrowLeft');
    key('z', { ctrlKey: true });
    key('Delete');
    expect(h.stepMissing).not.toHaveBeenCalled();
    expect(h.openBook).not.toHaveBeenCalled();
    expect(h.undo).not.toHaveBeenCalled();
    expect(h.removeCrate).not.toHaveBeenCalled();
  });

  it('les flèches parcourent les manquants', () => {
    missing.browsing = true;
    key('ArrowLeft');
    key('ArrowRight');
    expect(h.stepMissing).toHaveBeenNthCalledWith(1, -1);
    expect(h.stepMissing).toHaveBeenNthCalledWith(2, 1);
  });

  it('les flèches ouvrent le livre précédent ou suivant', () => {
    open = 'o';
    neighbors = ['p', 'n'];
    key('ArrowLeft');
    key('ArrowRight');
    expect(h.openBook).toHaveBeenNthCalledWith(1, 'p');
    expect(h.openBook).toHaveBeenNthCalledWith(2, 'n');
  });

  it('sans voisin de ce côté, rien ne s’ouvre', () => {
    open = 'o';
    neighbors = [null, 'n'];
    key('ArrowLeft');
    expect(h.openBook).not.toHaveBeenCalled();
  });

  it('Ctrl+Z (ou Cmd+Z) annule et bloque l’action du navigateur', () => {
    const e1 = key('z', { ctrlKey: true });
    const e2 = key('Z', { metaKey: true });
    expect(h.undo).toHaveBeenCalledTimes(2);
    expect(e1.preventDefault).toHaveBeenCalled();
    expect(e2.preventDefault).toHaveBeenCalled();
  });

  it('un z seul n’annule rien', () => {
    key('z');
    expect(h.undo).not.toHaveBeenCalled();
  });

  it('Suppr supprime la caisse sélectionnée en Édition seulement', () => {
    selected = 'c1';
    mode = 'edit';
    key('Delete');
    expect(h.removeCrate).toHaveBeenCalledWith('c1');
    h.removeCrate!.mockClear();
    mode = 'view';
    key('Delete');
    mode = 'edit';
    open = 'o';
    key('Delete');
    open = null;
    selected = null;
    key('Delete');
    expect(h.removeCrate).not.toHaveBeenCalled();
  });

  it('une autre touche ne fait rien', () => {
    key('a');
    expect(h.undo).not.toHaveBeenCalled();
    expect(h.removeCrate).not.toHaveBeenCalled();
  });
});

describe('survol', () => {
  const moveOver = (): void => fire('pointermove', ev());

  it('déplace l’infobulle avec le pointeur', () => {
    input.attachTooltip(tooltip as unknown as HTMLElement);
    fire('pointermove', ev({ clientX: 120, clientY: 80 }));
    expect(tooltip.style).toMatchObject({ left: '120px', top: '80px' });
  });

  it('un livre survolé se soulève : titre en infobulle et curseur main', () => {
    input.attachTooltip(tooltip as unknown as HTMLElement);
    const m = bookMesh(makeBook({ id: 'a', title: 'Mon livre' }));
    bookMeshes = [m];
    under.add(m);
    moveOver();
    input.updateHover();
    expect(input.hovered).toBe(rigs.get('a'));
    expect(tooltip.textContent).toBe('Mon livre');
    expect(tooltip.style.opacity).toBe('1');
    expect(canvas.style.cursor).toBe('pointer');
    // même livre : rien ne change
    tooltip.textContent = 'modifié';
    input.updateHover();
    expect(tooltip.textContent).toBe('modifié');
  });

  it('cache l’infobulle quand on quitte le livre, curseur « déplacer » sur une caisse', () => {
    input.attachTooltip(tooltip as unknown as HTMLElement);
    const m = bookMesh(makeBook({ id: 'a' }));
    bookMeshes = [m];
    under.add(m);
    input.updateHover();
    under.delete(m);
    const crateHit = mesh('c1');
    hitboxes.push(crateHit);
    under.add(crateHit);
    input.updateHover();
    expect(input.hovered).toBeNull();
    expect(tooltip.style.opacity).toBe('0');
    expect(canvas.style.cursor).toBe('move');
    under.delete(crateHit);
    input.updateHover();
    expect(canvas.style.cursor).toBe('');
  });

  it('pas d’infobulle pour le livre sorti', () => {
    input.attachTooltip(tooltip as unknown as HTMLElement);
    const m = bookMesh(makeBook({ id: 'o' }));
    bookMeshes = [m];
    under.add(m);
    open = 'o';
    input.updateHover();
    expect(tooltip.style.opacity).toBe('0');
  });

  it('un livre sans fiche ne change pas le texte de l’infobulle', () => {
    input.attachTooltip(tooltip as unknown as HTMLElement);
    const m = bookMesh(makeBook({ id: 'a' }));
    books.length = 0;
    bookMeshes = [m];
    under.add(m);
    input.updateHover();
    expect(tooltip.textContent).toBe('');
  });

  it('fonctionne sans infobulle attachée, et après l’avoir détachée', () => {
    const m = bookMesh(makeBook({ id: 'a' }));
    bookMeshes = [m];
    under.add(m);
    expect(() => input.updateHover()).not.toThrow();
    input.attachTooltip(tooltip as unknown as HTMLElement);
    input.attachTooltip(null);
    input.updateHover();
    fire('pointermove', ev());
    expect(tooltip.style).toEqual({});
  });

  it('un livre dont le rig a disparu n’est pas survolé', () => {
    const m = bookMesh(makeBook({ id: 'a' }));
    rigs.delete('a');
    bookMeshes = [m];
    under.add(m);
    input.updateHover();
    expect(input.hovered).toBeNull();
  });

  it('quitter le canevas sort le pointeur de l’écran', () => {
    const m = bookMesh(makeBook({ id: 'a' }));
    bookMeshes = [m];
    under.add(m);
    input.updateHover();
    expect(input.hovered).not.toBeNull();
    under.delete(m);
    fire('pointerleave', ev());
    input.updateHover();
    expect(input.hovered).toBeNull();
  });

  it('met en avant la flèche de déplacement survolée', () => {
    rotGizmo.group.visible = true;
    under.add(moveHit);
    input.updateHover();
    expect(moveGizmo.highlight).toHaveBeenCalledWith('x');
    expect(rotGizmo.highlight).toHaveBeenCalledWith(null);
    expect(canvas.style.cursor).toBe('grab');
    expect(input.hovered).toBeNull();
  });

  it('met en avant la flèche de rotation survolée', () => {
    input.attachTooltip(tooltip as unknown as HTMLElement);
    rotGizmo.group.visible = true;
    under.add(rotHit);
    input.updateHover();
    expect(moveGizmo.highlight).toHaveBeenCalledWith(null);
    expect(rotGizmo.highlight).toHaveBeenCalledWith('y');
    expect(canvas.style.cursor).toBe('grab');
    expect(tooltip.style.opacity).toBe('0');
  });

  it('éteint les surbrillances quand aucune flèche n’est survolée', () => {
    rotGizmo.group.visible = true;
    input.updateHover();
    expect(moveGizmo.highlight).toHaveBeenCalledWith(null);
    expect(rotGizmo.highlight).toHaveBeenCalledWith(null);
    expect(canvas.style.cursor).toBe('');
  });

  it('ne touche pas aux flèches quand elles sont cachées', () => {
    input.updateHover();
    expect(moveGizmo.highlight).not.toHaveBeenCalled();
  });

  it('ne survole rien pendant un glisser', () => {
    const hit = mesh('c1');
    hitboxes.push(hit);
    under.add(hit);
    mode = 'edit';
    crates = [makeCrate({ id: 'c1' })];
    fire('pointerdown');
    canvas.style.cursor = 'grabbing';
    input.updateHover();
    expect(canvas.style.cursor).toBe('grabbing');
  });

  it('ne survole rien pendant le geste sur un livre', () => {
    const m = bookMesh(makeBook({ id: 'a' }));
    bookMeshes = [m];
    under.add(m);
    fire('pointerdown');
    input.updateHover();
    expect(input.hovered).toBeNull();
  });
});
