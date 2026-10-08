import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFakeCanvas } from '@/test/fakeCanvas';
import { makeCrate } from '@/test/fixtures';
import type { Id, Mode } from '@/types';

import type { CrateRig } from './crate';
import { CrateRigs, type CrateRigsHost } from './crateRigs';
import { Domain } from './domain';
import { Q_DEBOUT } from './orientation';

const crateMock = vi.hoisted(() => ({
  buildCrate: vi.fn(),
  setCrateLabel: vi.fn(),
  forgetCrateLabel: vi.fn(),
  uprightLabel: vi.fn(),
}));
vi.mock('./crate', () => crateMock);

const fakeRig = (id: string, size: string, d: { w: number; h: number; d: number }): CrateRig =>
  ({
    id,
    size,
    dimsKey: `${d.w}|${d.h}|${d.d}`,
    group: new THREE.Group(),
    hit: new THREE.Mesh(),
    outline: new THREE.LineSegments(),
    label: new THREE.Group(),
  }) as unknown as CrateRig;

let scene: THREE.Scene;
let domain: Domain;
let openId: Id | null;
let lite: boolean;

const setup = (mode: Mode = 'edit'): CrateRigs => {
  domain.mode = mode;
  const host: CrateRigsHost = { domain, openId: () => openId, lite: () => lite };
  return new CrateRigs(scene, host);
};

beforeEach(() => {
  installFakeCanvas();
  crateMock.buildCrate
    .mockReset()
    .mockImplementation((id: string, size: string, d: { w: number; h: number; d: number }) =>
      fakeRig(id, size, d),
    );
  crateMock.setCrateLabel.mockReset();
  crateMock.forgetCrateLabel.mockReset();
  crateMock.uprightLabel.mockReset();
  scene = new THREE.Scene();
  domain = new Domain();
  openId = null;
  lite = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CrateRigs : construction et mode', () => {
  it('ajoute à la scène la grille, le repère et les deux jeux de flèches', () => {
    const rigs = setup();
    expect(scene.children).toHaveLength(4);
    expect(scene.children).toContain(rigs.rotGizmo.group);
    expect(scene.children).toContain(rigs.moveGizmo.group);
  });

  it('montre grille et repère en Édition seulement', () => {
    setup('view');
    const [grid, axes] = scene.children;
    expect([grid!.visible, axes!.visible]).toEqual([false, false]);
    const rigs2 = setup('edit');
    expect(rigs2).toBeDefined();
    const [grid2, axes2] = scene.children.slice(4);
    expect([grid2!.visible, axes2!.visible]).toEqual([true, true]);
  });

  it('setEditing bascule les aides', () => {
    const rigs = setup('view');
    const [grid, axes] = scene.children;
    rigs.setEditing(true);
    expect([grid!.visible, axes!.visible]).toEqual([true, true]);
    rigs.setEditing(false);
    expect([grid!.visible, axes!.visible]).toEqual([false, false]);
  });
});

