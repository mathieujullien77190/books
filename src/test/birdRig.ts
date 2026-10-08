import * as THREE from 'three';

const node = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group => {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

export type BirdNodes = {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
  tail: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  legs: { thigh: THREE.Group; shin: THREE.Group; foot: THREE.Group }[];
};

/**
 * Squelette minimal d'oiseau aux nœuds nommés comme le modèle réel : corps à 1 de hauteur, pattes
 * avec genou plié vers l'avant (cuisse 0,5, jambe 0,5, pied posé au sol).
 */
export const makeBirdNodes = (): BirdNodes => {
  const root = new THREE.Group();
  const body = node('body', root, 0, 1, 0);
  const head = node('head', body, 0, 0.3, 0.2);
  const jaw = node('jaw', head, 0, 0, 0.1);
  const tail = node('tail', body, 0, 0, -0.3);
  const wingL = node('wingL', body, -0.2, 0.1, 0);
  const wingR = node('wingR', body, 0.2, 0.1, 0);
  const legs = (['L', 'R'] as const).map((s) => {
    const thigh = node('thigh' + s, body, s === 'L' ? -0.1 : 0.1, 0, 0);
    const shin = node('shin' + s, thigh, 0, -0.5, 0.1);
    const foot = node('foot' + s, shin, 0, -0.5, -0.1);
    return { thigh, shin, foot };
  });
  return { root, body, head, jaw, tail, wingL, wingR, legs };
};
