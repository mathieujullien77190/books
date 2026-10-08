import * as THREE from 'three';

import { BOOK_KINDS, MAX_BOOK_H, PLANK as T } from '@/constants';
import { crateDims } from '@/helpers';
import type { Book, BookKind, Crate, Id } from '@/types';

import { quatOf } from './orientation';

export type BookMesh = THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial[]>;

export type BookRig = {
  id: Id;
  mesh: BookMesh;
  /** Position / orientation visées, atteintes par interpolation dans la boucle de rendu. */
  target: THREE.Vector3;
  quat: THREE.Quaternion;
  /** Abscisse dans la rangée de sa caisse (null : pas rangé). */
  r: number | null;
  /** Livre couché : le titre de la tranche est retourné d'un demi-tour pour se lire à l'endroit. */
  flat: boolean;
  /** Couverture et dos ne sont dessinés qu'au besoin (livre couché, voisin, sorti) : 300 livres debout
   * ne montrent que leur tranche, inutile de fabriquer 600 grandes textures au chargement. */
  faces: { cover: boolean; back: boolean };
};

const applySpineTurn = (rig: BookRig): void => {
  const map = rig.mesh.material[4]?.map;
  if (!map) return;
  map.center.set(0.5, 0.5);
  // tranche écrite à l'horizontale : à plat (couverture dessus) c'est le titre horizontal qui se retourne
  map.rotation = rig.flat && map.userData.horizontal ? Math.PI : 0;
};

/**
 * Couché (couverture dessus), l'épaisseur et la hauteur du livre ne pointent plus comme debout : le
 * titre horizontal de la tranche doit être retourné pour se lire à l'endroit.
 */
export const setSpineFlat = (rig: BookRig, flat: boolean): void => {
  if (rig.flat === flat) return;
  rig.flat = flat;
  applySpineTurn(rig);
};

/** Fond clair → texte foncé. THREE.Color stocke du linéaire : luminance relative WCAG, dont le
 * seuil 0,179 départage le noir et le blanc selon le meilleur contraste. */
const isLight = (color: string): boolean => {
  const c = new THREE.Color(color);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.179;
};

const toTexture = (c: HTMLCanvasElement, anisotropy: number): THREE.CanvasTexture => {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
};

/**
 * Tranche (dos du livre) : titre à la verticale. Le canevas a les proportions de la tranche
 * (épaisseur × hauteur), sinon le placage sur la face étire le texte ; un titre trop long rétrécit.
 */
