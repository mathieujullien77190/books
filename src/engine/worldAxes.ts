import * as THREE from 'three';

import type { RotAxis } from '@/types';

/**
 * Convention d'affichage type CAO : X rouge, Y vert en profondeur, Z bleu vers le haut.
 * En interne three.js garde Y vertical : l'axe interne y s'affiche « Z », l'axe interne z s'affiche « Y ».
 */
export const AXIS_COLORS: Record<RotAxis, number> = { x: 0xe74c3c, y: 0x3498db, z: 0x2ecc71 };
export const AXIS_LABELS: Record<RotAxis, string> = { x: 'X', y: 'Z', z: 'Y' };

const label = (text: string, color: number): THREE.Sprite => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  g.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  );
  s.scale.setScalar(0.6);
  s.renderOrder = 998;
  return s;
};

/** Grille au sol, fixe : 1 carreau = 0,5 unité = 5 cm. */
export const buildGrid = (): THREE.GridHelper => {
  const grid = new THREE.GridHelper(40, 80, 0x7f9a7c, 0xb3c4b0);
  grid.position.y = 0.01;
  const gm = grid.material as THREE.LineBasicMaterial;
  gm.transparent = true;
  gm.opacity = 0.45;
  return grid;
};

export type WorldAxes = {
  group: THREE.Group;
  /** Étend un axe de neg (≤ 0) à pos (≥ 0), la lettre au bout positif. */
  setExtent: (axis: RotAxis, neg: number, pos: number) => void;
};

/**
 * Repère global fixe à l'origine : X rouge, Y vert (profondeur), Z bleu (vertical). Traits fins
 * (même épaisseur que le cadre de sélection), dessinés par-dessus la scène. Les axes s'étendent
 * juste assez pour couvrir les caisses posées.
 */
export const buildWorldAxes = (): WorldAxes => {
  const group = new THREE.Group();
  const DIR: Record<RotAxis, THREE.Vector3> = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
  };
  const parts = {} as Record<RotAxis, { line: THREE.Line; tag: THREE.Sprite }>;
  for (const a of ['x', 'y', 'z'] as RotAxis[]) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), DIR[a].clone()]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: AXIS_COLORS[a], depthTest: false, transparent: true }),
    );
    line.renderOrder = 996;
    const tag = label(AXIS_LABELS[a], AXIS_COLORS[a]);
    group.add(line, tag);
    parts[a] = { line, tag };
  }
  const setExtent = (a: RotAxis, neg: number, pos: number): void => {
    const { line, tag } = parts[a];
    const p = line.geometry.attributes.position as THREE.BufferAttribute;
    const d = DIR[a];
    p.setXYZ(0, d.x * neg, d.y * neg, d.z * neg);
    p.setXYZ(1, d.x * pos, d.y * pos, d.z * pos);
    p.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    tag.position.copy(d).multiplyScalar(pos + 0.45);
  };
  setExtent('x', 0, 3);
  setExtent('y', 0, 3);
  setExtent('z', 0, 3);
  return { group, setExtent };
};
