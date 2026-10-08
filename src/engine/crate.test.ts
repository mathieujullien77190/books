import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PLANK as T, SIZES } from '@/constants';
import { makeCrate } from '@/test/fixtures';

import type * as CrateModule from './crate';
import { Q_DEBOUT, rotatedQuat } from './orientation';

const font = vi.hoisted(() => ({
  loads: [] as { url: string; onLoad: (f: unknown) => void }[],
  built: [] as { text: string; opts: Record<string, unknown> }[],
}));

vi.mock('three/addons/loaders/FontLoader.js', () => ({
  FontLoader: class {
    load(url: string, onLoad: (f: unknown) => void): void {
      font.loads.push({ url, onLoad });
    }
  },
}));

vi.mock('three/addons/geometries/TextGeometry.js', async () => {
  const THREE = await import('three');
  return {
    // texte factice : un rectangle 2 × 1 décalé, pour vérifier le recentrage
    TextGeometry: class extends THREE.BufferGeometry {
      constructor(text: string, opts: Record<string, unknown>) {
        super();
        font.built.push({ text, opts });
        this.setAttribute(
          'position',
          new THREE.Float32BufferAttribute([4, 6, 0, 6, 7, 0, 5, 6, 1], 3),
        );
      }
    },
  };
});

let crate: typeof CrateModule;

beforeEach(async () => {
  font.loads.length = 0;
  font.built.length = 0;
  // la police et les plaques en attente sont des états de module
  vi.resetModules();
  crate = await import('./crate');
});

const meshesOf = (g: THREE.Object3D): THREE.Mesh[] =>
  g.children.filter((c) => c instanceof THREE.Mesh) as THREE.Mesh[];

