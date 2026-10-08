import * as THREE from 'three';

import { GAP, OUTLINE_PAD, PLANK as T, SLAT } from '@/constants';
import type { CrateSize, Dims, Id } from '@/types';

import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader, type Font } from 'three/addons/loaders/FontLoader.js';

import { lowPolyBox, metalMat, outlineMat, woodMaterial } from './materials';

export type CrateRig = {
  id: Id;
  size: CrateSize;
  /** Cotes utilisées à la construction (`w|h|d`), pour reconstruire si elles changent. */
  dimsKey: string;
  group: THREE.Group;
  /** Plaque 3D du numéro (enfant du groupe), replacée à chaque rotation par uprightLabel. */
  label: THREE.Group;
  /** Numéro en relief sur la plaque (null tant que la police n'est pas chargée). */
  text: THREE.Mesh | null;
  /** Demi-dimensions de la zone libre du fond (à l'intérieur des parois). */
  inner: { hx: number; hy: number };
  /** Caisse transparente : son volume et ses arêtes, masquables (mode bibliothèque, caisse vide). */
  shell: THREE.Object3D[];
  labelText: string;
  /** Boîte invisible pour le picking / le glisser-déposer (userData.id = id de la caisse). */
  hit: THREE.Mesh;
  outline: THREE.LineSegments;
};

/** Étiquette : largeur, hauteur (tient sur une planche du fond), marge au bord. */
const LABEL_W = 0.8;
const LABEL_H = 0.34;
const LABEL_MARGIN = 0.08;
const PLAQUE_T = 0.03;
const TEXT_DEPTH = 0.025;
/** Police vectorielle (helvetiker bold, MIT, issue de three.js) servie depuis public/fonts. */
const FONT_URL = '/fonts/helvetiker_bold.typeface.json';

/**
 * Caisse à claire-voie debout sur la tranche, ouverture vers +Z, cerclages métal rivetés —
 * ou, pour la taille X, simple volume transparent aux cotes données.
 */
