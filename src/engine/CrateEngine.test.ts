import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EDIT_TOKEN_KEY } from '@/constants';
import { installEngineHarness, screenOf, type Harness } from '@/test/engineHarness';
import { makeBook, makeCrate } from '@/test/fixtures';
import type { Book, Crate, Snapshot } from '@/types';

import { CrateEngine } from './CrateEngine';

type FakeStageShape = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: { target: THREE.Vector3; update: ReturnType<typeof vi.fn>; enabled: boolean };
  sun: { castShadow: boolean };
  portrait: boolean;
  touch: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  draw: ReturnType<typeof vi.fn>;
  warmUp: ReturnType<typeof vi.fn>;
};

const world = vi.hoisted(() => ({
  stages: [] as unknown[],
  bird: { load: vi.fn() },
}));

// Pas de WebGL sous Node : un faux Stage garde la scène three.js (réelle) mais rend sans GPU.
vi.mock('./stage', async () => {
  const THREE = await import('three');
  class FakeStage {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 800 / 600, 0.1, 200);
    controls = { target: new THREE.Vector3(), update: vi.fn(), enabled: true };
    aniso = 4;
    sun = { castShadow: false };
    portrait = false;
    touch = vi.fn();
    touchFrame = vi.fn();
    resize = vi.fn();
    dispose = vi.fn();
    // comme le vrai Stage : rien n'est montré si le moteur est détruit entre-temps
    warmUp = vi.fn((isDisposed: () => boolean, done: () => void) => {
      if (!isDisposed()) done();
    });
    draw = vi.fn(() => this.scene.updateMatrixWorld(true));
    constructor(
      public canvas: unknown,
      public transparent: boolean,
    ) {
      world.stages.push(this);
    }
    isPortrait(): boolean {
      return this.portrait;
    }
  }
  return { Stage: FakeStage };
});

vi.mock('./mesange', () => ({ loadMesange: world.bird.load }));
// La police des numéros n'est jamais chargée ici : les plaques restent en attente.
vi.mock('three/addons/loaders/FontLoader.js', () => ({
  FontLoader: class {
    load(): void {}
  },
}));

let h: Harness;
let engine: CrateEngine;

const stage = (): FakeStageShape => world.stages.at(-1) as FakeStageShape;

const book = (id: string, over: Partial<Book> = {}): Book =>
  makeBook({ id, title: id, color: '#336699', ...over });

/** Une grande caisse « m1 » (3 livres de la série Alpha, T3 manque) + cinq petites (P1…P5) + un livre libre. */
const library = (): { crates: Crate[]; books: Book[] } => ({
  crates: [
    makeCrate({ id: 'm1', x: 0 }),
    ...[1, 2, 3, 4, 5].map((i) => makeCrate({ id: `s${i}`, size: 'S', x: 5 + i * 3 })),
  ],
  books: [
    book('Alpha T1', { crate: 'm1' }),
    book('Alpha T2', { crate: 'm1' }),
    book('Alpha T4', { crate: 'm1' }),
    book('libre', { crate: null }),
  ],
});

const snap = (): Snapshot => engine.getSnapshot();
const tick = async (ms = 100): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

/** Tourne la caméra vers sa cible, comme le ferait OrbitControls. */
const aim = (): void => {
  const s = stage();
  s.camera.lookAt(s.controls.target);
  s.camera.updateMatrixWorld(true);
};

const meshOf = (id: string): THREE.Object3D =>
  stage().scene.getObjectByProperty('uuid', '') ??
  (() => {
    let found: THREE.Object3D | undefined;
    stage().scene.traverse((o) => {
      if (o.userData.id === id && (o as THREE.Mesh).isMesh && !found) found = o;
    });
    if (!found) throw new Error(`maillage introuvable : ${id}`);
    return found;
  })();

const at = (o: THREE.Object3D): { clientX: number; clientY: number } =>
  screenOf(o.getWorldPosition(new THREE.Vector3()), stage().camera);

