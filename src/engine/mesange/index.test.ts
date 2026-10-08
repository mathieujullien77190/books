import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MESANGE_SCALE, MESANGE_URL, MESANGE_YAW } from './constants';
import { createMesangeAnimator as reexported, loadMesange } from './index';
import { createMesangeAnimator } from './animation';

const gltf = vi.hoisted(() => ({ loadAsync: vi.fn() }));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync = gltf.loadAsync;
  },
}));

/** Maillage dont les sommets ont les couleurs données (chaque couleur = un sommet). */
const colored = (name: string, colors: number[][]): THREE.Mesh => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      colors.flat().map(() => 0),
      3,
    ),
  );
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors.flat(), 3));
  const m = new THREE.Mesh(geo);
  m.name = name;
  return m;
};

const colorsOf = (m: THREE.Mesh): number[] =>
  Array.from(m.geometry.getAttribute('color').array).map((n) => Math.round(n * 1e4) / 1e4);

beforeEach(() => {
  gltf.loadAsync.mockReset();
});

describe('constantes de la mésange', () => {
  it('la mésange est à l’échelle de la scène et regarde en diagonale vers l’avant droit', () => {
    expect(MESANGE_URL).toBe('/mesange/mesange.glb');
    expect(MESANGE_SCALE).toBe(1.1);
    expect(MESANGE_YAW).toBeCloseTo(Math.PI / 4);
  });

  it('réexporte l’animateur', () => {
    expect(reexported).toBe(createMesangeAnimator);
  });
});

describe('loadMesange', () => {
  it('charge le modèle, noircit la tête et le ventre, et monte les groupes', async () => {
    const scene = new THREE.Group();
    // ventre : sommets très sombres → noir franc, les autres gardés
    const body = colored('body', [
      [0.01, 0.01, 0.01],
      [0.2, 0.2, 0.2],
    ]);
    // la tête est un nœud enfant du corps ; calotte sombre → noir, joues claires gardées
    const head = new THREE.Group();
    head.name = 'head';
    const cap = colored('cap', [
      [0.1, 0.1, 0.1],
      [0.9, 0.9, 0.9],
      [0.3, 0.3, 0.3],
    ]);
    const bare = new THREE.Mesh(new THREE.BufferGeometry()); // sans couleurs : ignoré
    head.add(cap, bare, new THREE.Object3D());
    body.add(head);
    scene.add(body);
    gltf.loadAsync.mockResolvedValue({ scene });

    const bird = await loadMesange();

    expect(gltf.loadAsync).toHaveBeenCalledWith('/mesange/mesange.glb');
    expect(bird).not.toBeNull();
    expect(colorsOf(cap)).toEqual([0, 0, 0, 0.9, 0.9, 0.9, 0, 0, 0]);
    // ventre : seule la pièce du corps est touchée, la luminance 0,2 dépasse le seuil 0,08
    expect(colorsOf(body)).toEqual([0, 0, 0, 0.2, 0.2, 0.2]);
    // ombres portées, jamais reçues
    expect(body.castShadow).toBe(true);
    expect(body.receiveShadow).toBe(false);
    expect(cap.castShadow).toBe(true);
    // groupe externe à l'échelle, nœud intérieur tourné vers la droite
    expect(bird!.group.scale.x).toBeCloseTo(MESANGE_SCALE);
    const inner = bird!.group.children[0]!;
    expect(inner.rotation.y).toBeCloseTo(MESANGE_YAW);
    expect(inner.children).toEqual([scene]);
  });

  it('fournit une animation appelable à chaque image', async () => {
    gltf.loadAsync.mockResolvedValue({ scene: new THREE.Group() });
    const bird = await loadMesange();
    expect(() => bird!.update(0.016, 1)).not.toThrow();
  });

  it('accepte un modèle sans tête ni corps', async () => {
    gltf.loadAsync.mockResolvedValue({ scene: new THREE.Group() });
    await expect(loadMesange()).resolves.not.toBeNull();
  });

  it('ignore un « corps » qui n’est pas un maillage ou n’a pas de couleurs', async () => {
    const scene = new THREE.Group();
    const notMesh = new THREE.Group();
    notMesh.name = 'body';
    scene.add(notMesh);
    gltf.loadAsync.mockResolvedValueOnce({ scene });
    await expect(loadMesange()).resolves.not.toBeNull();

    const scene2 = new THREE.Group();
    const bare = new THREE.Mesh(new THREE.BufferGeometry());
    bare.name = 'body';
    scene2.add(bare);
    gltf.loadAsync.mockResolvedValueOnce({ scene: scene2 });
    await expect(loadMesange()).resolves.not.toBeNull();
    expect(bare.geometry.getAttribute('color')).toBeUndefined();
  });

  it('renvoie null quand le fichier est introuvable', async () => {
    gltf.loadAsync.mockRejectedValue(new Error('404'));
    await expect(loadMesange()).resolves.toBeNull();
  });
});
