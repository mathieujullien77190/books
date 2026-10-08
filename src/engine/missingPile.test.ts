import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeBook } from '@/test/fixtures';
import type { Book } from '@/types';

import { HOME_DIR } from './constants';
import { crateBounds } from './cratePlacement';
import { MissingPile } from './missingPile';
import { makeCrate } from '@/test/fixtures';

const mocks = vi.hoisted(() => ({ buildGhostBook: vi.fn(), buildNote: vi.fn() }));
vi.mock('./ghosts', () => mocks);

/** Livre manquant factice : un pavé d'épaisseur `t`, contenu dans un groupe pour tester la remontée du rayon. */
beforeEach(() => {
  mocks.buildGhostBook.mockReset().mockImplementation((m: { label: string; maxT: number }) => {
    const holder = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(m.maxT, 1, 1),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    box.name = m.label;
    holder.add(box);
    return { mesh: holder, t: m.maxT };
  });
  mocks.buildNote.mockReset().mockImplementation(() => {
    const g = new THREE.Group();
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    sheet.rotation.x = -Math.PI / 2; // à plat sur le tas
    g.add(sheet);
    return g;
  });
});

const bb = crateBounds([makeCrate()]); // minX -1,25 ; cz 0

/** Série `name` dont on possède les tomes `owned`, de hauteur h et profondeur d. */
const series = (name: string, owned: number[], h = 1.8, d = 1.1): Book[] =>
  owned.map((n) => makeBook({ id: `${name}${n}`, title: `${name} T${n}`, h, d, t: 0.3 }));

describe('MissingPile.sync', () => {
  it('ne construit rien quand il ne manque aucun tome', () => {
    const p = new MissingPile(1);
    p.sync(series('Alpha', [1, 2, 3]), bb);
    expect(p.count).toBe(0);
    expect(p.group.children).toHaveLength(0);
    expect(p.hitsNote(new THREE.Raycaster())).toBe(false);
    expect(mocks.buildNote).not.toHaveBeenCalled();
  });

  it('empile un livre par tome manquant avec le papier « Livres à acheter » dessus', () => {
    const p = new MissingPile(3);
    p.sync(series('Alpha', [1, 4]), bb);
    // T2 et T3 manquent : deux livres plus le papier
    expect(p.count).toBe(2);
    expect(p.group.children).toHaveLength(3);
    expect(mocks.buildGhostBook).toHaveBeenCalledTimes(2);
    expect(mocks.buildGhostBook.mock.calls[0]![1]).toBe(3);
    expect(mocks.buildNote).toHaveBeenCalledWith(2);
    const [first, second] = p.group.children;
    // couchés à gauche des caisses, du bas vers le haut
    expect(first!.position.x).toBeCloseTo(-1.25 - 1.9, 1);
    expect(first!.position.y).toBeCloseTo(0.15); // épaisseur 0,3 / 2
    expect(second!.position.y).toBeCloseTo(0.3 + 0.15);
    const note = p.group.children[2]!;
    expect(note.position.x).toBeCloseTo(-1.25 - 1.9);
    expect(note.position.y).toBeCloseTo(0.6 + 0.01);
    expect(note.position.z).toBeCloseTo(0);
  });

  it('range les plus grands livres en bas, puis par profondeur, puis par numéro', () => {
    const p = new MissingPile(1);
    p.sync(
      [
        ...series('Beta', [1, 3], 1.5, 1.1),
        ...series('Alpha', [1, 3], 2, 1.1),
        ...series('Gamma', [1, 3], 2, 1.1),
        ...series('Delta', [1, 3], 2, 1.2),
        ...series('Alpha', [5], 2, 1.1),
      ],
      bb,
    );
    const order = mocks.buildGhostBook.mock.calls.map((c) => (c[0] as { label: string }).label);
    expect(order).toEqual([
      'Delta T2', // le plus haut et le plus profond
      'Alpha T2',
      'Alpha T4',
      'Gamma T2',
      'Beta T2',
    ]);
  });

  it('ne reconstruit pas le tas tant que la liste et l’emprise ne changent pas', () => {
    const p = new MissingPile(1);
    const books = series('Alpha', [1, 3]);
    p.sync(books, bb);
    const first = p.group.children[0];
    p.sync(books, bb);
    expect(mocks.buildGhostBook).toHaveBeenCalledTimes(1);
    expect(p.group.children[0]).toBe(first);
  });

  it('reconstruit et libère l’ancien tas quand l’emprise des caisses change', () => {
    const p = new MissingPile(1);
    const books = series('Alpha', [1, 3]);
    p.sync(books, bb);
    const old = p.group.children[0] as THREE.Group;
    const geo = (old.children[0] as THREE.Mesh).geometry;
    const spy = vi.spyOn(geo, 'dispose');
    p.sync(books, crateBounds([makeCrate({ x: 10 })]));
    expect(spy).toHaveBeenCalled();
    expect(p.group.children).not.toContain(old);
    expect(mocks.buildGhostBook).toHaveBeenCalledTimes(2);
  });

  it('invalidate force la reconstruction à la synchronisation suivante', () => {
    const p = new MissingPile(1);
    const books = series('Alpha', [1, 3]);
    p.sync(books, bb);
    p.invalidate();
    p.sync(books, bb);
    expect(mocks.buildGhostBook).toHaveBeenCalledTimes(2);
  });

  it('retire le papier quand plus rien ne manque et arrête le défilé', () => {
    const p = new MissingPile(1);
    p.sync(series('Alpha', [1, 3]), bb);
    p.browse();
    expect(p.browsing).toBe(true);
    p.sync(series('Alpha', [1, 2, 3]), bb);
    expect(p.count).toBe(0);
    expect(p.group.children).toHaveLength(0);
    expect(p.browsing).toBe(false);
    expect(p.hitsNote(new THREE.Raycaster())).toBe(false);
  });
});