const pointer = (extra: object = {}) => ({
  button: 0,
  pointerType: 'mouse',
  pointerId: 1,
  clientX: 400,
  clientY: 300,
  ...extra,
});

/** Moteur créé, base lue, première image montrée. */
const boot = async (state = library(), transparent = false): Promise<void> => {
  h.server.state = { ok: true, rev: 4, ...state };
  engine = new CrateEngine(h.canvas, transparent);
  await tick();
  aim();
};

beforeEach(() => {
  vi.useFakeTimers();
  world.stages.length = 0;
  world.bird.load.mockReset().mockResolvedValue(null);
  h = installEngineHarness();
});

afterEach(() => {
  engine?.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('démarrage', () => {
  it('affiche d’abord l’indicateur de chargement avec une scène vide', () => {
    h.server.state = { ok: true, rev: 1, ...library() };
    engine = new CrateEngine(h.canvas);
    expect(snap().loading).toBe(true);
    expect(snap().crates).toEqual([]);
    expect(snap().mode).toBe('view');
    expect(stage().resize).toHaveBeenCalled();
  });

  it('lit la base, range les livres et retire l’indicateur après le premier rendu', async () => {
    await boot();
    const s = snap();
    expect(s.loading).toBe(false);
    expect(s.loadError).toBe(false);
    expect(s.crates).toHaveLength(6);
    expect(s.books).toHaveLength(4);
    expect(s.counts).toMatchObject({ m1: 3, s1: 0 });
    expect(s).toMatchObject({ stored: 3, loose: 1, full: 0, canUndo: false, mode: 'view' });
    expect(stage().warmUp).toHaveBeenCalledTimes(1);
    // la base lue n'est pas renvoyée
    await tick(2000);
    expect(h.syncBodies()).toHaveLength(0);
  });

  it('signale une base illisible sans rien envoyer', async () => {
    h.server.state = { ok: false };
    engine = new CrateEngine(h.canvas);
    await tick();
    expect(snap().loadError).toBe(true);
    expect(snap().loading).toBe(false);
    engine.addCrate('M');
    await tick(2000);
    expect(h.syncBodies()).toHaveLength(0);
  });

  it('passe en mode complet après le premier rendu (caisses visibles, ombres)', async () => {
    await boot();
    await tick(1000);
    expect(stage().sun.castShadow).toBe(true);
    const cratesVisible = stage().scene.children.filter(
      (c) => c instanceof THREE.Group && c.children.length > 20,
    );
    expect(cratesVisible.length).toBeGreaterThan(0);
    expect(cratesVisible.every((g) => g.visible)).toBe(true);
  });

  it('une scène transparente n’a pas d’ombre portée par le soleil', async () => {
    await boot(library(), true);
    await tick(1000);
    expect(stage().sun.castShadow).toBe(false);
  });

  it('subscribe prévient à chaque changement jusqu’au désabonnement', async () => {
    await boot();
    const listener = vi.fn();
    const off = engine.subscribe(listener);
    engine.selectCrate('m1');
    expect(listener).toHaveBeenCalled();
    const n = listener.mock.calls.length;
    off();
    engine.selectCrate(null);
    expect(listener.mock.calls.length).toBe(n);
  });
});

describe('caisses', () => {
  beforeEach(async () => {
    await boot();
  });

  it('ajoute une caisse à droite du groupe, la sélectionne, et envoie la base après le délai', async () => {
    engine.addCrate('L');
    expect(snap().crates).toHaveLength(7);
    expect(snap().selectedId).toBe(snap().crates[6]!.id);
    expect(snap().canUndo).toBe(true);
    expect(h.syncBodies()).toHaveLength(0);
    await tick(900);
    const body = h.syncBodies()[0]!;
    expect(body.rev).toBe(4);
    expect((body.crates as Crate[]).length).toBe(7);
    expect(body.token).toBeNull();
  });

  it('envoie le jeton d’Édition avec l’état', async () => {
    h.localStorage.setItem(EDIT_TOKEN_KEY, 'jeton');
    engine.selectCrate('s1');
    engine.setCrateFlat('s1', true);
    await tick(900);
    expect(h.syncBodies()[0]!.token).toBe('jeton');
  });

  it('retire une caisse : ses livres retournent dans la pile « à côté »', () => {
    engine.removeCrate('m1');
    expect(snap().crates.some((c) => c.id === 'm1')).toBe(false);
    expect(snap().books.every((b) => b.crate === null)).toBe(true);
    expect(snap().loose).toBe(4);
    expect(snap().counts.m1).toBeUndefined();
  });

  it('retire la caisse sélectionnée et oublie la sélection', () => {
    engine.selectCrate('s2');
    engine.removeCrate('s2');
    expect(snap().selectedId).toBeNull();
  });

  it('change la taille, le rangement à plat, le dépassement et les cotes', () => {
    engine.setCrateSize('s1', 'X');
    expect(snap().crates.find((c) => c.id === 's1')).toMatchObject({
      size: 'X',
      dims: { w: 3, h: 3, d: 3 },
    });
    engine.setCrateDims('s1', { w: 5, h: 4, d: 3 });
    expect(snap().crates.find((c) => c.id === 's1')!.dims).toEqual({ w: 5, h: 4, d: 3 });
    engine.setCrateFlat('m1', true);
    engine.setCrateOverhang('m1', true);
    expect(snap().crates.find((c) => c.id === 'm1')).toMatchObject({ flat: true, overhang: true });
  });

  it('tourne une caisse d’un quart de tour', () => {
    engine.rotateCrate('s1', 'y', 1);
    const q = snap().crates.find((c) => c.id === 's1')!.q;
    expect(q[1]).toBeCloseTo(Math.SQRT1_2);
  });

  it('déplace une caisse d’un cran', () => {
    const before = snap().crates.find((c) => c.id === 's1')!.x;
    engine.stepCrate('s1', 'x', 1);
    expect(snap().crates.find((c) => c.id === 's1')!.x).toBeGreaterThan(before);
  });

  it('annule la dernière action', () => {
    engine.removeCrate('s1');
    expect(snap().crates).toHaveLength(5);
    engine.undo();
    expect(snap().crates).toHaveLength(6);
    expect(snap().canUndo).toBe(false);
    engine.undo();
    expect(snap().crates).toHaveLength(6);
  });

  it('annuler retire aussi la sélection d’une caisse disparue', () => {
    engine.addCrate('M');
    expect(snap().selectedId).not.toBeNull();
    engine.undo();
    expect(snap().selectedId).toBeNull();
    expect(snap().crates).toHaveLength(6);
  });

  it('survol dans la fiche : met une caisse en surbrillance', () => {
    const outlineOf = (id: string): boolean => {
      let on = false;
      stage().scene.traverse((o) => {
        if ((o as THREE.LineSegments).isLineSegments && o.renderOrder === 995) {
          const hit = o.parent?.children.find((c) => c.userData.id === id);
          if (hit) on = o.visible;
        }
      });
      return on;
    };
    engine.hintCrate('s3');
    expect(outlineOf('s3')).toBe(true);
    engine.hintCrate(null);
    expect(outlineOf('s3')).toBe(false);
  });

  it('cadre la caméra sur une caisse, ignore une caisse inconnue', () => {
    const before = stage().camera.position.clone();
    engine.focusCrate('zzz');
    expect(stage().camera.position.equals(before)).toBe(true);
    engine.focusCrate('s5');
    expect(stage().camera.position.equals(before)).toBe(false);
    expect(stage().controls.target.x).toBeCloseTo(20, 0);
    engine.recenter();
    expect(stage().controls.target.x).toBeLessThan(20);
  });
});

describe('modes', () => {
  beforeEach(async () => {
    await boot();
  });

  it('passe en Édition puis en lecture, qui oublie la sélection', () => {
    engine.setMode('edit');
    expect(snap().mode).toBe('edit');
    engine.selectCrate('s1');
    engine.setMode('edit');
    expect(snap().selectedId).toBe('s1');
    engine.setMode('view');
    expect(snap().mode).toBe('view');
    expect(snap().selectedId).toBeNull();
  });

  it('le mode léger se choisit et se garde', async () => {
    engine.setLite(true);
    expect(snap().lite).toBe(true);
    expect(h.localStorage.getItem('lite-mode')).toBe('1');
    engine.setLite(false);
    expect(snap().lite).toBe(false);
  });
});

describe('livres', () => {
  beforeEach(async () => {
    await boot();
  });

  it('ouvre un livre, le retourne, passe au voisin puis le range', () => {
    engine.openBook('Alpha T2');
    expect(snap()).toMatchObject({
      openId: 'Alpha T2',
      openSide: 'front',
      hasPrev: true,
      hasNext: true,
    });
    engine.flipBook();
    expect(snap().openSide).toBe('back');
    engine.stepBook(1);
    expect(snap().openId).toBe('Alpha T4');
    expect(snap().hasNext).toBe(false);
    engine.stepBook(-1);
    expect(snap().openId).toBe('Alpha T2');
    engine.closeBook();
    expect(snap().openId).toBeNull();
    expect(snap().hasPrev).toBe(false);
  });

  it('parcourt les résultats d’une recherche', () => {
    engine.showBooks(['libre', 'Alpha T4']);
    expect(snap()).toMatchObject({
      openId: 'libre',
      browsing: true,
      hasPrev: false,
      hasNext: true,
    });
    engine.stepBook(1);
    expect(snap().openId).toBe('Alpha T4');
    engine.closeBook();
    expect(snap().browsing).toBe(false);
  });

  it('modifie une fiche : une seule entrée d’historique pour une saisie suivie, base mise à jour', async () => {
    engine.updateBook('Alpha T1', { title: 'N' });
    engine.updateBook('Alpha T1', { title: 'Nouveau' });
    expect(snap().books.find((b) => b.id === 'Alpha T1')!.title).toBe('Nouveau');
    await tick(900);
    const sent = h.syncBodies()[0]!.books as Book[];
    expect(sent.find((b) => b.id === 'Alpha T1')!.title).toBe('Nouveau');
    // les deux saisies ne font qu'une entrée d'historique
    engine.undo();
    expect(snap().books.find((b) => b.id === 'Alpha T1')!.title).toBe('Alpha T1');
    expect(snap().canUndo).toBe(false);
  });

  it('change les dimensions d’un livre : valeur gardée dans l’état, valeur hors bornes ignorée', async () => {
    engine.updateBook('Alpha T1', { h: 2.9, t: 0.4 });
    const b = snap().books.find((k) => k.id === 'Alpha T1')!;
    expect(b).toMatchObject({ h: 2.9, t: 0.4 });
    engine.updateBook('Alpha T1', { h: 99 });
    expect(snap().books.find((k) => k.id === 'Alpha T1')!.h).toBe(2.9);
    await tick(900);
    const sent = h.syncBodies()[0]!.books as Book[];
    expect(sent.find((k) => k.id === 'Alpha T1')).toMatchObject({ h: 2.9, t: 0.4 });
  });

  it('exporte les caisses et les livres en STL binaire', () => {
    const stl = engine.exportStl();
    const triangles = new DataView(stl).getUint32(80, true);
    expect(triangles).toBeGreaterThan(0);
    expect(stl.byteLength).toBe(84 + triangles * 50);
  });

  it('supprime un livre, y compris celui qui est sorti', () => {
    engine.openBook('libre');
    engine.removeBook('libre');
    expect(snap().books.map((b) => b.id)).not.toContain('libre');
    expect(snap().openId).toBeNull();
    engine.removeBook('Alpha T1');
    expect(snap().books).toHaveLength(2);
    expect(snap().counts.m1).toBe(2);
  });

  it('défile les tomes manquants en 3D', () => {
    expect(snap().missingBrowse).toBeNull();
    engine.openBook('Alpha T1');
    engine.browseMissing();
    expect(snap().missingBrowse).toEqual({ label: 'Alpha T3', index: 1, total: 1 });
    expect(snap().openId).toBeNull();
    engine.stepMissing(1);
    expect(snap().missingBrowse?.label).toBe('Alpha T3');
    engine.endMissingBrowse();
    expect(snap().missingBrowse).toBeNull();
    // sans défilé en cours, ces appels ne font rien
    engine.stepMissing(1);
    engine.endMissingBrowse();
    expect(snap().missingBrowse).toBeNull();
  });

  it('ne lance pas de défilé quand rien ne manque', async () => {
    engine.removeBook('Alpha T4');
    engine.browseMissing();
    expect(snap().missingBrowse).toBeNull();
  });
});

describe('rechargement et destruction', () => {
  it('recharge l’état de la base modifiée ailleurs', async () => {
    await boot();
    h.server.state = { ok: true, rev: 9, crates: [makeCrate({ id: 'seule' })], books: [] };
    engine.reload();
    await tick();
    expect(snap().crates.map((c) => c.id)).toEqual(['seule']);
    expect(snap().books).toEqual([]);
  });

  it('reprend les réglages de la mésange gardés en base et les renvoie avec le reste', async () => {
    await boot();
    h.server.state = {
      ok: true,
      rev: 5,
      ...library(),
      decor: { mesange: { dx: 0.1, dy: 0.2, dz: 0.3 } },
    };
    engine.reload();
    await tick();
    // un rechargement n'est pas renvoyé à la base
    await tick(2000);
    expect(h.syncBodies()).toHaveLength(0);
    engine.setCrateFlat('m1', true);
    await tick(900);
    expect((h.syncBodies()[0]!.decor as { mesange: unknown }).mesange).toEqual({
      dx: 0.1,
      dy: 0.2,
      dz: 0.3,
    });
  });

  it('dispose arrête la boucle, retire les écouteurs et libère la scène', async () => {
    await boot();
    expect(h.canvasHandlers.size).toBeGreaterThan(0);
    engine.dispose();
    expect(h.canvasHandlers.size).toBe(0);
    expect(stage().dispose).toHaveBeenCalledTimes(1);
    const draws = stage().draw.mock.calls.length;
    await tick(500);
    expect(stage().draw.mock.calls.length).toBe(draws);
  });

  it('un moteur détruit pendant la lecture de la base ne charge rien', async () => {
    h.server.state = { ok: true, rev: 1, ...library() };
    engine = new CrateEngine(h.canvas);
    engine.dispose();
    await tick();
    expect(snap().crates).toEqual([]);
  });
});

describe('souris', () => {
  it('un clic sur un livre en lecture le sort, un clic dans le vide le range', async () => {
    await boot();
    await tick(1000);
    const target = meshOf('Alpha T2');
    const p = pointer(at(target));
    h.canvasHandlers.get('pointerdown')!(p);
    h.canvasHandlers.get('pointerup')!(p);
    expect(snap().openId).toBe('Alpha T2');
    h.canvasHandlers.get('pointerdown')!(pointer({ clientX: 5, clientY: 5 }));
    h.canvasHandlers.get('pointerup')!(pointer({ clientX: 5, clientY: 5 }));
    expect(snap().openId).toBeNull();
  });

  it('glisser un livre en lecture avertit que l’Édition est verrouillée', async () => {
    await boot();
    await tick(1000);
    const denied = vi.fn();
    engine.setEditDeniedHandler(denied);
    const target = meshOf('Alpha T2');
    const start = at(target);
    h.canvasHandlers.get('pointerdown')!(pointer(start));
    h.canvasHandlers.get('pointermove')!(pointer({ ...start, clientX: start.clientX + 30 }));
    h.canvasHandlers.get('pointerup')!(pointer({ ...start, clientX: start.clientX + 30 }));
    expect(denied).toHaveBeenCalledTimes(1);
    expect(snap().openId).toBeNull();
  });

  it('un clic sur une caisse en lecture zoome dessus, sauf si le zoom au clic est coupé', async () => {
    await boot();
    await tick(1000);
    const crateHit = meshOf('s5');
    const p = pointer(at(crateHit));
    const before = stage().controls.target.clone();
    h.canvasHandlers.get('pointerdown')!(p);
    h.canvasHandlers.get('pointerup')!(p);
    expect(stage().controls.target.equals(before)).toBe(false);
    engine.recenter();
    const centered = stage().controls.target.clone();
    aim();
    engine.setCrateClickZoom(false);
    h.canvasHandlers.get('pointerdown')!(p);
    h.canvasHandlers.get('pointerup')!(p);
    expect(stage().controls.target.equals(centered)).toBe(true);
  });

  it('en Édition, glisser une caisse la déplace et sélectionne', async () => {
    await boot();
    await tick(1000);
    engine.setMode('edit');
    const crateHit = meshOf('s5');
    const start = at(crateHit);
    const x0 = snap().crates.find((c) => c.id === 's5')!.x;
    h.canvasHandlers.get('pointerdown')!(pointer(start));
    h.canvasHandlers.get('pointermove')!(pointer({ ...start, clientX: start.clientX + 80 }));
    h.canvasHandlers.get('pointerup')!(pointer({ ...start, clientX: start.clientX + 80 }));
    const moved = snap().crates.find((c) => c.id === 's5')!;
    expect(moved.x).toBeGreaterThan(x0);
    expect(snap().selectedId).toBe('s5');
    expect(snap().canUndo).toBe(true);
    engine.undo();
    expect(snap().crates.find((c) => c.id === 's5')!.x).toBe(x0);
  });

  it('survole : l’infobulle suit le pointeur', async () => {
    await boot();
    await tick(1000);
    const tooltip = { style: {} as Record<string, string>, textContent: '' };
    engine.attachTooltip(tooltip as unknown as HTMLElement);
    const p = pointer(at(meshOf('Alpha T2')));
    h.canvasHandlers.get('pointermove')!(p);
    await tick(50);
    expect(tooltip.style.left).toBe(`${p.clientX}px`);
    expect(tooltip.textContent).toBe('Alpha T2');
  });

  it('une flèche de la caisse sélectionnée la déplace en Édition', async () => {
    await boot();
    await tick(1000);
    engine.setMode('edit');
    engine.selectCrate('s5');
    await tick(50);
    let arrow: THREE.Object3D | undefined;
    stage().scene.traverse((o) => {
      // la première flèche trouvée est celle des caisses (celle de la mésange est ajoutée après)
      if (!arrow && o.userData.kind === 'move' && o.userData.axis === 'x' && o.userData.sign === 1)
        arrow = o;
    });
    const x0 = snap().crates.find((c) => c.id === 's5')!.x;
    const p = pointer(at(arrow!));
    h.canvasHandlers.get('pointerdown')!(p);
    expect(snap().crates.find((c) => c.id === 's5')!.x).toBeGreaterThan(x0);
  });

  it('Suppr supprime la caisse sélectionnée en Édition, Ctrl+Z annule', async () => {
    await boot();
    engine.setMode('edit');
    engine.selectCrate('s1');
    h.windowHandlers.get('keydown')!({ key: 'Delete', preventDefault: vi.fn() });
    expect(snap().crates.some((c) => c.id === 's1')).toBe(false);
    h.windowHandlers.get('keydown')!({ key: 'z', ctrlKey: true, preventDefault: vi.fn() });
    expect(snap().crates.some((c) => c.id === 's1')).toBe(true);
  });

  it('Échap range le livre sorti', async () => {
    await boot();
    engine.openBook('Alpha T1');
    h.windowHandlers.get('keydown')!({ key: 'Escape', preventDefault: vi.fn() });
    expect(snap().openId).toBeNull();
  });

  it('un clic sur le papier des manquants lance le défilé', async () => {
    await boot();
    await tick(1000);
    const note = stage()
      .scene.children.flatMap((c) => c.children)
      .find(
        (o) =>
          o instanceof THREE.Group &&
          o.children.length === 2 &&
          o.children[0] instanceof THREE.Mesh &&
          (o.children[0] as THREE.Mesh).geometry instanceof THREE.PlaneGeometry,
      )!;
    const p = pointer(at(note.children[0]!));
    h.canvasHandlers.get('pointerdown')!(p);
    expect(snap().missingBrowse?.label).toBe('Alpha T3');
  });
});

describe('mésange', () => {
  const fakeBird = () => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.8)));
    return { group, update: vi.fn() };
  };

  it('se perche sur la caisse P5 et se règle avec les flèches en Édition', async () => {
    const bird = fakeBird();
    world.bird.load.mockResolvedValue(bird);
    await boot();
    await tick(1000);
    expect(stage().scene.children).toContain(bird.group);
    expect(bird.group.visible).toBe(true);
    expect(bird.update).toHaveBeenCalled();
    const perch = snap().crates.find((c) => c.id === 's5')!;
    expect(bird.group.position.x).toBeCloseTo(perch.x + 1 - 0.2);

    engine.setMode('edit');
    await tick(50);
    // un clic sur la mésange la sélectionne et fait apparaître ses flèches
    const onBird = pointer(at(bird.group.children[0]!));
    h.canvasHandlers.get('pointerdown')!(onBird);
    await tick(50);
    let arrow: THREE.Object3D | undefined;
    stage().scene.traverse((o) => {
      if (
        o.userData.kind === 'move' &&
        o.userData.axis === 'x' &&
        o.userData.sign === 1 &&
        o.parent?.parent?.visible
      )
        arrow = o;
    });
    expect(arrow).toBeDefined();
    const x0 = bird.group.position.x;
    h.canvasHandlers.get('pointerdown')!(pointer(at(arrow!)));
    expect(bird.group.position.x).toBeCloseTo(x0 + 0.01);
    // le réglage part à la base avec le reste
    await tick(900);
    const body = h.syncBodies()[0]!;
    expect((body.decor as { mesange: { dx: number } }).mesange.dx).toBeCloseTo(0.01);
  });

  it('colle l’étiquette HTML à la mésange', async () => {
    world.bird.load.mockResolvedValue(fakeBird());
    await boot();
    const el = { style: {} as Record<string, string> };
    engine.attachBirdLabel(el as unknown as HTMLElement);
    await tick(100);
    expect(el.style.transform).toMatch(/^translate\(/);
    engine.attachBirdLabel(null);
  });

  it('un modèle arrivé après la destruction du moteur est libéré', async () => {
    let resolve!: (b: unknown) => void;
    world.bird.load.mockReturnValue(new Promise((r) => (resolve = r)));
    const bird = fakeBird();
    const geo = (bird.group.children[0] as THREE.Mesh).geometry;
    const spy = vi.spyOn(geo, 'dispose');
    await boot();
    engine.dispose();
    resolve(bird);
    await tick();
    expect(spy).toHaveBeenCalled();
    expect(stage().scene.children).not.toContain(bird.group);
  });
});

