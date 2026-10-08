import * as THREE from 'three';

/** Un livre manquant : boîte translucide posée à plat, titre lisible sur la tranche. */
export const GHOST_H = 2; // hauteur du livre (couché : sa longueur en X)
export const GHOST_D = 1.4; // profondeur
export const GHOST_T = 0.32; // épaisseur de la tranche (assez pour y lire le titre)

const labelTexture = (text: string): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 80;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(214,220,232,0.9)';
  g.fillRect(0, 0, c.width, c.height);
  g.setLineDash([10, 8]);
  g.strokeStyle = 'rgba(60,70,90,0.7)';
  g.lineWidth = 4;
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  g.fillStyle = '#3a4357';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 40;
  g.font = `600 ${size}px sans-serif`;
  while (g.measureText(text).width > c.width - 30 && size > 12) {
    size -= 2;
    g.font = `600 ${size}px sans-serif`;
  }
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

export const buildGhost = (label: string): THREE.Mesh => {
  const side = new THREE.MeshBasicMaterial({ color: 0xd6dce8, transparent: true, opacity: 0.45 });
  const front = new THREE.MeshBasicMaterial({
    map: labelTexture(label),
    transparent: true,
    opacity: 0.9,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(GHOST_H, GHOST_T, GHOST_D), [
    side,
    side,
    side,
    side,
    front,
    side,
  ]);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x5a6680, transparent: true, opacity: 0.6 }),
  );
  mesh.add(edges);
  return mesh;
};