export const spineTexture = (
  title: string,
  color: string,
  aniso: number,
  t: number,
  h: number,
  textColor?: string,
): THREE.CanvasTexture => {
  const H = 1024;
  const W = Math.max(8, Math.min(512, Math.round((H * t) / h)));
  const c = document.createElement('canvas');
  // dessinée à double résolution (les coordonnées ci-dessous restent celles de la base W × H) : sur une
  // tranche fine, le titre foncé s'écrasait en bouillie floue au rétrécissement des mipmaps
  c.width = W * 2;
  c.height = H * 2;
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  const light = isLight(color);
  g.fillStyle = light ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.28)';
  g.fillRect(0, 56, W, 16);
  g.fillRect(0, H - 72, W, 16);
  g.fillStyle = textColor ?? (light ? '#0b0b12' : 'rgba(255,250,240,0.95)');
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // gros volume d'une série à tomes (« Larousse du XXe siècle 1 (A – Carl) ») : tranche large, le
  // titre s'écrit droit, le numéro et les lettres plus bas, droits eux aussi
  const vol = title.match(/^(.*?)\s+(\d+)\s*\(([^)]+)\)\s*$/);
  if (vol && W >= 100) {
    const maxW = W - 24;
    /** Plus grande police pour laquelle le texte, coupé aux espaces, tient dans maxW. */
    const fit = (text: string, maxSize: number): { lines: string[]; size: number } => {
      for (let size = maxSize; size >= 8; size -= 2) {
        g.font = `bold ${size}px Georgia, serif`;
        const lines: string[] = [];
        let line = '';
        for (const w of text.split(/\s+/)) {
          const next = line ? `${line} ${w}` : w;
          if (g.measureText(next).width > maxW && line) {
            lines.push(line);
            line = w;
          } else line = next;
        }
        lines.push(line);
        if (lines.every((l) => g.measureText(l).width <= maxW)) return { lines, size };
      }
      return { lines: [text], size: 8 };
    };
    const draw = (text: string, maxSize: number, top: number): number => {
      const { lines, size } = fit(text, maxSize);
      g.font = `bold ${size}px Georgia, serif`;
      lines.forEach((l, i) => g.fillText(l, W / 2, top + size * (0.6 + i * 1.2)));
      return top + size * 1.2 * lines.length;
    };
    const numEnd = draw(vol[2]!, 64, 90);
    draw(vol[1]!, 40, numEnd + 30);
    draw(vol[3]!, 34, Math.round(H * 0.6));
    const tex = toTexture(c, aniso);
    tex.userData.horizontal = true;
    return tex;
  }

  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(Math.PI / 2);
  let size = Math.min(88, Math.floor(W * 0.62));
  g.font = `bold ${size}px Georgia, serif`;
  while (g.measureText(title).width > H - 200 && size > 6) {
    size -= 2;
    g.font = `bold ${size}px Georgia, serif`;
  }
  g.fillText(title, 0, 0);
  g.restore();
  return toTexture(c, aniso);
};

/** Couverture (face +X) : titre centré dans un cadre. */
/** `cover` : image (URL ou data URL) dessinée par-dessus dès qu'elle est chargée. */
export const coverTexture = (
  title: string,
  color: string,
  aniso: number,
  cover?: string,
  author?: string,
  scale = 1,
  kind?: BookKind,
): THREE.CanvasTexture => {
  const W = 512;
  const H = 768;
  const c = document.createElement('canvas');
  c.width = W * scale;
  c.height = H * scale;
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  const light = isLight(color);
  const ink = light ? 'rgba(20,20,30,0.88)' : 'rgba(255,250,240,0.94)';
  const soft = light ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.22)';
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = soft;
  g.lineWidth = 6;
  g.strokeRect(36, 36, W - 72, H - 72);
  g.fillStyle = soft;
  g.fillRect(70, H - 150, W - 140, 4);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 64;
  const maxW = W - 130;
  const wrap = (): string[] => {
    g.font = `bold ${size}px Georgia, serif`;
    const lines: string[] = [];
    let line = '';
    for (const w of title.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    lines.push(line);
    return lines;
  };
  let lines = wrap();
  while ((lines.length > 5 || lines.some((l) => g.measureText(l).width > maxW)) && size > 28) {
    size -= 4;
    lines = wrap();
  }
  const lh = size * 1.18;
  const y0 = H / 2 - 40 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => g.fillText(l, W / 2, y0 + i * lh));
  g.font = `italic ${Math.round(size * 0.4)}px Georgia, serif`;
  const kindLabel =
    kind && kind !== 'autre' ? BOOK_KINDS.find((k) => k.kind === kind)?.label : null;
  if (kindLabel) g.fillText(kindLabel.toLowerCase(), W / 2, H - 110);
  if (author) {
    g.font = `${Math.round(size * 0.42)}px Georgia, serif`;
    g.fillText(author, W / 2, 92, maxW);
  }
  const tex = toTexture(c, aniso);
  if (cover) {
    const cached = coverImages.get(cover);
    if (cached?.complete && cached.naturalWidth) {
      g.drawImage(cached, 0, 0, W, H);
    } else {
      const img = new Image();
      if (!cover.startsWith('data:')) img.crossOrigin = 'anonymous';
      img.onload = () => {
        coverImages.set(cover, img);
        g.drawImage(img, 0, 0, W, H);
        tex.needsUpdate = true;
      };
      img.src = cover;
    }
  }
  return tex;
};