describe('affichage sur téléphone', () => {
  it('en portrait, passer au livre suivant fait sortir le premier avant de le ranger', async () => {
    await boot();
    stage().portrait = true;
    engine.openBook('Alpha T1');
    engine.stepBook(1);
    expect(snap().openId).toBe('Alpha T2');
    const out = meshOf('Alpha T1');
    // le livre qui part reste au premier plan pendant son animation
    expect(out.layers.isEnabled(1)).toBe(true);
    await tick(1000);
    expect(out.layers.isEnabled(1)).toBe(false);
    expect(out.layers.isEnabled(0)).toBe(true);
    expect(snap().openId).toBe('Alpha T2');
  });
});

describe('conflit de révision', () => {
  it('une base modifiée ailleurs est rechargée au lieu d’être écrasée', async () => {
    await boot();
    h.server.sync = { ok: false, reason: 'conflict' };
    engine.addCrate('M');
    h.server.state = { ok: true, rev: 10, crates: [makeCrate({ id: 'ailleurs' })], books: [] };
    await tick(1000);
    expect(snap().crates.map((c) => c.id)).toEqual(['ailleurs']);
  });
});

describe('base vide', () => {
  it('une base sans caisse démarre avec les caisses par défaut', async () => {
    await boot({ crates: [], books: [] });
    expect(snap().crates).toHaveLength(6);
  });
});

