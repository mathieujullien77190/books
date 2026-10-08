import { describe, expect, it } from 'vitest';

import { GHOST_PILE, HOME_DIR, HISTORY_MAX, LITE_KEY, SYNC_DELAY } from './constants';

describe('constantes du moteur', () => {
  it('HOME_DIR est une direction unitaire de face, à peine surélevée', () => {
    expect(HOME_DIR.length()).toBeCloseTo(1);
    expect(HOME_DIR.z).toBeGreaterThan(0.9);
    expect(HOME_DIR.y).toBeGreaterThan(0);
    expect(HOME_DIR.x).toBe(0);
  });

  it('expose les réglages attendus', () => {
    expect(LITE_KEY).toBe('lite-mode');
    expect(SYNC_DELAY).toBe(800);
    expect(HISTORY_MAX).toBe(60);
    expect(GHOST_PILE).toBe(Infinity);
  });
});
