import { describe, expect, it } from 'vitest';

import * as books from './books';

describe('books (point d’entrée)', () => {
  it('réexporte le repère de rangement, le rig et les textures des livres', () => {
    for (const name of [
      'crateFrame',
      'bookQuat',
      'newFillState',
      'placeInCrate',
      'makeBookRig',
      'applyLiteMode',
      'ensureCover',
      'setSpineFlat',
      'updateBookTextures',
      'setBookResolution',
      'disposeBookRig',
      'setLiteBooks',
      'spineTexture',
      'coverTexture',
      'backCoverTexture',
      'onTextureReady',
    ] as const)
      expect(typeof books[name], name).toBe('function');
  });
});
