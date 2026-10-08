import { parseVolume, volumeLabel } from '@/helpers';
import type { Book } from '@/types';

/** Photo de couverture → data URL JPEG réduite (256 × 384), légère pour le localStorage. */
export const fileToCoverDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const W = 256;
      const H = 384;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d')!;
      // recadrage centré pour remplir le format de la couverture
      const scale = Math.max(W / img.width, H / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image illisible'));
    };
    img.src = url;
  });

/** Un tome de la série : possédé (id) ou manquant (sans id). */
export type SeriesItem = { id: string | null; label: string; num: number };

/** Tous les numéros possédés de la série du livre, triés ; null si le titre n'est pas une série. */
export const seriesOf = (
  book: Book,
  allBooks: Book[],
): { name: string; items: SeriesItem[]; owned: number; total: number } | null => {
  const v = parseVolume(book.title);
  if (!v) return null;
  const key = v.prefix.toLowerCase();
  const items: SeriesItem[] = [];
  const owned = new Set<number>();
  let total = 0;
  for (const b of allBooks) {
    const bv = parseVolume(b.title);
    if (!bv || bv.prefix.toLowerCase() !== key) continue;
    items.push({ id: b.id, label: volumeLabel(bv), num: bv.num });
    for (let n = bv.num; n <= bv.last; n++) owned.add(n);
    total = Math.max(total, b.seriesTotal ?? 0, bv.last);
  }
  // les tomes connus de la série mais absents de la bibliothèque sont listés comme manquants
  // (pas pour les numéros de périodique comme La Hulotte, qui n'ont pas de fin)
  if (v.mark === 'T')
    for (let n = 1; n <= total; n++)
      if (!owned.has(n)) items.push({ id: null, label: `${v.mark}${n}`, num: n });
  return { name: v.prefix, items: items.sort((a, b) => a.num - b.num), owned: owned.size, total };
};