describe('MissingPile.current / browse / step / end', () => {
  const pile = (): MissingPile => {
    const p = new MissingPile(1);
    // T2, T3 et T4 manquent
    p.sync(series('Alpha', [1, 5]), bb);
    return p;
  };

  it('n’a pas de tome courant hors défilé', () => {
    const p = pile();
    expect(p.browsing).toBe(false);
    expect(p.current).toBeNull();
  });

  it('démarre sur le dernier du tas (le plus petit) avec son rang depuis le haut', () => {
    const p = pile();
    p.browse();
    expect(p.browsing).toBe(true);
    expect(p.current).toEqual({ label: 'Alpha T4', index: 1, total: 3 });
  });

  it('passe au tome suivant (vers le bas du tas) ou précédent, en boucle', () => {
    const p = pile();
    p.browse();
    p.step(1);
    expect(p.current).toEqual({ label: 'Alpha T3', index: 2, total: 3 });
    p.step(1);
    p.step(1);
    // retour en haut du tas
    expect(p.current).toEqual({ label: 'Alpha T4', index: 1, total: 3 });
    p.step(-1);
    expect(p.current?.label).toBe('Alpha T2');
  });

  it('step ne fait rien hors défilé', () => {
    const p = pile();
    p.step(1);
    expect(p.current).toBeNull();
  });

  it('show affiche un tome précis ; un rang hors du tas donne un libellé vide', () => {
    const p = pile();
    p.show(0);
    expect(p.current?.label).toBe('Alpha T2');
    p.show(99);
    expect(p.current).toEqual({ label: '', index: 3 - 99, total: 3 });
  });

  it('end arrête le défilé et oublie la cible de la caméra', () => {
    const p = pile();
    p.browse();
    p.end();
    expect(p.browsing).toBe(false);
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(1, 2, 3);
    p.updateCamera(cam, new THREE.Vector3(), 1);
    expect(cam.position.toArray()).toEqual([1, 2, 3]);
  });

  it('browse sans tome ne cadre rien (rang -1)', () => {
    const p = new MissingPile(1);
    p.browse();
    const cam = new THREE.PerspectiveCamera();
    p.updateCamera(cam, new THREE.Vector3(), 1);
    expect(cam.position.toArray()).toEqual([0, 0, 0]);
    // step refuse de tourner dans un tas vide
    p.step(1);
    expect(p.current).toEqual({ label: '', index: 1, total: 0 });
  });

  it('ignore une demande de cadrage sans rang courant', () => {
    const p = pile();
    (p as unknown as { focus: () => void }).focus();
    const cam = new THREE.PerspectiveCamera();
    p.updateCamera(cam, new THREE.Vector3(), 1);
    expect(cam.position.toArray()).toEqual([0, 0, 0]);
  });
});

