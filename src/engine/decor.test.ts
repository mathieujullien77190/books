import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeCrate } from '@/test/fixtures';
import type { Crate, Id, Mode } from '@/types';

import { Decor } from './decor';

const bird = vi.hoisted(() => ({ loadMesange: vi.fn() }));
vi.mock('./mesange', () => bird);

type Ctx = { selectedId: Id | null; mode: Mode; openId: Id | null; lite?: boolean };
const ctx = (over: Partial<Ctx> = {}): Ctx => ({
  selectedId: null,
  mode: 'edit',
  openId: null,
  ...over,
});

/** Cinq petites caisses : la cinquième s'appelle « P5 », le perchoir de la mésange. */
const smallCrates = (): Crate[] =>
  [0, 1, 2, 3, 4].map((i) => makeCrate({ id: `s${i}`, size: 'S', x: i * 3 }));

const fakeBird = () => {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry()));
  return { group, update: vi.fn() };
};

/** Décor chargé avec une mésange factice. */
const loaded = async (scene = new THREE.Scene()) => {
  const b = fakeBird();
  bird.loadMesange.mockResolvedValue(b);
  const d = new Decor();
  const onReady = vi.fn();
  d.loadBird(scene, () => false, onReady);
  await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
  return { d, b, scene };
};

beforeEach(() => {
  bird.loadMesange.mockReset();
});

describe('Decor : état', () => {
  it('démarre sans décalage ni sélection', () => {
    const d = new Decor();
    expect(d.state).toEqual({ mesange: { dx: 0, dy: 0, dz: 0 } });
    expect(d.selected).toBe(false);
    expect(d.group).toBeNull();
    expect(d.gizmo.group.visible).toBe(false);
  });

  it('step déplace la mésange d’un cran par axe, arrondi au millième', () => {
    const d = new Decor();
    d.step('x', 1);
    d.step('y', -1);
    d.step('z', 1);
    d.step('z', 1);
    expect(d.state.mesange).toEqual({ dx: 0.01, dy: -0.01, dz: 0.02 });
    for (let i = 0; i < 3; i++) d.step('x', 1);
    expect(d.state.mesange.dx).toBe(0.04);
  });
});

describe('Decor.loadBird', () => {
  it('ajoute la mésange à la scène et prévient quand elle est prête', async () => {
    const { d, b, scene } = await loaded();
    expect(scene.children).toContain(b.group);
    expect(d.group).toBe(b.group);
  });

  it('ne fait rien si le modèle est introuvable', async () => {
    bird.loadMesange.mockResolvedValue(null);
    const d = new Decor();
    const scene = new THREE.Scene();
    const onReady = vi.fn();
    d.loadBird(scene, () => false, onReady);
    await new Promise((r) => setTimeout(r, 0));
    expect(scene.children).toHaveLength(0);
    expect(onReady).not.toHaveBeenCalled();
    expect(d.group).toBeNull();
  });

  it('libère le modèle sans l’ajouter si le moteur est détruit entre-temps', async () => {
    const b = fakeBird();
    const geo = (b.group.children[0] as THREE.Mesh).geometry;
    const spy = vi.spyOn(geo, 'dispose');
    bird.loadMesange.mockResolvedValue(b);
    const d = new Decor();
    const scene = new THREE.Scene();
    const onReady = vi.fn();
    d.loadBird(scene, () => true, onReady);
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    expect(scene.children).toHaveLength(0);
    expect(onReady).not.toHaveBeenCalled();
    expect(d.group).toBeNull();
  });
});

