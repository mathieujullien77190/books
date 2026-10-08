import * as THREE from 'three';

/** Arête du cube entier (unités scène, 1 = 10 cm) : un Rubik's cube standard fait 5,7 cm. */
export const RUBIK_SIZE = 0.57;

/** Blanc, jaune, rouge, orange, bleu, vert. */
const STICKERS = [0xf4f4f4, 0xf2c500, 0xc4262e, 0xf07a1a, 0x1c5fb8, 0x2a9d4a];

/** Générateur pseudo-aléatoire déterministe : un même cube est toujours mélangé de la même façon. */
const seeded = (seed: string): (() => number) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};

export type RubikRig = {
  group: THREE.Group;
  /** Boîte invisible pour le picking (userData.propId = id de l'objet). */
  hit: THREE.Mesh;
};

/**
 * Rubik's cube mélangé : 27 petits cubes noirs, un autocollant par face visible. L'origine du
 * groupe est au centre de la base, le cube repose donc sur y = 0.
 */
export const buildRubik = (id: string): RubikRig => {
  const rnd = seeded(id);
  const c = RUBIK_SIZE / 3;
  const body = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.55 });
  const stickers = STICKERS.map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 }),
  );
  const cubeGeo = new THREE.BoxGeometry(c * 0.98, c * 0.98, c * 0.98);
  const stickerGeo = new THREE.PlaneGeometry(c * 0.84, c * 0.84);
  const group = new THREE.Group();

  // (axe, signe) de chaque face d'un petit cube
  const faces: [number, number][] = [
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [2, 1],
    [2, -1],
  ];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        const cubelet = new THREE.Group();
        cubelet.position.set(x * c, RUBIK_SIZE / 2 + y * c, z * c);
        const mesh = new THREE.Mesh(cubeGeo, body);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        cubelet.add(mesh);
        const at = [x, y, z];
        for (const [axis, sign] of faces) {
          if (at[axis] !== sign) continue; // face tournée vers l'intérieur : pas d'autocollant
          const sticker = new THREE.Mesh(stickerGeo, stickers[Math.floor(rnd() * 6)]!);
          const p = [0, 0, 0];
          p[axis] = sign * (c * 0.49 + 0.0008);
          sticker.position.set(p[0]!, p[1]!, p[2]!);
          sticker.lookAt(cubelet.position.clone().add(new THREE.Vector3(...p).multiplyScalar(2)));
          cubelet.add(sticker);
        }
        group.add(cubelet);
      }
  group.rotation.y = 0;

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(RUBIK_SIZE * 1.1, RUBIK_SIZE * 1.1, RUBIK_SIZE * 1.1),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.y = RUBIK_SIZE / 2;
  hit.userData.propId = id;
  group.add(hit);
  return { group, hit };
};
