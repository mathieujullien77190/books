import * as THREE from 'three';
import type * as TexturesModule from './bookTextures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubWindow } from '@/test/browser';
import { FakeImage, installFakeCanvas, installFakeImage, type FakeCanvas } from '@/test/fakeCanvas';

let tex: typeof TexturesModule;
let canvases: FakeCanvas[];

/** Contexte 2D du dernier canevas créé. */
const ctx = () => canvases[canvases.length - 1]!.ctx;

beforeEach(async () => {
  vi.useFakeTimers();
  stubWindow();
  canvases = installFakeCanvas();
  installFakeImage();
  // le cache des couvertures et les écouteurs sont des états de module : on repart de zéro
  vi.resetModules();
  tex = await import('./bookTextures');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('spineTexture', () => {
  it('dessine un canevas aux proportions de la tranche, à double résolution', () => {
    const t = tex.spineTexture('Titre', '#ffffff', 4, 0.3, 1.8);
    const c = canvases[0]!;
    // largeur de base = 1024 * 0,3 / 1,8
    expect(c.width).toBe(171 * 2);
    expect(c.height).toBe(2048);
    expect(ctx().calls[0]).toMatchObject({ fn: 'scale', args: [2, 2] });
    expect(ctx().of('fillRect')[0]!.args).toEqual([0, 0, 171, 1024]);
    expect(t).toBeInstanceOf(THREE.CanvasTexture);
    expect(t.anisotropy).toBe(4);
    expect(t.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(t.userData.horizontal).toBeUndefined();
  });

  it('borne la largeur entre 8 et 512', () => {
    tex.spineTexture('A', '#fff', 1, 0.001, 2);
    tex.spineTexture('A', '#fff', 1, 5, 1);
    expect(canvases[0]!.width).toBe(16);
    expect(canvases[1]!.width).toBe(1024);
  });

  it('écrit le titre à la verticale, en encre foncée sur fond clair', () => {
    tex.spineTexture('Mon livre', '#ffffff', 1, 0.3, 1.8);
    const g = ctx();
    expect(g.of('rotate')[0]!.args).toEqual([Math.PI / 2]);
    const text = g.of('fillText')[0]!;
    expect(text.args).toEqual(['Mon livre', 0, 0]);
    expect(text.fillStyle).toBe('#0b0b12');
    expect(text.font).toBe('bold 88px Georgia, serif');
    // bandeaux discrets en haut et en bas
    expect(g.of('fillRect')[1]!.args).toEqual([0, 56, 171, 16]);
    expect(g.of('fillRect')[2]!.args).toEqual([0, 1024 - 72, 171, 16]);
    expect(g.of('fillRect')[1]!.fillStyle).toBe('rgba(0,0,0,0.18)');
  });

  it('écrit en clair sur fond sombre, ou dans la couleur imposée', () => {
    tex.spineTexture('Mon livre', '#101010', 1, 0.3, 1.8);
    expect(ctx().of('fillText')[0]!.fillStyle).toBe('rgba(255,250,240,0.95)');
    expect(ctx().of('fillRect')[1]!.fillStyle).toBe('rgba(255,255,255,0.28)');
    tex.spineTexture('Mon livre', '#101010', 1, 0.3, 1.8, '#ff0000');
    expect(ctx().of('fillText')[0]!.fillStyle).toBe('#ff0000');
  });

  it('rétrécit un titre trop long, sans descendre sous 6 px', () => {
    tex.spineTexture('a'.repeat(100), '#fff', 1, 0.3, 1.8);
    // 100 caractères : 50 × taille ≤ 824 → 16 px
    expect(ctx().of('fillText')[0]!.font).toBe('bold 16px Georgia, serif');
    tex.spineTexture('a'.repeat(3000), '#fff', 1, 0.3, 1.8);
    expect(ctx().of('fillText')[0]!.font).toBe('bold 6px Georgia, serif');
  });

  it('commence petit sur une tranche très fine (taille liée à la largeur)', () => {
    tex.spineTexture('Fin', '#fff', 1, 0.001, 2);
    // largeur 8 → 4 px
    expect(ctx().of('fillText')[0]!.font).toBe('bold 4px Georgia, serif');
  });

  it("écrit droit le numéro et les lettres d'un gros volume d'une série", () => {
    const t = tex.spineTexture('Larousse 1 (A – Carl)', '#ffffff', 1, 0.3, 1.8);
    const g = ctx();
    expect(g.texts()).toEqual(['1', 'Larousse', 'A – Carl']);
    expect(g.of('rotate')).toHaveLength(0);
    expect(g.of('fillText')[0]!.font).toBe('bold 64px Georgia, serif');
    // « Larousse » doit tenir dans 171 - 24 = 147 : 36 px
    expect(g.of('fillText')[1]!.font).toBe('bold 36px Georgia, serif');
    expect(g.of('fillText')[2]!.font).toBe('bold 34px Georgia, serif');
    expect(g.of('fillText')[0]!.args[1]).toBe(171 / 2);
    expect(t.userData.horizontal).toBe(true);
  });

  it('coupe le nom aux espaces quand il ne tient pas sur une ligne', () => {
    tex.spineTexture('Encyclopedie universelle 2 (B)', '#fff', 1, 0.3, 1.8);
    const g = ctx();
    expect(g.texts()).toEqual(['2', 'Encyclopedie', 'universelle', 'B']);
    expect(g.of('fillText')[1]!.font).toBe('bold 24px Georgia, serif');
  });

  it('retombe sur la plus petite police quand un mot ne tient dans aucune taille', () => {
    const word = 'x'.repeat(30);
    tex.spineTexture(`Gros 3 (${word})`, '#fff', 1, 0.1, 1);
    const last = ctx().of('fillText').at(-1)!;
    expect(last.args[0]).toBe(word);
    expect(last.font).toBe('bold 8px Georgia, serif');
  });

  it('ne traite pas comme un volume une tranche trop étroite', () => {
    const t = tex.spineTexture('Larousse 1 (A – Carl)', '#fff', 1, 0.1, 1.8);
    expect(ctx().texts()).toEqual(['Larousse 1 (A – Carl)']);
    expect(ctx().of('rotate')).toHaveLength(1);
    expect(t.userData.horizontal).toBeUndefined();
  });
});

describe('coverTexture', () => {
  it('dessine le fond, le cadre et le titre centré', () => {
    const t = tex.coverTexture('Un titre', '#336699', 4);
    const c = canvases[0]!;
    expect([c.width, c.height]).toEqual([512, 768]);
    expect(ctx().calls[0]).toMatchObject({ fn: 'scale', args: [1, 1] });
    expect(ctx().of('fillRect')[0]!.args).toEqual([0, 0, 512, 768]);
    expect(ctx().of('strokeRect')[0]!.args).toEqual([36, 36, 440, 696]);
    const title = ctx().of('fillText')[0]!;
    expect(title.args).toEqual(['Un titre', 256, 344]);
    expect(title.font).toBe('bold 64px Georgia, serif');
    expect(title.fillStyle).toBe('rgba(255,250,240,0.94)');
    expect(t.anisotropy).toBe(4);
  });

  it('écrit en encre foncée sur fond clair', () => {
    tex.coverTexture('Clair', '#ffffff', 1);
    expect(ctx().of('fillText')[0]!.fillStyle).toBe('rgba(20,20,30,0.88)');
  });

  it("agrandit le canevas à l'échelle demandée", () => {
    tex.coverTexture('Titre', '#336699', 1, undefined, undefined, 2);
    expect([canvases[0]!.width, canvases[0]!.height]).toEqual([1024, 1536]);
    expect(ctx().calls[0]).toMatchObject({ fn: 'scale', args: [2, 2] });
  });

  it("ajoute l'auteur en haut et le type (en minuscules) en bas", () => {
    tex.coverTexture('Titre', '#336699', 1, undefined, 'Jane Auteur', 1, 'bd');
    const [, kind, author] = ctx().of('fillText');
    expect(kind!.args).toEqual(['bd', 256, 658]);
    expect(kind!.font).toBe('italic 26px Georgia, serif');
    expect(author!.args).toEqual(['Jane Auteur', 256, 92, 382]);
    expect(author!.font).toBe('27px Georgia, serif');
  });

  it("n'imprime pas le type « autre », ni un type absent ou inconnu", () => {
    tex.coverTexture('T', '#336699', 1, undefined, undefined, 1, 'autre');
    tex.coverTexture('T', '#336699', 1);
    tex.coverTexture('T', '#336699', 1, undefined, undefined, 1, 'inconnu' as never);
    for (const c of canvases) expect(c.ctx.texts()).toEqual(['T']);
  });

  it('coupe un long titre en lignes et réduit la police pour tenir en 5 lignes', () => {
    tex.coverTexture(Array(30).fill('mot').join(' '), '#336699', 1);
    const lines = ctx().of('fillText');
    expect(lines).toHaveLength(5);
    expect(lines[0]!.font).toBe('bold 32px Georgia, serif');
  });

  it('ne réduit pas la police sous 28 px', () => {
    tex.coverTexture('x'.repeat(100), '#336699', 1);
    expect(ctx().of('fillText')[0]!.font).toBe('bold 28px Georgia, serif');
  });

  describe('image de couverture', () => {
    const lastImage = (): FakeImage => FakeImage.instances.at(-1)!;

    it("n'ouvre aucune image sans couverture", () => {
      tex.coverTexture('T', '#336699', 1);
      expect(FakeImage.instances).toHaveLength(0);
    });

    it("charge l'image à la demande, la dessine par-dessus et prévient les écouteurs", () => {
      const ready = vi.fn();
      tex.onTextureReady(ready);
      const t = tex.coverTexture('T', '#336699', 1, '/covers/a.webp');
      const img = lastImage();
      expect(img.src).toBe('/covers/a.webp');
      expect(img.crossOrigin).toBe('anonymous');
      const before = t.version;
      img.load();
      expect(ctx().of('drawImage')[0]!.args).toEqual([img, 0, 0, 512, 768]);
      expect(t.version).toBeGreaterThan(before);
      expect(ready).toHaveBeenCalledTimes(1);
    });

    it('réutilise une image déjà chargée sans la redemander', () => {
      tex.coverTexture('T', '#336699', 1, '/covers/a.webp');
      lastImage().load();
      tex.coverTexture('T', '#336699', 1, '/covers/a.webp');
      expect(FakeImage.instances).toHaveLength(1);
      expect(ctx().of('drawImage')).toHaveLength(1);
    });

    it('redemande une image mise en cache mais vide', () => {
      tex.coverTexture('T', '#336699', 1, '/covers/b.webp');
      lastImage().load(0);
      tex.coverTexture('T', '#336699', 1, '/covers/b.webp');
      expect(FakeImage.instances).toHaveLength(2);
    });

    it('retente trois fois avec un délai croissant puis abandonne', () => {
      tex.coverTexture('T', '#336699', 1, '/covers/c.webp');
      lastImage().fail();
      vi.advanceTimersByTime(599);
      expect(FakeImage.instances).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(lastImage().src).toBe('/covers/c.webp?retry=1');
      lastImage().fail();
      vi.advanceTimersByTime(1200);
      expect(lastImage().src).toBe('/covers/c.webp?retry=2');
      lastImage().fail();
      vi.advanceTimersByTime(1800);
      expect(lastImage().src).toBe('/covers/c.webp?retry=3');
      lastImage().fail();
      vi.advanceTimersByTime(60_000);
      expect(FakeImage.instances).toHaveLength(4);
    });

    it('une tentative réussie après un échec dessine bien la couverture', () => {
      tex.coverTexture('T', '#336699', 1, '/covers/d.webp');
      lastImage().fail();
      vi.advanceTimersByTime(600);
      lastImage().load();
      expect(ctx().of('drawImage')).toHaveLength(1);
    });

    it('traite une image « data: » sans origine croisée ni paramètre de reprise', () => {
      const data = 'data:image/png;base64,AAAA';
      tex.coverTexture('T', '#336699', 1, data);
      const first = lastImage();
      expect(first.crossOrigin).toBeUndefined();
      first.fail();
      vi.advanceTimersByTime(600);
      expect(lastImage()).not.toBe(first);
      expect(lastImage().src).toBe(data);
    });
  });
});

describe('onTextureReady', () => {
  it('se désabonne avec la fonction renvoyée', () => {
    const fn = vi.fn();
    const off = tex.onTextureReady(fn);
    tex.coverTexture('T', '#336699', 1, '/covers/e.webp');
    off();
    FakeImage.instances[0]!.load();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('backCoverTexture', () => {
  it('écrit le titre, le résumé et les mentions du bas', () => {
    const t = tex.backCoverTexture(
      'Mon titre',
      '#336699',
      2,
      'Un résumé court.',
      'Auteur',
      'Éditeur',
      1999,
    );
    expect([canvases[0]!.width, canvases[0]!.height]).toEqual([512, 768]);
    expect(ctx().texts()).toEqual(['Mon titre', 'Un résumé court.', 'Auteur · Éditeur · 1999']);
    const [title, summary, meta] = ctx().of('fillText');
    expect(title!.font).toBe('bold 34px Georgia, serif');
    expect(title!.textAlign).toBe('center');
    expect(summary!.font).toBe('23px Georgia, serif');
    expect(summary!.textAlign).toBe('left');
    expect(summary!.args.slice(1)).toEqual([56, 190, 400]);
    expect(meta!.font).toBe('italic 19px Georgia, serif');
    expect(t.anisotropy).toBe(2);
  });

  it("met un texte d'attente quand le résumé est vide", () => {
    tex.backCoverTexture('T', '#336699', 1, '  ');
    expect(ctx().texts()).toEqual(['T', 'Pas encore de résumé.']);
    tex.backCoverTexture('T', '#336699', 1, undefined as never);
    expect(ctx().texts()).toEqual(['T', 'Pas encore de résumé.']);
  });

  it("n'écrit que les mentions connues, et pas d'année nulle", () => {
    tex.backCoverTexture('T', '#336699', 1, 'r', undefined, 'Éditeur', 0);
    expect(ctx().texts()).toEqual(['T', 'r', 'Éditeur']);
  });

  it('garde au plus deux lignes de titre et respecte les retours à la ligne du résumé', () => {
    tex.backCoverTexture(
      'un deux trois quatre cinq six sept huit neuf dix onze douze',
      '#336699',
      1,
      'a\n\nb',
    );
    const texts = ctx().texts();
    // 34 px : 17 px par caractère → 23 caractères par ligne de 400 ; deux lignes de titre au plus
    expect(texts.slice(0, 2)).toEqual(['un deux trois quatre', 'cinq six sept huit neuf']);
    expect(texts.slice(2)).toEqual(['a', '', 'b']);
  });

  it('limite le résumé à la place disponible', () => {
    tex.backCoverTexture('T', '#336699', 1, Array(400).fill('mot').join(' '));
    const body = ctx()
      .of('fillText')
      .filter((c) => c.textAlign === 'left');
    expect(body).toHaveLength(14);
  });

  it('coupe les mentions du bas sur deux lignes au plus', () => {
    tex.backCoverTexture(
      'T',
      '#336699',
      1,
      'r',
      'Un auteur au nom vraiment très long',
      'Une maison d’édition très très longue aussi',
      2001,
    );
    const meta = ctx()
      .of('fillText')
      .filter((c) => c.font.startsWith('italic'));
    expect(meta.length).toBeLessThanOrEqual(2);
    expect(meta.length).toBeGreaterThan(1);
    expect(meta[1]!.args[2]).toBe(768 - 56 - 36 + 24);
  });

  it('adapte les encres au fond clair', () => {
    tex.backCoverTexture('T', '#ffffff', 1, 'r', 'A');
    const [title, , meta] = ctx().of('fillText');
    expect(title!.fillStyle).toBe('rgba(15,15,25,0.95)');
    expect(meta!.fillStyle).toBe('rgba(15,15,25,0.7)');
  });
});