describe('souris : livre sorti, flèches de rotation, manquants', () => {
  it('un clic sur un voisin du livre sorti l’ouvre, un clic sur le livre sorti le retourne', async () => {
    await boot();
    engine.openBook('Alpha T2');
    await tick(3000);
    h.canvasHandlers.get('pointerdown')!(pointer(at(meshOf('Alpha T1'))));
    expect(snap().openId).toBe('Alpha T1');
    await tick(3000);
    expect(snap().openSide).toBe('front');
    h.canvasHandlers.get('pointerdown')!(pointer(at(meshOf('Alpha T1'))));
    expect(snap().openSide).toBe('back');
  });

  it('une flèche de rotation tourne la caisse sélectionnée d’un quart de tour', async () => {
    await boot();
    await tick(1000);
    engine.setMode('edit');
    engine.selectCrate('s5');
    await tick(50);
    const hits: THREE.Mesh<THREE.TorusGeometry>[] = [];
    stage().scene.traverse((o) => {
      const m = o as THREE.Mesh<THREE.TorusGeometry>;
      if (
        m.isMesh &&
        m.geometry.type === 'TorusGeometry' &&
        m.userData.axis &&
        o.parent?.parent?.parent?.visible
      )
        hits.push(m);
    });
    expect(hits.length).toBe(6);
    const q0 = snap()
      .crates.find((c) => c.id === 's5')!
      .q.join();
    for (const hit of hits) {
      const { radius, arc } = hit.geometry.parameters;
      const onArc = hit.localToWorld(
        new THREE.Vector3(radius * Math.cos(arc / 2), radius * Math.sin(arc / 2), 0),
      );
      h.canvasHandlers.get('pointerdown')!(pointer(screenOf(onArc, stage().camera)));
      if (
        snap()
          .crates.find((c) => c.id === 's5')!
          .q.join() !== q0
      )
        break;
    }
    expect(
      snap()
        .crates.find((c) => c.id === 's5')!
        .q.join(),
    ).not.toBe(q0);
  });

  it('un clic sur un livre manquant du tas le montre en gros plan', async () => {
    await boot();
    await tick(1000);
    const ghost = meshOf('ghost-Alpha-3');
    h.canvasHandlers.get('pointerdown')!(pointer(at(ghost)));
    expect(snap().missingBrowse?.label).toBe('Alpha T3');
  });

  it('au clavier, les flèches parcourent les manquants et Échap termine le défilé', async () => {
    await boot();
    engine.browseMissing();
    h.windowHandlers.get('keydown')!({ key: 'ArrowRight', preventDefault: vi.fn() });
    expect(snap().missingBrowse?.label).toBe('Alpha T3');
    h.windowHandlers.get('keydown')!({ key: 'Escape', preventDefault: vi.fn() });
    expect(snap().missingBrowse).toBeNull();
  });

  it('retirer le livre survolé oublie le survol', async () => {
    await boot();
    await tick(1000);
    h.canvasHandlers.get('pointermove')!(pointer(at(meshOf('Alpha T2'))));
    await tick(50);
    const input = (engine as unknown as { input: { hovered: unknown } }).input;
    expect(input.hovered).not.toBeNull();
    engine.removeBook('Alpha T2');
    expect(input.hovered).toBeNull();
  });
});