describe('CrateRigs.place', () => {
  it('construit un rig par caisse, posé au centre de son emprise, avec son numéro', () => {
    const rigs = setup();
    domain.crates = [makeCrate({ id: 'a', x: 3, z: -2 }), makeCrate({ id: 'b', x: 20, size: 'L' })];
    rigs.place();
    expect(crateMock.buildCrate).toHaveBeenCalledWith(
      'a',
      'M',
      expect.objectContaining({ w: 2.5, h: 3.5, d: 2.2 }),
    );
    expect(crateMock.buildCrate).toHaveBeenCalledWith(
      'b',
      'L',
      expect.objectContaining({ w: 3, h: 4, d: 2.5 }),
    );
    const a = rigs.rigs.get('a')!;
    expect(a.group.position.toArray()).toEqual([3, 1.75, -2]);
    expect(rigs.rigs.get('b')!.group.position.y).toBeCloseTo(2);
    expect(scene.children).toContain(a.group);
    expect(rigs.hitboxes).toEqual([a.hit, rigs.rigs.get('b')!.hit]);
    expect(crateMock.setCrateLabel).toHaveBeenCalledWith(a, 'M1');
    expect(crateMock.setCrateLabel).toHaveBeenCalledWith(rigs.rigs.get('b'), 'G1');
    expect(crateMock.uprightLabel).toHaveBeenCalledWith(a, a.group.quaternion);
  });

  it('applique la gravité et l’orientation de la caisse', () => {
    const rigs = setup();
    domain.crates = [makeCrate({ id: 'a' }), makeCrate({ id: 'b', q: Q_DEBOUT })];
    rigs.place();
    // « b » est posée après « a » et la chevauche : elle repose dessus
    expect(domain.crates[1]!.y).toBeCloseTo(3.5);
    expect(rigs.rigs.get('b')!.group.quaternion.toArray()).toEqual(Q_DEBOUT);
  });

  it('cache les caisses en mode léger', () => {
    lite = true;
    const rigs = setup();
    domain.crates = [makeCrate({ id: 'a' })];
    rigs.place();
    expect(rigs.rigs.get('a')!.group.visible).toBe(false);
  });

  it('réutilise le rig tant que taille et cotes ne changent pas', () => {
    const rigs = setup();
    domain.crates = [makeCrate({ id: 'a' })];
    rigs.place();
    const rig = rigs.rigs.get('a');
    rigs.place();
    expect(rigs.rigs.get('a')).toBe(rig);
    expect(crateMock.buildCrate).toHaveBeenCalledTimes(1);
  });

  it('reconstruit le rig quand la taille ou les cotes changent', () => {
    const rigs = setup();
    domain.crates = [makeCrate({ id: 'a' })];
    rigs.place();
    const first = rigs.rigs.get('a')!;
    domain.crates[0]!.size = 'L';
    rigs.place();
    const second = rigs.rigs.get('a')!;
    expect(second).not.toBe(first);
    expect(scene.children).not.toContain(first.group);
    expect(scene.children).toContain(second.group);
    expect(rigs.hitboxes).toEqual([second.hit]);
    domain.crates[0]!.size = 'X';
    domain.crates[0]!.dims = { w: 1, h: 1, d: 1 };
    rigs.place();
    const third = rigs.rigs.get('a')!;
    domain.crates[0]!.dims = { w: 2, h: 1, d: 1 };
    rigs.place();
    expect(rigs.rigs.get('a')).not.toBe(third);
    expect(crateMock.buildCrate).toHaveBeenCalledTimes(4);
  });

  it('surligne le cadre de la caisse sélectionnée ou survolée dans la fiche', () => {
    const rigs = setup();
    domain.crates = [makeCrate({ id: 'a' }), makeCrate({ id: 'b', x: 10 })];
    domain.selectedId = 'a';
    rigs.hintId = 'b';
    rigs.place();
    expect(rigs.rigs.get('a')!.outline.visible).toBe(true);
    expect(rigs.rigs.get('b')!.outline.visible).toBe(true);
    rigs.hintId = null;
    domain.selectedId = null;
    rigs.place();
    expect(rigs.rigs.get('a')!.outline.visible).toBe(false);
  });

  it('étend les axes du repère juste assez pour couvrir les caisses', () => {
    const rigs = setup();
    domain.crates = [makeCrate({ id: 'a' })];
    rigs.place();
    const axes = scene.children[1] as THREE.Group;
    const ends = (i: number): number[] =>
      Array.from((axes.children[i * 2] as THREE.Line).geometry.attributes.position!.array).map(
        (n) => Math.round(n * 1e4) / 1e4 + 0,
      );
    // emprise x ±1,25, z ±1,1, hauteur 3,5 ; marge 0,5
    expect(ends(0)).toEqual([-1.75, 0, 0, 1.75, 0, 0]);
    expect(ends(2)).toEqual([0, 0, -1.6, 0, 0, 1.6]);
    expect(ends(1)).toEqual([0, 0, 0, 0, 4, 0]);
  });

  it('garde au moins une unité de repère sur Y, même sans caisse', () => {
    const rigs = setup();
    domain.crates = [];
    rigs.place();
    const axes = scene.children[1] as THREE.Group;
    const y = Array.from((axes.children[2] as THREE.Line).geometry.attributes.position!.array);
    // emprise par défaut : maxY = 3
    expect(y.slice(3)).toEqual([0, 3.5, 0]);
  });

  describe('flèches de la caisse sélectionnée', () => {
    it('apparaissent en Édition autour de la caisse, ajustées à ses dimensions', () => {
      const rigs = setup();
      const fitRot = vi.spyOn(rigs.rotGizmo, 'fit');
      const fitMove = vi.spyOn(rigs.moveGizmo, 'fit');
      domain.crates = [makeCrate({ id: 'a', x: 5 })];
      domain.selectedId = 'a';
      rigs.place();
      expect(rigs.rotGizmo.group.visible).toBe(true);
      expect(rigs.moveGizmo.group.visible).toBe(true);
      expect(rigs.rotGizmo.group.position.toArray()).toEqual([5, 1.75, 0]);
      expect(rigs.moveGizmo.group.position.toArray()).toEqual([5, 1.75, 0]);
      expect(fitRot).toHaveBeenCalledWith(Math.hypot(2.5, 3.5, 2.2) / 2 + 0.15);
      expect(fitMove).toHaveBeenCalledWith(2.5, 3.5, 2.2);
    });

    it('ne proposent de monter que s’il y a une caisse au-dessus, jamais de descendre', () => {
      const rigs = setup();
      const vertical = vi.spyOn(rigs.moveGizmo, 'setVertical');
      domain.crates = [makeCrate({ id: 'a' }), makeCrate({ id: 'b' })];
      domain.selectedId = 'a';
      rigs.place();
      expect(vertical).toHaveBeenLastCalledWith(true, false);
      domain.selectedId = 'b';
      rigs.place();
      expect(vertical).toHaveBeenLastCalledWith(false, false);
      domain.crates = [makeCrate({ id: 'a' }), makeCrate({ id: 'b', x: 30 })];
      domain.selectedId = 'a';
      rigs.place();
      expect(vertical).toHaveBeenLastCalledWith(false, false);
    });

    it('restent masquées en lecture, pendant la lecture d’un livre ou sans caisse sélectionnée', () => {
      const rigs = setup('view');
      domain.crates = [makeCrate({ id: 'a' })];
      domain.selectedId = 'a';
      rigs.place();
      expect(rigs.rotGizmo.group.visible).toBe(false);
      expect(rigs.moveGizmo.group.visible).toBe(false);
      domain.mode = 'edit';
      openId = 'un-livre';
      rigs.place();
      expect(rigs.rotGizmo.group.visible).toBe(false);
      openId = null;
      domain.selectedId = 'disparue';
      rigs.place();
      expect(rigs.rotGizmo.group.visible).toBe(false);
      domain.selectedId = null;
      rigs.place();
      expect(rigs.moveGizmo.group.visible).toBe(false);
      domain.selectedId = 'a';
      rigs.place();
      expect(rigs.rotGizmo.group.visible).toBe(true);
    });
  });
});

