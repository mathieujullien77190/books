import type { Book } from '@/types';

/** Minuscules sans accents : « Élégance » se retrouve en tapant « elegance ». */
const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Livres dont le titre, l'auteur ou l'éditeur contiennent tous les mots tapés. */
export const searchBooks = (books: Book[], query: string): Book[] => {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return books.filter((b) => {
    const hay = fold(`${b.title} ${b.author ?? ''} ${b.publisher ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
};