/** Images de couverture déjà chargées : un livre rouvert se redessine sans clignoter. */
const coverImages = new Map<string, HTMLImageElement>();

/** Découpe un texte en lignes qui tiennent dans `maxW`, sans jamais étirer le texte. */
const wrapLines = (g: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    lines.push(line);
  }
  return lines;
};

/** Dos (face -X) : titre, résumé (ou texte d'attente), auteur · éditeur · année en bas. */
export const backCoverTexture = (
  title: string,
  color: string,
  aniso: number,
  summary: string,
  author?: string,
  publisher?: string,
  year?: number,
  scale = 1,
): THREE.CanvasTexture => {
  const W = 512;
  const H = 768;
  const M = 56;
  const c = document.createElement('canvas');
  c.width = W * scale;
  c.height = H * scale;
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  const light = isLight(color);
  const ink = light ? 'rgba(15,15,25,0.95)' : 'rgba(255,252,245,0.97)';
  const muted = light ? 'rgba(15,15,25,0.7)' : 'rgba(255,252,245,0.75)';
  const soft = light ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.22)';
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = soft;
  g.lineWidth = 6;
  g.strokeRect(36, 36, W - 72, H - 72);
  g.textAlign = 'center';
  g.fillStyle = ink;
  g.font = 'bold 34px Georgia, serif';
  g.textBaseline = 'alphabetic';
  const titleLines = wrapLines(g, title, W - 2 * M).slice(0, 2);
  let y = M + 44;
  for (const l of titleLines) {
    g.fillText(l, W / 2, y, W - 2 * M);
    y += 40;
  }
  y += 14;
  g.fillStyle = soft;
  g.fillRect(W / 2 - 40, y, 80, 3);
  y += 36;
  g.fillStyle = ink;
  const body = (summary || '').trim() || 'Pas encore de résumé.';
  g.font = '23px Georgia, serif';
  g.textAlign = 'left';
  const bodyLines = wrapLines(g, body, W - 2 * M);
  const lineH = 32;
  const maxLines = Math.floor((H - M - 70 - y) / lineH);
  for (const l of bodyLines.slice(0, maxLines)) {
    g.fillText(l, M, y, W - 2 * M);
    y += lineH;
  }
  const meta = [author, publisher, year ? String(year) : null].filter(Boolean).join(' · ');
  if (meta) {
    g.font = 'italic 19px Georgia, serif';
    g.textAlign = 'center';
    g.fillStyle = muted;
    wrapLines(g, meta, W - 2 * M)
      .slice(0, 2)
      .forEach((l, i) => g.fillText(l, W / 2, H - M - 36 + i * 24, W - 2 * M));
  }
  return toTexture(c, aniso);
};

const bookMat = (opts: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    roughness: 0.75,
    flatShading: true,
    envMapIntensity: 0.4,
    ...opts,
  });

