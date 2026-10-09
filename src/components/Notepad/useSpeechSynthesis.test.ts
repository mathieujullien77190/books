import { describe, expect, it } from 'vitest';

import { plainAnswer } from './useSpeechSynthesis';

describe('plainAnswer', () => {
  it('garde le titre des liens de livres', () => {
    expect(plainAnswer('Il est dans [La Hulotte n°8](livre:gnj5ah1), caisse P2.')).toBe(
      'Il est dans La Hulotte n°8, caisse P2.',
    );
  });

  it('retire les symboles de mise en forme et les retours à la ligne', () => {
    expect(plainAnswer('**Bonjour**\n\n# Titre\n> cité `code`')).toBe('Bonjour Titre cité code');
  });

  it('renvoie une chaîne vide pour un texte vide', () => {
    expect(plainAnswer('  \n ')).toBe('');
  });
});
