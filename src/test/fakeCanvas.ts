import { vi } from 'vitest';

/** Appel enregistré sur le faux contexte 2D, avec l'état de dessin au moment de l'appel. */
export type Call = {
  fn: string;
  args: unknown[];
  font: string;
  fillStyle: unknown;
  textAlign: string;
};

/**
 * Faux contexte 2D : enregistre chaque appel de dessin. `measureText` suppose une chasse fixe
 * (largeur = nombre de caractères × taille de police × 0,5) : les retours à la ligne et les
 * réductions de police deviennent déterministes.
 */
export class FakeContext {
  calls: Call[] = [];
  fillStyle: unknown = '#000';
  strokeStyle: unknown = '#000';
  lineWidth = 1;
  font = '10px sans-serif';
  textAlign = 'start';
  textBaseline = 'alphabetic';

  private rec(fn: string, args: unknown[]): void {
    this.calls.push({
      fn,
      args,
      font: this.font,
      fillStyle: this.fillStyle,
      textAlign: this.textAlign,
    });
  }

  scale = (...a: unknown[]): void => this.rec('scale', a);
  fillRect = (...a: unknown[]): void => this.rec('fillRect', a);
  strokeRect = (...a: unknown[]): void => this.rec('strokeRect', a);
  fillText = (...a: unknown[]): void => this.rec('fillText', a);
  save = (...a: unknown[]): void => this.rec('save', a);
  restore = (...a: unknown[]): void => this.rec('restore', a);
  translate = (...a: unknown[]): void => this.rec('translate', a);
  rotate = (...a: unknown[]): void => this.rec('rotate', a);
  drawImage = (...a: unknown[]): void => this.rec('drawImage', a);
  beginPath = (...a: unknown[]): void => this.rec('beginPath', a);
  moveTo = (...a: unknown[]): void => this.rec('moveTo', a);
  lineTo = (...a: unknown[]): void => this.rec('lineTo', a);
  stroke = (...a: unknown[]): void => this.rec('stroke', a);

  measureText = (text: string): { width: number } => {
    const size = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return { width: text.length * (size ? Number(size[1]) : 10) * 0.5 };
  };

  /** Appels d'un type donné, dans l'ordre. */
  of(fn: string): Call[] {
    return this.calls.filter((c) => c.fn === fn);
  }

  /** Textes écrits, dans l'ordre. */
  texts(): string[] {
    return this.of('fillText').map((c) => c.args[0] as string);
  }
}

export class FakeCanvas {
  width = 0;
  height = 0;
  clientWidth = 800;
  clientHeight = 600;
  readonly ctx = new FakeContext();
  getContext(kind: string): FakeContext | null {
    return kind === '2d' ? this.ctx : null;
  }
}

/** Remplace `document.createElement('canvas')` ; renvoie la liste des canevas créés. */
export const installFakeCanvas = (): FakeCanvas[] => {
  const created: FakeCanvas[] = [];
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`élément inattendu : ${tag}`);
      const c = new FakeCanvas();
      created.push(c);
      return c;
    },
  });
  return created;
};

/** Faux `Image` : le test décide quand le chargement réussit ou échoue. */
export class FakeImage {
  static instances: FakeImage[] = [];
  crossOrigin: string | undefined;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  complete = false;
  naturalWidth = 0;
  src = '';
  constructor() {
    FakeImage.instances.push(this);
  }
  /** Chargement réussi (largeur naturelle non nulle par défaut). */
  load(width = 100): void {
    this.complete = true;
    this.naturalWidth = width;
    this.onload?.();
  }
  fail(): void {
    this.onerror?.();
  }
}

export const installFakeImage = (): typeof FakeImage => {
  FakeImage.instances = [];
  vi.stubGlobal('Image', FakeImage);
  return FakeImage;
};