describe('CrateRigs.hint', () => {
  it('ne surligne que la caisse sélectionnée et la caisse indiquée, et ignore une répétition', () => {
    const rigs = setup();
    domain.crates = [
      makeCrate({ id: 'a' }),
      makeCrate({ id: 'b', x: 10 }),
      makeCrate({ id: 'c', x: 20 }),
    ];
    domain.selectedId = 'a';
    rigs.place();
    rigs.hint('b');
    const vis = (): boolean[] => ['a', 'b', 'c'].map((id) => rigs.rigs.get(id)!.outline.visible);
    expect(vis()).toEqual([true, true, false]);
    rigs.rigs.get('c')!.outline.visible = true; // une répétition ne retouche rien
    rigs.hint('b');
    expect(vis()).toEqual([true, true, true]);
    rigs.hint(null);
    expect(vis()).toEqual([true, false, false]);
  });
});

describe('CrateRigs.remove / dispose', () => {
  it('retire un rig : plaque oubliée, ressources libérées, scène et picking nettoyés', () => {
    const rigs = setup();
    domain.crates = [makeCrate({ id: 'a' }), makeCrate({ id: 'b', x: 10 })];
    rigs.place();
    const a = rigs.rigs.get('a')!;
    const geo = new THREE.BoxGeometry();
    const spy = vi.spyOn(geo, 'dispose');
    a.group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
    rigs.remove('a');
    expect(crateMock.forgetCrateLabel).toHaveBeenCalledWith(a);
    expect(spy).toHaveBeenCalled();
    expect(scene.children).not.toContain(a.group);
    expect(rigs.rigs.has('a')).toBe(false);
    expect(rigs.hitboxes).not.toContain(a.hit);
    expect(rigs.hitboxes).toHaveLength(1);
  });

  it('ignore une caisse inconnue, et tolère une zone de clic déjà retirée', () => {
    const rigs = setup();
    rigs.remove('zzz');
    expect(crateMock.forgetCrateLabel).not.toHaveBeenCalled();
    domain.crates = [makeCrate({ id: 'a' })];
    rigs.place();
    rigs.hitboxes.length = 0;
    expect(() => rigs.remove('a')).not.toThrow();
    expect(rigs.rigs.size).toBe(0);
  });

  it('dispose retire toutes les caisses et les flèches de la scène', () => {
    const rigs = setup();
    domain.crates = [makeCrate({ id: 'a' }), makeCrate({ id: 'b', x: 10 })];
    rigs.place();
    rigs.dispose();
    expect(rigs.rigs.size).toBe(0);
    expect(scene.children).not.toContain(rigs.rotGizmo.group);
    expect(scene.children).not.toContain(rigs.moveGizmo.group);
    expect(
      scene.children.some((c) => c === crateMock.buildCrate.mock.results[0]!.value.group),
    ).toBe(false);
  });
});