export const buildCrate = (id: Id, size: CrateSize, dims: Dims): CrateRig => {
  const { w, h, d } = dims;
  const g = new THREE.Group();
  const shell: THREE.Object3D[] = [];

  const plank = (sw: number, sh: number, sd: number, x: number, y: number, z: number): void => {
    const m = new THREE.Mesh(lowPolyBox(sw, sh, sd), woodMaterial());
    m.position.set(x, y, z);
    m.rotation.set(
      (Math.random() - 0.5) * 0.02,
      (Math.random() - 0.5) * 0.02,
      (Math.random() - 0.5) * 0.02,
    );
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  const metal = (sw: number, sh: number, sd: number, x: number, y: number, z: number): void => {
    const m = new THREE.Mesh(lowPolyBox(sw, sh, sd, 0.005), metalMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };

  if (size === 'X') {
    // caisse transparente : volume bleuté et arêtes, rien d'autre
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        color: 0x3498db,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    box.renderOrder = 1;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box.geometry),
      new THREE.LineBasicMaterial({ color: 0x2980b9, transparent: true, opacity: 0.85 }),
    );
    g.add(box, edges);
    shell.push(box, edges);
  } else {
    // fond : planches pleines empilées en Y
    {
      const span = h - 2 * T;
      const n = Math.max(2, Math.ceil(span / (SLAT + 0.04)));
      const bh = (span - (n - 1) * 0.04) / n;
      for (let i = 0; i < n; i++)
        plank(w - 2 * T, bh, T, 0, -h / 2 + T + bh / 2 + i * (bh + 0.04), -d / 2 + T / 2);
    }
    // tour (haut, bas, côtés) : planches en anneaux autour de la caisse, empilées du fond vers
    // l'ouverture, comme une vraie caisse à claire-voie
    {
      const span = d - T;
      const n = Math.max(2, Math.round(span / (SLAT + GAP)));
      const sw = (span - (n - 1) * GAP) / n;
      for (let i = 0; i < n; i++) {
        const z = -d / 2 + T + sw / 2 + i * (sw + GAP);
        plank(w, T, sw, 0, h / 2 - T / 2, z);
        plank(w, T, sw, 0, -h / 2 + T / 2, z);
        plank(T, h - 2 * T, sw, w / 2 - T / 2, 0, z);
        plank(T, h - 2 * T, sw, -w / 2 + T / 2, 0, z);
      }
    }

    // ---- armature métal ----
    const mt = 0.04;
    const strapW = 0.13;
    const out = mt / 2 + 0.002;
    // feuillards (anneaux XY) près de l'avant et de l'arrière
    const strapZs = [-d / 2 + 0.25, d / 2 - 0.22];
    for (const z of strapZs) {
      for (const sy of [-1, 1]) metal(w + 4 * out, mt, strapW, 0, sy * (h / 2 + out), z);
      for (const sx of [-1, 1]) metal(mt, h + 4 * out, strapW, sx * (w / 2 + out), 0, z);
    }
    // lèvre avant : cornière autour de l'ouverture
    for (const sy of [-1, 1]) metal(w + 4 * out, mt, 0.1, 0, sy * (h / 2 + out), d / 2 - 0.05);
    for (const sx of [-1, 1]) metal(mt, h + 4 * out, 0.1, sx * (w / 2 + out), 0, d / 2 - 0.05);

    // rivets (instanciés)
    const rivets: [number, number, number, 'x' | 'y'][] = [];
    const r = out + mt / 2 + 0.008;
    for (const z of strapZs) {
      for (let x = -w / 2 + 0.45; x <= w / 2 - 0.4; x += 0.55)
        for (const sy of [-1, 1]) rivets.push([x, sy * (h / 2 + r), z, 'y']);
      for (let y = -h / 2 + 0.45; y <= h / 2 - 0.4; y += 0.55)
        for (const sx of [-1, 1]) rivets.push([sx * (w / 2 + r), y, z, 'x']);
    }
    const rivetMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.03, 0.04, 0.025, 6),
      metalMat,
      rivets.length,
    );
    const dummy = new THREE.Object3D();
    rivets.forEach(([x, y, z, axis], i) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, axis === 'x' ? Math.PI / 2 : 0);
      dummy.updateMatrix();
      rivetMesh.setMatrixAt(i, dummy.matrix);
    });
    rivetMesh.castShadow = true;
    g.add(rivetMesh);
  }

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.1, h + 0.1, d + 0.1),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.userData.id = id;
  g.add(hit);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(
      new THREE.BoxGeometry(w + 2 * OUTLINE_PAD, h + 2 * OUTLINE_PAD, d + 2 * OUTLINE_PAD),
    ),
    outlineMat,
  );
  outline.visible = false;
  outline.renderOrder = 995;
  g.add(outline);

  // plaque 3D du numéro, fixée sur le fond ; placée dans le coin haut-gauche (monde) par uprightLabel
  const label = new THREE.Group();
  const plaque = new THREE.Mesh(
    new THREE.BoxGeometry(LABEL_W, LABEL_H, PLAQUE_T),
    new THREE.MeshStandardMaterial({
      color: 0xe2d3ad,
      roughness: 0.6,
      metalness: 0.15,
      flatShading: true,
    }),
  );
  plaque.castShadow = true;
  plaque.receiveShadow = true;
  label.add(plaque);
  for (const sx of [-1, 1]) {
    const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.02, 8), metalMat);
    rivet.rotation.x = Math.PI / 2;
    rivet.position.set(sx * (LABEL_W / 2 - 0.07), 0, PLAQUE_T / 2 + 0.008);
    label.add(rivet);
  }
  label.position.set(0, 0, -d / 2 + T + PLAQUE_T / 2 + 0.002);
  g.add(label);

  return {
    id,
    size,
    dimsKey: `${w}|${h}|${d}`,
    group: g,
    hit,
    outline,
    label,
    text: null,
    labelText: '',
    inner: { hx: w / 2 - T, hy: h / 2 - T },
    shell,
  };
};

