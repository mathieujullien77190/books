import { vi } from 'vitest';

/** `localStorage` en mémoire. `broken` : chaque accès lève (stockage indisponible). */
export const fakeLocalStorage = (broken = false): Storage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  const fail = (): never => {
    throw new Error('stockage indisponible');
  };
  return {
    data,
    get length() {
      return data.size;
    },
    clear: () => (broken ? fail() : data.clear()),
    getItem: (k: string) => (broken ? fail() : (data.get(k) ?? null)),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => (broken ? fail() : void data.delete(k)),
    setItem: (k: string, v: string) => (broken ? fail() : void data.set(k, v)),
  };
};

/** Installe `localStorage` et renvoie le faux. */
export const stubLocalStorage = (broken = false): ReturnType<typeof fakeLocalStorage> => {
  const ls = fakeLocalStorage(broken);
  vi.stubGlobal('localStorage', ls);
  return ls;
};

/** `window` = l'objet global (ses `setTimeout` suivent donc les faux timers de Vitest). */
export const stubWindow = (): void => {
  vi.stubGlobal('window', globalThis);
};