/** Faces : +X couverture, -X dos (titre + résumé), +Y tête, -Y pied, +Z tranche, -Z gouttière. */
export const makeBookRig = (b: Book, aniso: number): BookRig => {
  const edge = new THREE.Color(b.color).multiplyScalar(0.92);
  const front = bookMat({ color: b.color });
  const back = bookMat({ color: b.color });
  const edgeColor = bookMat({ color: edge });
  const pages = bookMat({ color: 0xf3ead6, roughness: 1, envMapIntensity: 0.3 });
  const spine = bookMat({ map: spineTexture(b.title, b.color, aniso, b.t, b.h, b.spineColor) });
  const mesh: BookMesh = new THREE.Mesh(new THREE.BoxGeometry(b.t, b.h, b.d), [
    front,
    back,
    pages,
    edgeColor,
    spine,
    pages,
  ]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.id = b.id;
  mesh.position.set(0, 8, 0);
  return {
    id: b.id,
    mesh,
    target: new THREE.Vector3(0, 8, 0),
    quat: new THREE.Quaternion(),
    r: null,
    flat: false,
    faces: { cover: false, back: false },
  };
};

/** Dessine la couverture si elle ne l'est pas encore (livre couché, voisin du livre sorti…). */
export const ensureCover = (rig: BookRig, b: Book, aniso: number): void => {
  if (rig.faces.cover) return;
  const front = rig.mesh.material[0]!;
  rig.faces.cover = true;
  front.color.set(0xffffff);
  front.map = coverTexture(b.title, b.color, aniso, b.cover, b.author, 1, b.kind);
  front.needsUpdate = true;
};

/** Titre, couleur, résumé ou métadonnées modifiés : régénère couverture, dos et tranche. */
export const updateBookTextures = (rig: BookRig, b: Book, aniso: number): void => {
  const [front, back, , edgeColor, spine] = rig.mesh.material;
  if (rig.faces.cover) {
    front!.map?.dispose();
    front!.map = coverTexture(b.title, b.color, aniso, b.cover, b.author, 1, b.kind);
  } else front!.color.set(b.color);
  front!.needsUpdate = true;
  if (rig.faces.back) {
    back!.map?.dispose();
    back!.map = backCoverTexture(b.title, b.color, aniso, b.summary, b.author, b.publisher, b.year);
  } else back!.color.set(b.color);
  back!.needsUpdate = true;
  spine!.map?.dispose();
  spine!.map = spineTexture(b.title, b.color, aniso, b.t, b.h, b.spineColor);
  spine!.needsUpdate = true;
  applySpineTurn(rig);
  edgeColor!.color.set(b.color).multiplyScalar(0.92);
};

/** Redessine couverture et dos à `scale` fois la résolution : ×2 pour le livre sorti, qui occupe
 * l'écran et dont le texte doit rester net, ×1 une fois rangé (200 livres en mémoire graphique). */
export const setBookResolution = (rig: BookRig, b: Book, aniso: number, scale: number): void => {
  const [front, back] = rig.mesh.material;
  rig.faces = { cover: true, back: true };
  front!.color.set(0xffffff);
  back!.color.set(0xffffff);
  front!.map?.dispose();
  front!.map = coverTexture(b.title, b.color, aniso, b.cover, b.author, scale, b.kind);
  front!.needsUpdate = true;
  back!.map?.dispose();
  back!.map = backCoverTexture(
    b.title,
    b.color,
    aniso,
    b.summary,
    b.author,
    b.publisher,
    b.year,
    scale,
  );
  back!.needsUpdate = true;
};

export const disposeBookRig = (rig: BookRig): void => {
  rig.mesh.geometry.dispose();
  for (const m of rig.mesh.material) {
    m.map?.dispose();
    m.dispose();
  }
};

/**
 * Repère de rangement d'une caisse selon son orientation.
 * U = axe local qui pointe vers le haut du monde, R = axe de la rangée, F = direction de la tranche.
 */
export type CrateFrame = {
  U: THREE.Vector3;
  R: THREE.Vector3;
  F: THREE.Vector3;
  mode: 'stand' | 'flat';
  innerU: number;
  innerR: number;
  innerF: number;
  front: boolean;
  floor: number;
  /** Les livres plus profonds que la caisse sont admis (ils dépassent devant). */
  overhang: boolean;
};

/** null : ouverture vers le sol. Une caisse transparente range aussi, sans parois ni montants. */
export const crateFrame = (c: Crate, tallest = MAX_BOOK_H): CrateFrame | null => {
  const s = crateDims(c);
  const wall = c.size === 'X' ? 0 : T;
  const qi = quatOf(c).clone().invert();
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(qi);
  down.set(Math.round(down.x), Math.round(down.y), Math.round(down.z));
  const ext = (v: THREE.Vector3): number =>
    Math.abs(v.x) * s.w + Math.abs(v.y) * s.h + Math.abs(v.z) * s.d;
  if (down.z > 0.5) return null;
  const Z = new THREE.Vector3(0, 0, 1);
  let U: THREE.Vector3;
  let R: THREE.Vector3;
  let F: THREE.Vector3;
  let mode: 'stand' | 'flat';
  let innerU: number;
  let front: boolean;
  if (down.z < -0.5) {
    // ouverture en haut : livres debout, hauteur le long de Z
    U = Z.clone();
    R = s.w >= s.h ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    F = new THREE.Vector3().crossVectors(R, U);
    mode = 'stand';
    innerU = Infinity;
    front = false;
  } else {
    // ouverture sur un côté : livres face à l'ouverture
    U = down.clone().negate();
    F = Z.clone();
    R = new THREE.Vector3().crossVectors(U, F);
    innerU = ext(U) - 2 * wall;
    // debout tant que le plus grand livre de la caisse passe sous le plafond, sinon à plat
    mode = c.flat || innerU < tallest + 0.05 ? 'flat' : 'stand';
    front = true;
  }
  // on ne retire que les parois et une petite marge
  const innerR = ext(R) - 2 * wall - 0.02;
  const innerF = ext(F) - wall;
  return {
    U,
    R,
    F,
    mode,
    innerU,
    innerR,
    innerF,
    front,
    floor: -ext(U) / 2 + wall,
    overhang: !!c.overhang && front,
  };
};

const _basis = new THREE.Matrix4();

/** Quaternion local du livre : axes du livre (X épaisseur, Y hauteur, Z tranche) → axes (a, b, c). */
export const bookQuat = (
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): THREE.Quaternion => {
  const x = a.clone();
  if (new THREE.Vector3().crossVectors(x, b).dot(c) < 0) x.negate();
  _basis.makeBasis(x, b, c);
  return new THREE.Quaternion().setFromRotationMatrix(_basis);
};

export type FillState = {
  cur: number;
  pile: number;
  pileH: number;
  /** Plus grand livre de la caisse : les piles se calent sur son côté gauche. */
  widest: number;
};

export const newFillState = (fr: CrateFrame | null, widest = 0): FillState => ({
  cur: fr ? -fr.innerR / 2 : 0,
  pile: 0,
  pileH: 0,
  widest,
});

/** Place un livre dans une caisse : renvoie [r, u] ou null si elle est pleine. */
export const placeInCrate = (fr: CrateFrame, st: FillState, b: Book): [number, number] | null => {
  // le livre doit tenir dans la caisse : profondeur toujours ; debout, sa hauteur sous le plafond ;
  // à plat, sa hauteur (couché, elle court le long de la rangée) dans la largeur d'une pile
  if (b.d > fr.innerF + 1e-3 && !fr.overhang) return null;
  if (fr.mode === 'stand') {
    if (b.h > fr.innerU + 1e-3) return null;
    if (st.cur + b.t > fr.innerR / 2 + 1e-3) return null;
    const r = st.cur + b.t / 2;
    // jour réduit pour les revues fines, sinon une rangée de magazines ne tient pas
    st.cur += b.t + Math.min(0.035, b.t / 2);
    return [r, fr.floor + b.h / 2];
  }
  // à plat : piles côte à côte le long de R
  const n = Math.max(1, Math.floor(fr.innerR / (MAX_BOOK_H + 0.05)));
  if (b.h > fr.innerR / n + 1e-3) return null;
  while (st.pile < n) {
    if (st.pileH + b.t <= fr.innerU - 0.02) {
      // la pile est calée contre le côté gauche, sur la largeur de son plus grand livre : lui part du
      // bord, les plus petits sont centrés dessus
      const r = -fr.innerR / 2 + (fr.innerR / n) * st.pile + Math.max(st.widest, b.h) / 2;
      const u = fr.floor + st.pileH + b.t / 2;
      st.pileH += b.t;
      return [r, u];
    }
    st.pile++;
    st.pileH = 0;
  }
  return null;
};
