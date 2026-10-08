/** Texte « peint » au sol, devant la bibliothèque (consigne de navigation à la souris). */
import * as THREE from 'three';

const W = 2048;
const H = 160;
/** Largeur du texte au sol (unités scène : 1 = 10 cm). */
export const GROUND_TEXT_WIDTH = 14;

export const buildGroundText = (text: string): THREE.Mesh => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  g.fillStyle = 'rgba(31, 42, 55, 0.5)'; // peinture sombre et un peu fanée, lisible sur un bureau clair
  g.font = '700 84px ui-monospace, Menlo, Consolas, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), W / 2, H / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_TEXT_WIDTH, (GROUND_TEXT_WIDTH * H) / W),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2; // à plat, le haut du texte vers le fond de la scène
  mesh.position.y = 0.02;
  mesh.renderOrder = 1;
  return mesh;
};
