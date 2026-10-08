import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';

import { BirdLabel } from './birdLabel';

type FakeEl = { style: Record<string, string> };

const canvas = { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement;

/** Caméra en (0, 0, 10) qui regarde l'origine. */
const camera = (): THREE.PerspectiveCamera => {
  const c = new THREE.PerspectiveCamera(40, 800 / 600, 0.1, 100);
  c.position.set(0, 0, 10);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  return c;
};

/** Oiseau factice : un cube de côté 1 centré en (x, y, z). */
const bird = (x = 0, y = 0, z = 0): THREE.Group => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
  g.position.set(x, y, z);
  g.updateMatrixWorld(true);
  return g;
};

let el: FakeEl;
let label: BirdLabel;

beforeEach(() => {
  el = { style: {} };
  label = new BirdLabel();
  label.attach(el as unknown as HTMLElement);
});

describe('BirdLabel.place', () => {
  it('ne fait rien sans élément attaché', () => {
    const l = new BirdLabel();
    expect(() => l.place(bird(), false, camera(), canvas)).not.toThrow();
    label.attach(null);
    label.place(bird(), false, camera(), canvas);
    expect(el.style).toEqual({});
  });

  it('se colle à la tête de l’oiseau, en pixels du canevas', () => {
    const cam = camera();
    label.place(bird(), false, cam, canvas);
    // tête : sommet de la boîte (0,5) moins 8 % de sa hauteur
    const ndc = new THREE.Vector3(0, 0.5 - 0.08, 0).project(cam);
    const x = ((ndc.x + 1) / 2) * 800;
    const y = ((1 - ndc.y) / 2) * 600;
    expect(el.style.transform).toBe(`translate(${x}px, ${y}px)`);
    expect(el.style.opacity).toBe('1');
    expect(el.style.visibility).toBe('visible');
  });

  it('suit l’oiseau quand il se déplace', () => {
    const cam = camera();
    label.place(bird(), false, cam, canvas);
    const first = el.style.transform;
    label.place(bird(2, 0, 0), false, cam, canvas);
    expect(el.style.transform).not.toBe(first);
    const px = Number(/translate\(([-\d.e]+)px/.exec(el.style.transform!)![1]);
    expect(px).toBeGreaterThan(400);
  });

  it('se cache quand un livre est sorti, en rendant le lien non cliquable', () => {
    label.place(bird(), true, camera(), canvas);
    expect(el.style.opacity).toBe('0');
    expect(el.style.visibility).toBe('hidden');
    expect(el.style.transform).toBeUndefined();
  });

  it('se cache quand la mésange est absente ou masquée', () => {
    label.place(null, false, camera(), canvas);
    expect(el.style).toEqual({ opacity: '0', visibility: 'hidden' });
    const b = bird();
    b.visible = false;
    el.style = {};
    label.place(b, false, camera(), canvas);
    expect(el.style).toEqual({ opacity: '0', visibility: 'hidden' });
  });

  it('se cache quand l’oiseau passe derrière la caméra', () => {
    label.place(bird(0, 0, 20), false, camera(), canvas);
    expect(el.style.opacity).toBe('0');
    expect(el.style.visibility).toBe('hidden');
    expect(el.style.transform).toBeDefined();
  });
});