describe('MissingPile.updateCamera', () => {
  it('glisse la caméra vers le tome affiché puis s’arrête à l’arrivée', () => {
    const p = new MissingPile(1);
    p.sync(series('Alpha', [1, 3]), bb);
    p.group.updateMatrixWorld(true);
    p.browse();
    const mesh = p.group.children[0]!;
    const target = mesh.getWorldPosition(new THREE.Vector3());
    const goalPos = target.clone().addScaledVector(HOME_DIR, 3.4);
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(0, 0, 20);
    const controlsTarget = new THREE.Vector3(0, 0, 0);
    p.updateCamera(cam, controlsTarget, 0.5);
    expect(cam.position.z).toBeCloseTo((20 + goalPos.z) / 2);
    expect(controlsTarget.x).toBeCloseTo(target.x / 2);
    // pas arrivé : il continue
    const mid = cam.position.clone();
    p.updateCamera(cam, controlsTarget, 0.5);
    expect(cam.position.distanceTo(goalPos)).toBeLessThan(mid.distanceTo(goalPos));
    // arrivée exacte, puis plus de mouvement même si on déplace la caméra
    p.updateCamera(cam, controlsTarget, 1);
    expect(cam.position.distanceTo(goalPos)).toBeLessThan(1e-9);
    cam.position.set(7, 7, 7);
    p.updateCamera(cam, controlsTarget, 1);
    expect(cam.position.toArray()).toEqual([7, 7, 7]);
  });
});

describe('MissingPile.hitsNote / hitIndex', () => {
  const setup = () => {
    const p = new MissingPile(1);
    p.sync(series('Alpha', [1, 4]), bb);
    p.group.updateMatrixWorld(true);
    return p;
  };
  /** Rayon vertical descendant au-dessus de (x, z). */
  const ray = (x: number, z: number): THREE.Raycaster =>
    new THREE.Raycaster(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));

  it('détecte un rayon qui touche le papier', () => {
    const p = setup();
    expect(p.hitsNote(ray(-1.25 - 1.9, 0))).toBe(true);
    expect(p.hitsNote(ray(40, 40))).toBe(false);
  });

  it('donne le rang du livre manquant touché, en remontant de l’objet touché au livre', () => {
    const p = setup();
    const x = -1.25 - 1.9;
    // la boîte du premier livre est centrée en (x, 0,15) et le papier est au-dessus : on vise de côté
    const sideRay = (y: number): THREE.Raycaster =>
      new THREE.Raycaster(new THREE.Vector3(x + 20, y, 0), new THREE.Vector3(-1, 0, 0));
    expect(p.hitIndex(sideRay(0.1))).toBe(0);
    expect(p.hitIndex(sideRay(0.45))).toBe(1);
    expect(p.hitIndex(sideRay(40))).toBe(-1);
  });

  it('renvoie -1 sans aucun livre manquant', () => {
    const p = new MissingPile(1);
    expect(p.hitIndex(ray(0, 0))).toBe(-1);
  });
});

describe('MissingPile.dispose', () => {
  it('libère le groupe', () => {
    const p = new MissingPile(1);
    p.sync(series('Alpha', [1, 3]), bb);
    const holder = p.group.children[0] as THREE.Group;
    const spy = vi.spyOn((holder.children[0] as THREE.Mesh).geometry, 'dispose');
    p.dispose();
    expect(spy).toHaveBeenCalled();
  });
});