describe('buildCrate (bois)', () => {
  const dims = SIZES.M;
  const rig = () => crate.buildCrate('c1', 'M', dims);

  it('décrit la caisse construite', () => {
    const r = rig();
    expect(r.id).toBe('c1');
    expect(r.size).toBe('M');
    expect(r.dimsKey).toBe('2.5|3.5|2.2');
    expect(r.inner).toEqual({ hx: 1.25 - T, hy: 1.75 - T });
    expect(r.shell).toEqual([]);
    expect(r.text).toBeNull();
    expect(r.labelText).toBe('');
  });

  it('assemble fond, tour en planches et armature métal', () => {
    const r = rig();
    const metal = r.group.children.filter(
      (c) =>
        c instanceof THREE.Mesh &&
        !(c instanceof THREE.InstancedMesh) &&
        c.material === crateMetal(r),
    );
    // 2 feuillards × 4 cerclages + 4 pièces de lèvre avant
    expect(metal).toHaveLength(12);
    // fond : 6 planches ; tour : 3 anneaux de 4 planches
    const planks = meshesOf(r.group).filter(
      (m) =>
        m.material instanceof THREE.MeshStandardMaterial &&
        m.castShadow &&
        m !== r.hit &&
        m.material !== crateMetal(r),
    );
    expect(planks).toHaveLength(6 + 12);
    const rivets = r.group.children.find(
      (c) => c instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh;
    expect(rivets.count).toBeGreaterThan(0);
  });

  it('prépare la zone de clic, le cadre de sélection et la plaque du numéro', () => {
    const r = rig();
    expect(r.hit.userData.id).toBe('c1');
    expect((r.hit.material as THREE.MeshBasicMaterial).visible).toBe(false);
    const hit = (r.hit.geometry as THREE.BoxGeometry).parameters;
    expect([hit.width, hit.height, hit.depth]).toEqual([2.6, 3.6, expect.closeTo(2.3, 9)]);
    expect(r.outline.visible).toBe(false);
    expect(r.outline.renderOrder).toBe(995);
    expect(r.group.children).toContain(r.label);
    // plaque collée sur le fond (face intérieure), 2 rivets en plus de la plaque
    expect(r.label.position.z).toBeCloseTo(-1.1 + T + 0.015 + 0.002);
    expect(r.label.children).toHaveLength(3);
  });

  it('chaque planche a son propre matériau', () => {
    const r = rig();
    const mats = new Set(
      meshesOf(r.group)
        .map((m) => m.material)
        .filter((m) => m !== crateMetal(r)),
    );
    expect(mats.size).toBeGreaterThan(10);
  });
});

/** Le matériau partagé de l'armature, retrouvé sur un rivet de la plaque. */
const crateMetal = (r: { label: THREE.Group }): THREE.Material =>
  (r.label.children[1] as THREE.Mesh).material as THREE.Material;

describe('buildCrate (transparente)', () => {
  it('ne construit qu’un volume bleuté et ses arêtes, masquables', () => {
    const r = crate.buildCrate('x1', 'X', { w: 4, h: 2, d: 3 });
    expect(r.dimsKey).toBe('4|2|3');
    expect(r.shell).toHaveLength(2);
    const [box, edges] = r.shell as [THREE.Mesh<THREE.BoxGeometry>, THREE.LineSegments];
    expect(box.geometry.parameters).toMatchObject({ width: 4, height: 2, depth: 3 });
    const mat = box.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBe(0.14);
    expect(mat.depthWrite).toBe(false);
    expect(edges).toBeInstanceOf(THREE.LineSegments);
    // volume, arêtes, zone de clic, cadre, plaque : pas de planches
    expect(r.group.children).toHaveLength(5);
    expect(r.inner).toEqual({ hx: 2 - T, hy: 1 - T });
  });
});

describe('numéro en relief', () => {
  const wood = () => crate.buildCrate('c1', 'M', SIZES.M);

  it('attend la police : une seule demande, plaques complétées à l’arrivée', () => {
    const a = wood();
    const b = crate.buildCrate('c2', 'M', SIZES.M);
    crate.setCrateLabel(a, 'G1');
    crate.setCrateLabel(b, 'M2');
    expect(a.labelText).toBe('G1');
    expect(a.text).toBeNull();
    expect(font.loads).toHaveLength(1);
    expect(font.loads[0]!.url).toBe('/fonts/helvetiker_bold.typeface.json');
    font.loads[0]!.onLoad({ fake: 'police' });
    expect(font.built.map((f) => f.text).sort()).toEqual(['G1', 'M2']);
    expect(a.text).not.toBeNull();
    expect(a.label.children).toContain(a.text);
    expect(b.text).not.toBeNull();
  });

  it('construit le relief avec la police, centré sur la plaque et posé dessus', () => {
    const r = wood();
    crate.setCrateLabel(r, 'P5');
    font.loads[0]!.onLoad({ fake: 'police' });
    const opts = font.built[0]!.opts;
    expect(opts).toMatchObject({
      font: { fake: 'police' },
      size: 0.34 * 0.55,
      depth: 0.025,
      bevelEnabled: false,
    });
    const text = r.text!;
    // boîte de la géométrie factice : x 4..6, y 6..7 → recentrée sur l'origine
    text.geometry.computeBoundingBox();
    const bb = text.geometry.boundingBox!;
    expect((bb.min.x + bb.max.x) / 2).toBeCloseTo(0);
    expect((bb.min.y + bb.max.y) / 2).toBeCloseTo(0);
    expect(text.position.z).toBeCloseTo(0.015);
    expect(text.castShadow).toBe(true);
  });

  it('construit tout de suite quand la police est déjà là', () => {
    const a = wood();
    crate.setCrateLabel(a, 'G1');
    font.loads[0]!.onLoad({});
    const b = crate.buildCrate('c2', 'M', SIZES.M);
    crate.setCrateLabel(b, 'M2');
    expect(b.text).not.toBeNull();
    expect(font.loads).toHaveLength(1);
  });

  it('ne reconstruit rien pour un texte identique', () => {
    const r = wood();
    crate.setCrateLabel(r, 'G1');
    font.loads[0]!.onLoad({});
    const first = r.text;
    crate.setCrateLabel(r, 'G1');
    expect(r.text).toBe(first);
    expect(font.built).toHaveLength(1);
  });

  it('remplace l’ancien relief en le libérant quand le texte change', () => {
    const r = wood();
    crate.setCrateLabel(r, 'G1');
    font.loads[0]!.onLoad({});
    const old = r.text!;
    const geo = vi.spyOn(old.geometry, 'dispose');
    const mat = vi.spyOn(old.material as THREE.Material, 'dispose');
    crate.setCrateLabel(r, 'G2');
    expect(geo).toHaveBeenCalled();
    expect(mat).toHaveBeenCalled();
    expect(r.label.children).not.toContain(old);
    expect(r.text).not.toBe(old);
    expect(r.labelText).toBe('G2');
  });

  it('retire le relief quand le texte devient vide', () => {
    const r = wood();
    crate.setCrateLabel(r, 'G1');
    font.loads[0]!.onLoad({});
    crate.setCrateLabel(r, '');
    expect(r.text).toBeNull();
    expect(r.label.children).toHaveLength(3);
  });

  it('forgetCrateLabel retire une plaque des attentes de police', () => {
    const a = wood();
    const b = crate.buildCrate('c2', 'M', SIZES.M);
    crate.setCrateLabel(a, 'G1');
    crate.setCrateLabel(b, 'M2');
    crate.forgetCrateLabel(a);
    font.loads[0]!.onLoad({});
    expect(a.text).toBeNull();
    expect(b.text).not.toBeNull();
  });
});

describe('uprightLabel', () => {
  const place = (q: THREE.Quaternion) => {
    const r = crate.buildCrate('c1', 'M', SIZES.M);
    crate.uprightLabel(r, q);
    return r.label;
  };
  const quat = (c: ReturnType<typeof makeCrate>): THREE.Quaternion =>
    new THREE.Quaternion().fromArray(c.q);

  it('range la plaque dans le coin haut-gauche d’une caisse ouverte devant', () => {
    const l = place(quat(makeCrate()));
    expect(l.rotation.z).toBe(0);
    // demi-zone libre 1,17 × 1,67 ; plaque 0,8 × 0,34 ; marge 0,08
    expect(l.position.x).toBeCloseTo(-(1.17 - 0.4 - 0.08));
    expect(l.position.y).toBeCloseTo(1.67 - 0.17 - 0.08);
  });

  it('lit la plaque depuis l’avant quand le fond est horizontal (caisse ouverte en haut)', () => {
    const l = place(new THREE.Quaternion().fromArray(Q_DEBOUT));
    expect(l.rotation.z).toBe(0);
  });

  it('tourne la plaque pour garder le texte droit après un quart de tour', () => {
    const c = makeCrate({ q: rotatedQuat(makeCrate(), 'z', 1) });
    const l = place(quat(c));
    expect(l.rotation.z).toBeCloseTo(-Math.PI / 2);
    // sens de lecture tourné : la zone « haut » est maintenant la largeur
    expect(l.position.x).toBeCloseTo(1.17 - 0.17 - 0.08);
    expect(l.position.y).toBeCloseTo(1.67 - 0.4 - 0.08);
  });

  it('retourne la plaque d’une caisse à l’envers', () => {
    const once = makeCrate({ q: rotatedQuat(makeCrate(), 'z', 1) });
    const c = makeCrate({ q: rotatedQuat(once, 'z', 1) });
    expect(place(quat(c)).rotation.z).toBeCloseTo(Math.PI);
  });

  it('choisit le quart de tour dans l’autre sens', () => {
    const c = makeCrate({ q: rotatedQuat(makeCrate(), 'z', -1) });
    expect(place(quat(c)).rotation.z).toBeCloseTo(Math.PI / 2);
  });
});
