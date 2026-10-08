import * as THREE from 'three';
import type * as ThreeModule from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SCENE_BG } from '@/constants';

import { Stage } from './stage';

type Spied = ReturnType<typeof vi.fn>;

/** Doubles WebGL : le rendu réel n'est pas testable sous Node, mais l'ordre des appels l'est. */
const gl = vi.hoisted(() => ({
  renderers: [] as unknown[],
  controls: [] as unknown[],
  pmrem: [] as unknown[],
  stopTexture: undefined as unknown as { (): void },
  textureListener: undefined as unknown as { (): void },
}));

vi.mock('three', async (orig) => {
  const actual = await orig<typeof ThreeModule>();
  class FakeRenderer {
    shadowMap = { enabled: false, autoUpdate: true, type: 0, needsUpdate: false };
    toneMapping = 0;
    toneMappingExposure = 0;
    autoClear = true;
    pixelRatio = 0;
    capabilities = { getMaxAnisotropy: () => 8 };
    size: number[] | null = null;
    log: string[] = [];
    seen: unknown[] = [];
    compile = Promise.resolve();
    finish = vi.fn();
    constructor(public options: Record<string, unknown>) {
      gl.renderers.push(this);
    }
    setPixelRatio(r: number): void {
      this.pixelRatio = r;
    }
    setSize(w: number, h: number, update: boolean): void {
      this.size = [w, h, update as unknown as number];
    }
    clear(): void {
      this.log.push('clear');
    }
    clearDepth(): void {
      this.log.push('clearDepth');
    }
    render(scene: THREE.Scene, camera: THREE.Camera): void {
      this.log.push('render');
      this.seen.push({
        background: scene.background,
        fog: scene.fog,
        layers: camera.layers.mask,
        shadowUpdate: this.shadowMap.needsUpdate,
      });
    }
    compileAsync(): Promise<void> {
      this.log.push('compile');
      return this.compile;
    }
    getContext(): { finish: Spied } {
      return { finish: this.finish };
    }
    dispose = vi.fn();
  }
  class FakePMREM {
    dispose = vi.fn();
    texture = { name: 'environnement' };
    constructor(public renderer: unknown) {
      gl.pmrem.push(this);
    }
    fromScene(): { texture: unknown } {
      return { texture: this.texture };
    }
  }
  return { ...actual, WebGLRenderer: FakeRenderer, PMREMGenerator: FakePMREM };
});

vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    listeners = new Map<string, () => void>();
    dispose = vi.fn();
    update = vi.fn();
    target = { x: 0 };
    constructor(
      public camera: unknown,
      public dom: unknown,
    ) {
      gl.controls.push(this);
    }
    addEventListener(type: string, fn: () => void): void {
      this.listeners.set(type, fn);
    }
  },
}));

vi.mock('three/addons/environments/RoomEnvironment.js', () => ({ RoomEnvironment: class {} }));

vi.mock('./books', () => ({
  onTextureReady: vi.fn((fn: () => void) => {
    gl.textureListener = fn;
    return gl.stopTexture;
  }),
}));

type FakeR = {
  options: Record<string, unknown>;
  shadowMap: { enabled: boolean; autoUpdate: boolean; type: number; needsUpdate: boolean };
  toneMapping: number;
  toneMappingExposure: number;
  autoClear: boolean;
  pixelRatio: number;
  size: number[] | null;
  log: string[];
  seen: { background: unknown; fog: unknown; layers: number; shadowUpdate: boolean }[];
  compile: Promise<void>;
  finish: Spied;
  dispose: Spied;
};
type FakeC = {
  camera: unknown;
  dom: unknown;
  listeners: Map<string, () => void>;
  dispose: Spied;
  enableDamping: boolean;
  dampingFactor: number;
  maxPolarAngle: number;
  minDistance: number;
  maxDistance: number;
  zoomToCursor: boolean;
  mouseButtons: Record<string, unknown>;
  touches: Record<string, unknown>;
};

const renderer = (): FakeR => gl.renderers.at(-1) as FakeR;
const controls = (): FakeC => gl.controls.at(-1) as FakeC;

