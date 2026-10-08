import type { Book, Crate } from '@/types';

/** Livre de test : cotes plausibles (1 unité = 10 cm), rangé nulle part par défaut. */
export const makeBook = (over: Partial<Book> = {}): Book => ({
  id: 'b1',
  title: 'Titre',
  color: '#336699',
  summary: '',
  h: 1.8,
  t: 0.3,
  d: 1.1,
  crate: null,
  ...over,
});

/** Caisse moyenne de test, ouverture devant (orientation identité), posée à l'origine. */
export const makeCrate = (over: Partial<Crate> = {}): Crate => ({
  id: 'c1',
  size: 'M',
  q: [0, 0, 0, 1],
  x: 0,
  z: 0,
  y: 0,
  ...over,
});
