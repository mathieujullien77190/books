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

/** Charge la mésange charbonnière (low poly, animée) ; null si le fichier est introuvable (la scène marche sans). */
export const loadMesange = async (): Promise<Mesange | null> => {
  try {
    const gltf = await new GLTFLoader().loadAsync(MESANGE_URL);
    const bird = gltf.scene;
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