let canvasHandlers: Map<string, { fn: () => void; opts: unknown }>;
let canvasRemoved: string[];
let windowHandlers: Map<string, () => void>;
let windowRemoved: string[];
let observer: { observe: Spied; disconnect: Spied; callback: () => void };
let parent: { clientWidth: number; clientHeight: number } | null;
let canvas: HTMLCanvasElement;

const makeStage = (transparent = false): Stage => new Stage(canvas, transparent);

beforeEach(() => {
  gl.renderers.length = 0;
  gl.controls.length = 0;
  gl.pmrem.length = 0;
  gl.stopTexture = vi.fn();
  canvasHandlers = new Map();
  canvasRemoved = [];
  windowHandlers = new Map();
  windowRemoved = [];
  parent = { clientWidth: 800, clientHeight: 400 };
  canvas = {
    get parentElement() {
      return parent;
    },
    clientWidth: 100,
    clientHeight: 50,
    addEventListener: (type: string, fn: () => void, opts: unknown) =>
      canvasHandlers.set(type, { fn, opts }),
    removeEventListener: (type: string) => canvasRemoved.push(type),
  } as unknown as HTMLCanvasElement;
  vi.stubGlobal('window', {
    devicePixelRatio: 3,
    addEventListener: (type: string, fn: () => void) => windowHandlers.set(type, fn),
    removeEventListener: (type: string) => windowRemoved.push(type),
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(public callback: () => void) {
        observer = this as unknown as typeof observer;
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Stage : construction', () => {
  it('crée le rendu WebGL avec ombres à la demande et tonalité cinéma', () => {
    const stage = makeStage();
    const r = renderer();
    expect(r.options).toEqual({ canvas, antialias: true, alpha: false });
    // résolution plafonnée à 2 même sur un écran 3×
    expect(r.pixelRatio).toBe(2);
    expect(r.shadowMap.enabled).toBe(true);
    expect(r.shadowMap.autoUpdate).toBe(false);
    expect(r.shadowMap.type).toBe(THREE.PCFShadowMap);
    expect(r.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(r.toneMappingExposure).toBe(1);
    expect(r.autoClear).toBe(false);
    expect(stage.aniso).toBe(8);
    expect(stage.renderer).toBe(r);
  });

  it('une scène transparente se rend avec un canal alpha, sans fond, avec un sol qui ne montre que les ombres', () => {
    const stage = makeStage(true);
    expect(renderer().options.alpha).toBe(true);
    expect(stage.scene.background).toBeNull();
    const ground = stage.scene.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    expect(ground.material).toBeInstanceOf(THREE.ShadowMaterial);
    expect(ground.receiveShadow).toBe(true);
    expect(ground.rotation.x).toBeCloseTo(-Math.PI / 2);
  });

  it('une scène opaque a un fond coloré, un sol vert et l’environnement de la pièce', () => {
    const stage = makeStage(false);
    expect((stage.scene.background as THREE.Color).getHex()).toBe(SCENE_BG);
    const ground = stage.scene.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    expect(ground.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((ground.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xa9c29a);
    expect(stage.scene.environment).toBe((gl.pmrem[0] as { texture: unknown }).texture);
    expect((gl.pmrem[0] as { dispose: Spied }).dispose).toHaveBeenCalled();
  });

  it('règle les contrôles orbitaux : souris et doigts', () => {
    const stage = makeStage();
    const c = controls();
    expect(stage.controls).toBe(c);
    expect(c.camera).toBe(stage.camera);
    expect(c.dom).toBe(canvas);
    expect(c.enableDamping).toBe(true);
    expect(c.dampingFactor).toBe(0.08);
    expect(c.maxPolarAngle).toBeCloseTo(Math.PI - 0.05);
    expect([c.minDistance, c.maxDistance]).toEqual([1, 60]);
    expect(c.zoomToCursor).toBe(true);
    // le clic gauche est réservé aux caisses et aux livres
    expect(c.mouseButtons).toEqual({
      LEFT: null,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN,
    });
    expect(c.touches).toEqual({ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN });
  });

  it('allume le soleil et l’hémisphère pour les deux passes (couches 0 et 1)', () => {
    const stage = makeStage();
    const hemi = stage.scene.children.find((c) => c instanceof THREE.HemisphereLight)!;
    expect(hemi.layers.isEnabled(1)).toBe(true);
    expect(stage.sun).toBeInstanceOf(THREE.DirectionalLight);
    expect(stage.scene.children).toContain(stage.sun);
    expect(stage.sun.layers.isEnabled(1)).toBe(true);
    // le mode léger s'affiche d'abord : pas d'ombre tant que le moteur ne l'active pas
    expect(stage.sun.castShadow).toBe(false);
    expect(stage.sun.position.toArray()).toEqual([10, 16, 8]);
    expect(stage.sun.shadow.mapSize.toArray()).toEqual([2048, 2048]);
    expect(stage.sun.shadow.camera.far).toBe(50);
  });

  it('observe la taille du parent du canevas, ou le canevas lui-même', () => {
    makeStage();
    expect(observer.observe).toHaveBeenCalledWith(parent);
    parent = null;
    makeStage();
    expect(observer.observe).toHaveBeenCalledWith(canvas);
  });

  it('se redimensionne quand l’observateur le signale', () => {
    const stage = makeStage();
    parent = { clientWidth: 300, clientHeight: 300 };
    observer.callback();
    expect(stage.camera.aspect).toBe(1);
  });
});

describe('Stage : taille', () => {
  it('adapte rendu et caméra à la taille du parent', () => {
    const stage = makeStage();
    stage.resize();
    expect(renderer().size).toEqual([800, 400, false]);
    expect(stage.camera.aspect).toBe(2);
    expect(stage.isPortrait()).toBe(false);
  });

  it('au minimum 1 px dans chaque sens, jamais de division par zéro', () => {
    const stage = makeStage();
    parent = { clientWidth: 0, clientHeight: 0 };
    stage.resize();
    expect(renderer().size).toEqual([1, 1, false]);
    expect(stage.camera.aspect).toBe(1);
  });

  it('sans parent, prend la taille du canevas', () => {
    const stage = makeStage();
    parent = null;
    stage.resize();
    expect(renderer().size).toEqual([100, 50, false]);
  });

  it('est en portrait quand l’écran est plus haut que large', () => {
    const stage = makeStage();
    parent = { clientWidth: 400, clientHeight: 800 };
    stage.resize();
    expect(stage.isPortrait()).toBe(true);
  });

  it('demande une nouvelle image', () => {
    const stage = makeStage();
    stage.draw(false);
    renderer().log.length = 0;
    stage.resize();
    stage.draw(false);
    expect(renderer().log).toEqual(['clear', 'render']);
  });
});

describe('Stage : rendu à la demande', () => {
  it('dessine la première image puis plus rien tant que rien ne change', () => {
    const stage = makeStage();
    stage.draw(false);
    expect(renderer().log).toEqual(['clear', 'render']);
    expect(renderer().seen[0]).toMatchObject({ layers: 1, shadowUpdate: true });
    stage.draw(false);
    stage.draw(true);
    expect(renderer().log).toEqual(['clear', 'render']);
  });

  it('touch redessine, ombres comprises', () => {
    const stage = makeStage();
    stage.draw(false);
    stage.touch();
    stage.draw(false);
    expect(renderer().log).toHaveLength(4);
    expect(renderer().seen[1]!.shadowUpdate).toBe(true);
  });

  it('touchFrame redessine sans recalculer les ombres', () => {
    const stage = makeStage();
    stage.draw(false);
    stage.touchFrame();
    stage.draw(false);
    expect(renderer().seen[1]!.shadowUpdate).toBe(false);
    // l'invalidation des ombres reste en attente si touch passe avant le dessin
    stage.touchFrame();
    stage.touch();
    stage.draw(false);
    expect(renderer().seen[2]!.shadowUpdate).toBe(true);
  });

  it('invalidate est un touch utilisable comme écouteur', () => {
    const stage = makeStage();
    stage.draw(false);
    stage.invalidate();
    stage.draw(false);
    expect(renderer().log.filter((l) => l === 'render')).toHaveLength(2);
  });

  it('seconde passe : le livre sorti par-dessus, sans fond ni brouillard, puis tout est restauré', () => {
    const stage = makeStage();
    const fog = new THREE.Fog(0xffffff, 1, 10);
    stage.scene.fog = fog;
    const background = stage.scene.background;
    stage.draw(true);
    expect(renderer().log).toEqual(['clear', 'render', 'clearDepth', 'render']);
    const [first, second] = renderer().seen;
    expect(first).toMatchObject({ background, fog, layers: 1 });
    // couche 1 seulement, fond et brouillard retirés pendant la passe
    expect(second).toMatchObject({ background: null, fog: null, layers: 2 });
    expect(stage.scene.background).toBe(background);
    expect(stage.scene.fog).toBe(fog);
    expect(stage.camera.layers.mask).toBe(1);
  });

  it('une scène sans fond ni brouillard se restaure aussi', () => {
    const stage = makeStage(true);
    stage.draw(true);
    expect(stage.scene.background).toBeNull();
    expect(stage.scene.fog).toBeNull();
  });
});

describe('Stage : événements qui invalident l’image', () => {
  it('écoute les entrées du canevas (passives) et le clavier', () => {
    makeStage();
    expect([...canvasHandlers.keys()].sort()).toEqual([
      'pointerdown',
      'pointermove',
      'pointerup',
      'wheel',
    ]);
    for (const { opts } of canvasHandlers.values()) expect(opts).toEqual({ passive: true });
    expect(windowHandlers.has('keydown')).toBe(true);
  });

  it('chacun redemande une image', () => {
    const stage = makeStage();
    const wasDrawn = (): boolean => {
      renderer().log.length = 0;
      stage.draw(false);
      return renderer().log.includes('render');
    };
    stage.draw(false);
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) {
      expect(wasDrawn()).toBe(false);
      canvasHandlers.get(type)!.fn();
      expect(wasDrawn()).toBe(true);
    }
    windowHandlers.get('keydown')!();
    expect(wasDrawn()).toBe(true);
  });

  it('un mouvement de la caméra ou l’arrivée d’une couverture redemande une image', () => {
    const stage = makeStage();
    stage.draw(false);
    controls().listeners.get('change')!();
    renderer().log.length = 0;
    stage.draw(false);
    expect(renderer().log).toContain('render');
    renderer().log.length = 0;
    stage.draw(false);
    gl.textureListener();
    stage.draw(false);
    expect(renderer().log).toContain('render');
  });
});

describe('Stage.warmUp', () => {
  it('compile les shaders, dessine une image puis prévient', async () => {
    const stage = makeStage();
    const done = vi.fn();
    stage.warmUp(() => false, done);
    await vi.waitFor(() => expect(done).toHaveBeenCalled());
    expect(renderer().log).toEqual(['compile', 'render']);
    expect(renderer().shadowMap.needsUpdate).toBe(true);
    expect(renderer().finish).toHaveBeenCalledTimes(1);
  });

  it('continue même si la compilation échoue', async () => {
    const stage = makeStage();
    renderer().compile = Promise.reject(new Error('shader'));
    const done = vi.fn();
    stage.warmUp(() => false, done);
    await vi.waitFor(() => expect(done).toHaveBeenCalled());
    expect(renderer().log).toEqual(['compile', 'render']);
  });

  it('ne dessine rien et ne prévient pas si le moteur est détruit entre-temps', async () => {
    const stage = makeStage();
    const done = vi.fn();
    stage.warmUp(() => true, done);
    await new Promise((r) => setTimeout(r, 0));
    expect(renderer().log).toEqual(['compile']);
    expect(done).not.toHaveBeenCalled();
  });
});

describe('Stage.dispose', () => {
  it('retire les écouteurs et libère le rendu et les contrôles', () => {
    const stage = makeStage();
    stage.dispose();
    expect(gl.stopTexture).toHaveBeenCalledTimes(1);
    expect(canvasRemoved.sort()).toEqual(['pointerdown', 'pointermove', 'pointerup', 'wheel']);
    expect(windowRemoved).toEqual(['keydown']);
    expect(observer.disconnect).toHaveBeenCalled();
    expect(controls().dispose).toHaveBeenCalled();
    expect(renderer().dispose).toHaveBeenCalled();
  });
});
