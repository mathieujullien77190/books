import type * as THREE from 'three';
import { vi } from 'vitest';

import type { Book, Crate, DecorState } from '@/types';

import { installFakeCanvas, installFakeImage } from './fakeCanvas';
import { stubLocalStorage } from './browser';

type Spied = ReturnType<typeof vi.fn>;
type Handler = (e: unknown) => void;

/** Réponse de GET /api/state. */
export type ServerState = {
  ok: boolean;
  rev?: number;
  crates?: Crate[];
  books?: Book[];
  decor?: Partial<DecorState>;
};

export type Harness = {
  /** Gestionnaires posés sur le canevas par la saisie. */
  canvasHandlers: Map<string, Handler>;
  windowHandlers: Map<string, Handler>;
  canvas: HTMLCanvasElement & { style: { cursor: string }; setPointerCapture: Spied };
  fetchMock: Spied;
  /** État que renverra GET /api/state. */
  server: { state: ServerState; sync: { ok: boolean; rev?: number; reason?: string } };
  syncBodies: () => Record<string, unknown>[];
  localStorage: ReturnType<typeof stubLocalStorage>;
};

/**
 * Environnement navigateur minimal pour exercer CrateEngine sous Node : faux canevas 2D, faux
 * `fetch` (état et synchronisation), `requestAnimationFrame` sur les faux timers, `window` et
 * `document` réduits au strict nécessaire. À utiliser avec `vi.useFakeTimers()`.
 */
export const installEngineHarness = (): Harness => {
  const canvasHandlers = new Map<string, Handler>();
  const windowHandlers = new Map<string, Handler>();
  installFakeCanvas();
  installFakeImage();
  const localStorage = stubLocalStorage();

  const server: Harness['server'] = {
    state: { ok: true, rev: 1, crates: [], books: [] },
    sync: { ok: true },
  };
  const calls: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
    if (url === '/api/state') return { json: async () => server.state } as Response;
    calls.push(JSON.parse(init?.body ?? '{}'));
    return { json: async () => server.sync } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);

  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: () => void) => setTimeout(cb, 16) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.stubGlobal('window', {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
    devicePixelRatio: 1,
    addEventListener: (type: string, fn: Handler) => windowHandlers.set(type, fn),
    removeEventListener: (type: string) => windowHandlers.delete(type),
  });
  // installFakeCanvas a posé `document` ; la saisie lit aussi `activeElement`
  const doc = (globalThis as unknown as { document: Record<string, unknown> }).document;
  doc.activeElement = null;

  const canvas = {
    parentElement: { clientWidth: 800, clientHeight: 600 },
    clientWidth: 800,
    clientHeight: 600,
    style: { cursor: '' },
    addEventListener: (type: string, fn: Handler) => canvasHandlers.set(type, fn),
    removeEventListener: (type: string) => canvasHandlers.delete(type),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  } as unknown as Harness['canvas'];

  return {
    canvasHandlers,
    windowHandlers,
    canvas,
    fetchMock,
    server,
    syncBodies: () => calls,
    localStorage,
  };
};

/** Pixel de l'écran (800 × 600) sous lequel se trouve un point du monde. */
export const screenOf = (
  p: THREE.Vector3,
  camera: THREE.Camera,
): { clientX: number; clientY: number } => {
  const v = p.clone().project(camera);
  return { clientX: ((v.x + 1) / 2) * 800, clientY: ((1 - v.y) / 2) * 600 };
};
