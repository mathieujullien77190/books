import { describe, expect, it } from 'vitest';

import { afterWakeWord } from './wakeWord';

describe('afterWakeWord', () => {
  it('renvoie ce qui suit « Claude »', () => {
    expect(afterWakeWord('Claude où est La Hulotte numéro 8 ?')).toBe(
      'où est La Hulotte numéro 8 ?',
    );
  });

  it('renvoie une chaîne vide quand le mot est seul', () => {
    expect(afterWakeWord('Claude')).toBe('');
    expect(afterWakeWord('claude, ')).toBe('');
  });

  it('ne tient pas compte de la casse ni de la ponctuation qui suit', () => {
    expect(afterWakeWord('CLAUDE, combien de livres ?')).toBe('combien de livres ?');
  });

  it('accepte les variantes que la reconnaissance écrit souvent', () => {
    expect(afterWakeWord('clode quels livres de Hobb ?')).toBe('quels livres de Hobb ?');
  });

  it('prend le dernier « Claude » quand il y en a plusieurs', () => {
    expect(afterWakeWord('Claude bonjour Claude où est Dune ?')).toBe('où est Dune ?');
  });

  it('ne déclenche pas sur un mot qui contient « claude »', () => {
    expect(afterWakeWord('Claudette habite ici')).toBeNull();
  });

  it('renvoie null sans le mot', () => {
    expect(afterWakeWord('où est La Hulotte ?')).toBeNull();
    expect(afterWakeWord('')).toBeNull();
  });
});
