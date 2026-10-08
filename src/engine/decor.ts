import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Mésange charbonnière en low poly (modèle de l'atelier lowpoly), posée sur la caisse la plus haute. */
const MESANGE_URL = '/models/mesange.glb';
/** Le modèle fait ~1 unité (10 cm) : un peu plus qu'une vraie mésange de 12 cm. */
const MESANGE_SCALE = 1.1;
/** Elle regarde vers la droite (le modèle regarde vers +Z). */
const MESANGE_YAW = Math.PI / 2;

/** Charge la mésange ; null si le fichier est introuvable (la scène marche sans). */
export const loadMesange = async (): Promise<THREE.Group | null> => {
  try {
    const gltf = await new GLTFLoader().loadAsync(MESANGE_URL);
    const bird = gltf.scene;
    bird.scale.setScalar(MESANGE_SCALE);
    bird.rotation.y = MESANGE_YAW;
    bird.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
    const holder = new THREE.Group();
    holder.add(bird);
    return holder;
  } catch {
    return null;
  }
};
