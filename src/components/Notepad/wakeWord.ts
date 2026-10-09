/** Façons dont la reconnaissance vocale écrit « Claude » (elle hésite sur ce prénom). */
const WAKE = /\b(?:claude|clode|clod|cloud|clôde)\b[\s,;:.!?-]*/gi;

/**
 * Cherche « Claude » dans ce qui vient d'être entendu. Renvoie ce qui suit le dernier « Claude » (chaîne vide
 * si le mot est seul, la question arrive ensuite), ou null si le mot n'a pas été prononcé.
 */
export const afterWakeWord = (heard: string): string | null => {
  let rest: string | null = null;
  for (const m of heard.matchAll(WAKE)) rest = heard.slice(m.index + m[0].length).trim();
  return rest;
};
