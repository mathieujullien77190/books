import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeBook } from '@/test/fixtures';

import { BookRigs } from './bookRigs';
import type { BookRig } from './books';

const mocks = vi.hoisted(() => ({
  makeBookRig: vi.fn(),
  disposeBookRig: vi.fn(),
  updateBookTextures: vi.fn(),
}));
vi.mock('./books', () => mocks);

const fakeRig = (id: string): BookRig =>
  ({
    id,
    mesh: new THREE.Mesh(),
    target: new THREE.Vector3(1, 2, 3),
    quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1),
  }) as unknown as BookRig;

beforeEach(() => {
  mocks.makeBookRig.mockReset().mockImplementation((b: { id: string }) => fakeRig(b.id));
  mocks.disposeBookRig.mockReset();
  mocks.updateBookTextures.mockReset();
});

describe('BookRigs', () => {
  it('crée le rig à la demande, l’ajoute au groupe et le réutilise ensuite', () => {
    const rigs = new BookRigs(4, vi.fn());
    const b = makeBook({ id: 'a' });
    const rig = rigs.ensure(b);
    expect(mocks.makeBookRig).toHaveBeenCalledWith(b, 4);
    expect(rigs.group.children).toEqual([rig.mesh]);
    expect(rigs.rigs.get('a')).toBe(rig);
    expect(rigs.ensure(b)).toBe(rig);
    expect(mocks.makeBookRig).toHaveBeenCalledTimes(1);
  });

  it('retire un rig : libère ses ressources, le sort de la scène et prévient le moteur', () => {
    const onRemove = vi.fn();
    const rigs = new BookRigs(1, onRemove);
    const rig = rigs.ensure(makeBook({ id: 'a' }));
    rigs.remove('a');
    expect(mocks.disposeBookRig).toHaveBeenCalledWith(rig);
    expect(rigs.group.children).toHaveLength(0);
    expect(rigs.rigs.has('a')).toBe(false);
    expect(onRemove).toHaveBeenCalledWith(rig);
  });

  it('ne fait rien pour un livre sans rig', () => {
    const onRemove = vi.fn();
    new BookRigs(1, onRemove).remove('zzz');
    expect(onRemove).not.toHaveBeenCalled();
    expect(mocks.disposeBookRig).not.toHaveBeenCalled();
  });

  it('sync retire les rigs des livres disparus et rafraîchit les textures des autres', () => {
    const rigs = new BookRigs(7, vi.fn());
    const a = makeBook({ id: 'a' });
    const b = makeBook({ id: 'b' });
    const ra = rigs.ensure(a);
    rigs.ensure(b);
    rigs.sync([a]);
    expect([...rigs.rigs.keys()]).toEqual(['a']);
    expect(mocks.updateBookTextures).toHaveBeenCalledTimes(1);
    expect(mocks.updateBookTextures).toHaveBeenCalledWith(ra, a, 7);
  });

  it('sync ignore un livre qui n’a pas encore de rig', () => {
    const rigs = new BookRigs(1, vi.fn());
    rigs.sync([makeBook({ id: 'neuf' })]);
    expect(mocks.updateBookTextures).not.toHaveBeenCalled();
    expect(rigs.rigs.size).toBe(0);
  });

  it('settle pose chaque livre directement sur sa cible', () => {
    const rigs = new BookRigs(1, vi.fn());
    const rig = rigs.ensure(makeBook({ id: 'a' }));
    rigs.settle();
    expect(rig.mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(rig.mesh.quaternion.angleTo(rig.quat)).toBeLessThan(1e-9);
  });

  it('dispose libère tous les rigs', () => {
    const rigs = new BookRigs(1, vi.fn());
    const a = rigs.ensure(makeBook({ id: 'a' }));
    const b = rigs.ensure(makeBook({ id: 'b' }));
    rigs.dispose();
    expect(mocks.disposeBookRig).toHaveBeenCalledWith(a);
    expect(mocks.disposeBookRig).toHaveBeenCalledWith(b);
    expect(rigs.rigs.size).toBe(0);
  });
});
