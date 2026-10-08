import type { Book } from '@/types';

/** Minuscules sans accents : « Élégance » se retrouve en tapant « elegance ». */
const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Longueur minimale d'un mot pour tolérer une faute (« bote » trouve « Bottero »). */
const FUZZY_MIN = 4;

/**
 * Plus petit nombre de fautes (lettre en trop, manquante ou fausse) pour que `word` apparaisse
 * dans `text`, en s'arrêtant dès qu'il dépasse `max` (algorithme de Sellers).
 */
const typos = (word: string, text: string, max: number): number => {
  let prev = Array.from({ length: text.length + 1 }, () => 0);
  for (let i = 1; i <= word.length; i++) {
    const row = [i];
    for (let j = 1; j <= text.length; j++) {
      const cost = word[i - 1] === text[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j - 1]! + cost, prev[j]! + 1, row[j - 1]! + 1);
    }
    prev = row;
  }
  return Math.min(...prev) <= max ? Math.min(...prev) : max + 1;
};

/** 0 : le mot est dans le texte ; 1 : à une faute près ; null : introuvable. */
const wordScore = (word: string, hay: string): 0 | 1 | null => {
  if (hay.includes(word)) return 0;
  if (word.length < FUZZY_MIN) return null;
  return hay.split(/[^a-z0-9]+/).some((t) => t && typos(word, t, 1) <= 1) ? 1 : null;
};

/**
 * Livres dont le titre, l'auteur ou l'éditeur contiennent tous les mots tapés, sans tenir compte
 * des accents ni d'une faute de frappe ; les correspondances exactes passent avant les approchées.
 */
export const searchBooks = (books: Book[], query: string): Book[] => {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const scored: { book: Book; score: number }[] = [];
  for (const book of books) {
    const hay = fold(`${book.title} ${book.author ?? ''} ${book.publisher ?? ''}`);
    let score = 0;
    let ok = true;
    for (const w of words) {
      const s = wordScore(w, hay);
      if (s === null) {
        ok = false;
        break;
      }
      score += s;
    }
    if (ok) scored.push({ book, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((x) => x.book);
};
