/**
 * Textures dessinées des livres (canvas) : tranche, couverture, dos. Les images de couverture sont
 * chargées à la demande (avec nouvelles tentatives) et mises en cache ; `onTextureReady` prévient
 * le moteur quand l'une d'elles arrive pour qu'il redessine.
 */
import * as THREE from 'three';

import { BOOK_KINDS } from '@/constants';
import type { BookKind } from '@/types';

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
      // une image qui échoue (réseau, rafale de requêtes) est redemandée : sans cela le livre restait
      // sans couverture jusqu'au prochain rechargement
      const load = (attempt: number): void => {
        const img = new Image();
        if (!cover.startsWith('data:')) img.crossOrigin = 'anonymous';
        img.onload = () => {
          coverImages.set(cover, img);
          g.drawImage(img, 0, 0, W, H);
          tex.needsUpdate = true;
          textureListeners.forEach((fn) => fn());
        };
        img.onerror = () => {
          if (attempt < COVER_RETRIES)
            window.setTimeout(() => load(attempt + 1), 600 * (attempt + 1));
        };
        img.src = attempt && !cover.startsWith('data:') ? `${cover}?retry=${attempt}` : cover;
      };
      load(0);
    }
  }
  return tex;
};

/** Nouvelles tentatives d'une couverture qui n'a pas pu se charger. */
const COVER_RETRIES = 3;

/** Prévenu quand une couverture finit de se charger (le moteur ne redessine que ce qui a changé). */
const textureListeners = new Set<() => void>();
export const onTextureReady = (fn: () => void): (() => void) => {
  textureListeners.add(fn);
  return () => textureListeners.delete(fn);
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
