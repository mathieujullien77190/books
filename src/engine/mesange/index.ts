import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createMesangeAnimator } from './animation';
import { MESANGE_SCALE, MESANGE_URL, MESANGE_YAW } from './constants';

export { createMesangeAnimator } from './animation';

export type Mesange = {
  group: THREE.Group;
  /** À appeler à chaque image : dt = secondes écoulées, t = temps total en secondes. */
  update: (dt: number, t: number) => void;
};

/** Les facettes sombres de la tête (calotte, gorge, bec) ont une légère variation de gris : on les passe en noir franc, seules les joues blanches restent claires. */
const blackenHead = (bird: THREE.Object3D): void => {
  bird.getObjectByName('head')?.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const col = o.geometry.getAttribute('color');
    if (!col) return;
    const c = new THREE.Color();
    for (let i = 0; i < col.count; i++) {
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
      if (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.5) col.setXYZ(i, 0, 0, 0);
    }
    col.needsUpdate = true;
  });
};

/** La bande du ventre est faite de facettes gris très sombre : noir franc. Seule la pièce du corps est touchée (pas les ailes bleues ni les pattes, dont les nœuds sont ses enfants). */
const blackenBelly = (bird: THREE.Object3D): void => {
  const body = bird.getObjectByName('body');
  if (!(body instanceof THREE.Mesh)) return;
  const col = body.geometry.getAttribute('color');
  if (!col) return;
  const c = new THREE.Color();
  for (let i = 0; i < col.count; i++) {
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    if (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.08) col.setXYZ(i, 0, 0, 0);
  }
  col.needsUpdate = true;
};

/** Charge la mésange charbonnière (low poly, animée) ; null si le fichier est introuvable (la scène marche sans). */
export const loadMesange = async (): Promise<Mesange | null> => {
  try {
    const gltf = await new GLTFLoader().loadAsync(MESANGE_URL);
    const bird = gltf.scene;
    blackenHead(bird);
    blackenBelly(bird);
    bird.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
    // Nœud intérieur tourné vers la droite : les rotations de l'animation restent dans le repère du modèle.
    const inner = new THREE.Group();
    inner.rotation.y = MESANGE_YAW;
    inner.add(bird);
    const group = new THREE.Group();
    group.scale.setScalar(MESANGE_SCALE);
    group.add(inner);
    return { group, update: createMesangeAnimator(bird) };
  } catch {
    return null;
  }
};
