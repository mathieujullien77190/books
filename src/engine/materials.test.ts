import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { disposeGroup, lowPolyBox, metalMat, outlineMat, woodMaterial } from './materials';

afterEach(() => {
  vi.restoreAllMocks();
});

const hsl = (c: THREE.Color): { h: number; s: number; l: number } => c.getHSL({ h: 0, s: 0, l: 0 });

describe('lowPolyBox', () => {
  it('sans hasard, donne les huit sommets de la boîte avec des normales recalculées', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const g = lowPolyBox(2, 4, 6);
    expect(g.attributes.position!.count).toBe(8);
    expect(g.attributes.uv).toBeUndefined();
    expect(g.attributes.normal).toBeDefined();
    g.computeBoundingBox();
    expect(g.boundingBox!.min.toArray()).toEqual([-1, -2, -3]);
    expect(g.boundingBox!.max.toArray()).toEqual([1, 2, 3]);
  });

  it('déplace les sommets au plus de la moitié du jitter', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const g = lowPolyBox(2, 2, 2, 0.1);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.x).toBeCloseTo(1.05);
    expect(g.boundingBox!.min.x).toBeCloseTo(-0.95);
  });
});

describe('woodMaterial', () => {
  it('tire un bois gris-brun délavé une fois sur trois environ', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const m = woodMaterial();
    const c = hsl(m.color);
    expect(c.h).toBeCloseTo(0.08 + 0.1 * 0.04, 2);
    expect(c.s).toBeCloseTo(0.06 + 0.1 * 0.08, 1);
    expect(c.l).toBeCloseTo(0.26 + 0.1 * 0.12, 1);
    expect(m.roughness).toBe(0.95);
    expect(m.metalness).toBe(0);
    expect(m.flatShading).toBe(true);
  });

  it('tire sinon un bois brun plus saturé', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const c = hsl(woodMaterial().color);
    expect(c.h).toBeCloseTo(0.06 + 0.9 * 0.03, 2);
    expect(c.s).toBeCloseTo(0.18 + 0.9 * 0.14, 1);
    expect(c.l).toBeCloseTo(0.2 + 0.9 * 0.14, 1);
  });
});

describe('matériaux partagés', () => {
  it('le métal est un acier sombre et le cadre de sélection passe par-dessus tout', () => {
    expect(metalMat.metalness).toBe(0.8);
    expect(outlineMat.depthTest).toBe(false);
    expect(outlineMat.transparent).toBe(true);
  });
});

describe('disposeGroup', () => {
  it('libère géométrie, carte et matériau de chaque maillage, y compris les matériaux en tableau', () => {
    const geoA = new THREE.BoxGeometry();
    const geoB = new THREE.BoxGeometry();
    const map = new THREE.Texture();
    const matA = new THREE.MeshStandardMaterial({ map });
    const matB = new THREE.MeshStandardMaterial();
    const matC = new THREE.MeshStandardMaterial();
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geoA, matA), new THREE.Mesh(geoB, [matB, matC]));
    const spies = [geoA, geoB, map, matA, matB, matC].map((o) => vi.spyOn(o, 'dispose'));
    disposeGroup(group);
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
  });

  it('épargne les matériaux partagés (métal, cadre)', () => {
    const metal = vi.spyOn(metalMat, 'dispose');
    const outline = vi.spyOn(outlineMat, 'dispose');
    const geo = new THREE.BoxGeometry();
    const geoSpy = vi.spyOn(geo, 'dispose');
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geo, metalMat), new THREE.LineSegments(geo, outlineMat));
    disposeGroup(group);
    expect(geoSpy).toHaveBeenCalled();
    expect(metal).not.toHaveBeenCalled();
    expect(outline).not.toHaveBeenCalled();
  });

  it('ignore les objets sans géométrie ni matériau', () => {
    const group = new THREE.Group();
    group.add(new THREE.Object3D(), new THREE.Group());
    expect(() => disposeGroup(group)).not.toThrow();
  });

  it('ignore un objet qui a une géométrie mais pas de matériau', () => {
    const geo = new THREE.BoxGeometry();
    const spy = vi.spyOn(geo, 'dispose');
    const o = new THREE.Object3D() as unknown as THREE.Mesh;
    o.geometry = geo;
    disposeGroup(o);
    expect(spy).toHaveBeenCalled();
  });
});