describe('Decor.place', () => {
  it('ne fait rien tant que la mésange n’est pas chargée', () => {
    const d = new Decor();
    expect(() => d.place(smallCrates(), ctx())).not.toThrow();
  });

  it('perche la mésange au coin avant droit du dessus de la caisse P5', async () => {
    const { d, b } = await loaded();
    const crates = smallCrates();
    crates[4]!.y = 2;
    d.place(crates, ctx());
    // S : 2 × 3 × 2 ; coin avant droit = (x + 1 - 0,2, y + 3 - 0,24, z + 1 - 0,2)
    expect(b.group.visible).toBe(true);
    expect(b.group.position.x).toBeCloseTo(12 + 1 - 0.2);
    expect(b.group.position.y).toBeCloseTo(2 + 3 - 0.24);
    expect(b.group.position.z).toBeCloseTo(1 - 0.2);
  });

  it('ajoute le décalage réglé en Édition', async () => {
    const { d, b } = await loaded();
    d.state.mesange = { dx: 0.5, dy: -0.25, dz: 0.125 };
    d.place(smallCrates(), ctx());
    expect(b.group.position.x).toBeCloseTo(12 + 0.8 + 0.5);
    expect(b.group.position.y).toBeCloseTo(2.76 - 0.25);
    expect(b.group.position.z).toBeCloseTo(0.8 + 0.125);
  });

  it('suit la caisse quand elle est déplacée', async () => {
    const { d, b } = await loaded();
    const crates = smallCrates();
    crates[4]!.x = 40;
    d.place(crates, ctx());
    expect(b.group.position.x).toBeCloseTo(40.8);
  });

  it('se cache sans perchoir ou en mode léger', async () => {
    const { d, b } = await loaded();
    d.place(smallCrates().slice(0, 4), ctx());
    expect(b.group.visible).toBe(false);
    expect(d.gizmo.group.visible).toBe(false);
    d.place(smallCrates(), ctx({ lite: true }));
    expect(b.group.visible).toBe(false);
    d.place(smallCrates(), ctx());
    expect(b.group.visible).toBe(true);
  });

  describe('flèches de déplacement', () => {
    it('apparaissent autour de la mésange sélectionnée en Édition', async () => {
      const { d, b } = await loaded();
      const fit = vi.spyOn(d.gizmo, 'fit');
      const vertical = vi.spyOn(d.gizmo, 'setVertical');
      d.selected = true;
      d.place(smallCrates(), ctx());
      expect(d.gizmo.group.visible).toBe(true);
      expect(d.gizmo.group.position.x).toBeCloseTo(b.group.position.x);
      expect(d.gizmo.group.position.y).toBeCloseTo(b.group.position.y + 0.6);
      expect(fit).toHaveBeenCalledWith(0.8, 1.2, 0.8);
      expect(vertical).toHaveBeenCalledWith(true, true);
    });

    it('restent cachées en lecture, pendant la lecture d’un livre ou sans sélection', async () => {
      const { d } = await loaded();
      d.selected = true;
      d.place(smallCrates(), ctx({ mode: 'view' }));
      expect(d.gizmo.group.visible).toBe(false);
      d.place(smallCrates(), ctx({ openId: 'livre' }));
      expect(d.gizmo.group.visible).toBe(false);
      d.selected = false;
      d.place(smallCrates(), ctx());
      expect(d.gizmo.group.visible).toBe(false);
    });

    it('la sélection d’une caisse désélectionne la mésange', async () => {
      const { d } = await loaded();
      d.selected = true;
      d.place(smallCrates(), ctx({ selectedId: 's0' }));
      expect(d.selected).toBe(false);
      expect(d.gizmo.group.visible).toBe(false);
    });
  });
});

describe('Decor : rayons', () => {
  const raycaster = (hits: unknown[]) =>
    ({
      intersectObjects: vi.fn(() => hits),
      intersectObject: vi.fn(() => hits),
    }) as unknown as THREE.Raycaster & {
      intersectObjects: ReturnType<typeof vi.fn>;
      intersectObject: ReturnType<typeof vi.fn>;
    };

  it('hitArrow renvoie l’axe et le sens de la flèche touchée', () => {
    const d = new Decor();
    const rc = raycaster([{ object: { userData: { axis: 'y', sign: -1, kind: 'move' } } }]);
    expect(d.hitArrow(rc)).toEqual({ axis: 'y', sign: -1, kind: 'move' });
    // le rayon ne vise que les flèches visibles, sans descendre dans les enfants
    expect(rc.intersectObjects).toHaveBeenCalledWith(d.gizmo.activeHits(), false);
  });

  it('hitArrow renvoie null si rien n’est touché', () => {
    expect(new Decor().hitArrow(raycaster([]))).toBeNull();
  });

  it('hitsBird est faux sans mésange', () => {
    expect(new Decor().hitsBird(raycaster([{}]))).toBe(false);
  });

  it('hitsBird exige une mésange visible touchée par le rayon', async () => {
    const { d, b } = await loaded();
    const rc = raycaster([{}]);
    b.group.visible = true;
    expect(d.hitsBird(rc)).toBe(true);
    expect(rc.intersectObject).toHaveBeenCalledWith(b.group, true);
    expect(d.hitsBird(raycaster([]))).toBe(false);
    b.group.visible = false;
    const hidden = raycaster([{}]);
    expect(d.hitsBird(hidden)).toBe(false);
    expect(hidden.intersectObject).not.toHaveBeenCalled();
  });
});

describe('Decor.update / disposeBird', () => {
  it('anime la mésange visible seulement', async () => {
    const { d, b } = await loaded();
    d.update(0.016, 2);
    expect(b.update).toHaveBeenCalledWith(0.016, 2);
    b.update.mockClear();
    b.group.visible = false;
    d.update(0.016, 2);
    expect(b.update).not.toHaveBeenCalled();
  });

  it('update ne fait rien sans mésange', () => {
    expect(() => new Decor().update(0.016, 1)).not.toThrow();
  });

  it('disposeBird retire la mésange de la scène et libère ses ressources', async () => {
    const { d, b, scene } = await loaded();
    const spy = vi.spyOn((b.group.children[0] as THREE.Mesh).geometry, 'dispose');
    d.disposeBird(scene);
    expect(scene.children).not.toContain(b.group);
    expect(spy).toHaveBeenCalled();
  });

  it('disposeBird sans mésange ne fait rien', () => {
    const scene = new THREE.Scene();
    expect(() => new Decor().disposeBird(scene)).not.toThrow();
  });
});