// ---- numéro en relief : police chargée une fois, les plaques en attente sont complétées à l'arrivée ----
let font: Font | null = null;
let fontLoading = false;
const pendingText = new Set<CrateRig>();

const rebuildText = (rig: CrateRig): void => {
  if (rig.text) {
    rig.label.remove(rig.text);
    rig.text.geometry.dispose();
    (rig.text.material as THREE.Material).dispose();
    rig.text = null;
  }
  if (!rig.labelText) return;
  if (!font) {
    pendingText.add(rig);
    if (!fontLoading) {
      fontLoading = true;
      new FontLoader().load(FONT_URL, (f) => {
        font = f;
        for (const r of pendingText) rebuildText(r);
        pendingText.clear();
      });
    }
    return;
  }
  const geo = new TextGeometry(rig.labelText, {
    font,
    size: LABEL_H * 0.55,
    depth: TEXT_DEPTH,
    curveSegments: 4,
    bevelEnabled: false,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, 0);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 0.55, flatShading: true }),
  );
  mesh.position.z = PLAQUE_T / 2;
  mesh.castShadow = true;
  rig.label.add(mesh);
  rig.text = mesh;
};

export const setCrateLabel = (rig: CrateRig, text: string): void => {
  if (rig.labelText === text) return;
  rig.labelText = text;
  rebuildText(rig);
};

/** À appeler avant de jeter une caisse : retire la plaque des attentes de police. */
export const forgetCrateLabel = (rig: CrateRig): void => {
  pendingText.delete(rig);
};

const _dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const BACK = new THREE.Vector3(0, 0, -1);
/** Directions « haut » possibles du texte dans le plan du fond (local), et la rotation associée. */
const IN_PLANE: { v: THREE.Vector3; rot: number }[] = [
  { v: new THREE.Vector3(0, 1, 0), rot: 0 },
  { v: new THREE.Vector3(0, -1, 0), rot: Math.PI },
  { v: new THREE.Vector3(1, 0, 0), rot: -Math.PI / 2 },
  { v: new THREE.Vector3(-1, 0, 0), rot: Math.PI / 2 },
];

/**
 * Garde le numéro droit : parmi les quatre orientations possibles dans le plan du fond, prend celle
 * dont le « haut » pointe le plus vers le haut du monde ; si le fond est horizontal (caisse debout),
 * vers l'arrière, pour lire le numéro depuis l'avant. Puis le range dans le coin haut-gauche (au sens
 * de la lecture) de la zone libre du fond, dans la zone libre, pour qu'il ne soit jamais coupé.
 */
export const uprightLabel = (rig: CrateRig, q: THREE.Quaternion): void => {
  const score = (ref: THREE.Vector3): { rot: number; best: number } => {
    let best = -Infinity;
    let rot = 0;
    for (const o of IN_PLANE) {
      const d = _dir.copy(o.v).applyQuaternion(q).dot(ref);
      if (d > best) {
        best = d;
        rot = o.rot;
      }
    }
    return { rot, best };
  };
  const up = score(UP);
  const rot = up.best > 0.5 ? up.rot : score(BACK).rot;
  rig.label.rotation.z = rot;
  // repères de lecture dans le plan du fond
  const upX = -Math.sin(rot);
  const upY = Math.cos(rot);
  const rightX = Math.cos(rot);
  const rightY = Math.sin(rot);
  const { hx, hy } = rig.inner;
  const halfU = Math.abs(upX) * hx + Math.abs(upY) * hy;
  const halfR = Math.abs(rightX) * hx + Math.abs(rightY) * hy;
  const du = halfU - LABEL_H / 2 - LABEL_MARGIN;
  const dr = halfR - LABEL_W / 2 - LABEL_MARGIN;
  rig.label.position.x = upX * du - rightX * dr;
  rig.label.position.y = upY * du - rightY * dr;
};
