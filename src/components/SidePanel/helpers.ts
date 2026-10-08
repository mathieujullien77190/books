const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`;

/** « 3 livres rangés · 2 à côté (1 ne rentre pas). » */
export const statusText = (stored: number, loose: number, full: number): string => {
  let s = `${plural(stored, 'livre')} rangé${stored > 1 ? 's' : ''}`;
  if (loose) {
    s += ` · ${loose} à côté`;
    if (full) s += ` (${full} ne rentre${full > 1 ? 'nt' : ''} pas)`;
  }
  return `${s}.`;
};
