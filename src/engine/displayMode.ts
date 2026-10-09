/**
 * Mode d'affichage : léger (livres en pavés d'une couleur, sans caisses, mésange ni ombres) ou
 * complet. Le choix de la personne est gardé sur l'appareil ; au démarrage on montre toujours le
 * léger d'abord, puis le complet le remplace par petits lots (`upgrade`). Parle au moteur par
 * `DisplayHost`.
 */
import type * as THREE from 'three';

import type { Id, LoadProgress } from '@/types';

import { applyLiteMode, setBookResolution, setLiteBooks, type BookRig } from './books';
import { LITE_KEY, OPEN_BOOK_SCALE } from './constants';
import type { CrateRig } from './crate';
import type { Domain } from './domain';
import type { MissingPile } from './missingPile';

export type DisplayHost = {
  isDisposed: () => boolean;
  /** Scène posée sur un autre décor : le soleil n'y projette pas d'ombres. */
  transparent: boolean;
  aniso: number;
  sun: THREE.DirectionalLight;
  missing: MissingPile;
  crateRigs: Map<Id, CrateRig>;
  bookRigs: Map<Id, BookRig>;
  domain: Domain;
  openId: () => Id | null;
  touch: () => void;
  syncGhosts: () => void;
  refresh: () => void;
  emit: () => void;
};

export class DisplayMode {
  /** Affichage en cours : léger ou complet. */
  lite = true;
  /** Choix de la personne (gardé dans localStorage) : léger ou complet. */
  choice = false;
  /** Avancement de la montée en mode complet (null au repos), montré par une barre discrète. */
  progress: LoadProgress | null = null;
  /** Numéro de la montée en mode complet en cours (0 = aucune) ; sert à l'interrompre. */
  private upgradeRun = 0;

  constructor(private readonly host: DisplayHost) {
    try {
      this.choice = localStorage.getItem(LITE_KEY) === '1';
    } catch {
      this.choice = false;
    }
    // le léger s'affiche d'abord (chargement rapide) ; le complet suit une fois la scène montrée, sauf choix léger
    setLiteBooks(true);
  }

  /** Choix de la personne : léger ou complet, gardé sur l'appareil. */
  set(on: boolean): void {
    this.choice = on;
    try {
      localStorage.setItem(LITE_KEY, on ? '1' : '0');
    } catch {
      // stockage indisponible : le choix vaut pour cette visite seulement
    }
    this.upgradeRun = 0; // interrompt une montée en mode complet en cours
    this.progress = null;
    if (this.lite !== on) this.apply(on);
    else this.host.emit();
  }

  /** Bascule l'affichage entre léger et complet, d'un bloc. */
  private apply(on: boolean): void {
    const h = this.host;
    this.lite = on;
    setLiteBooks(on);
    h.sun.castShadow = !on && !h.transparent;
    for (const rig of h.crateRigs.values()) rig.group.visible = !on;
    for (const [id, rig] of h.bookRigs) {
      const b = h.domain.books.find((x) => x.id === id);
      if (b) applyLiteMode(rig, b, h.aniso);
    }
    this.finish();
  }

  private finish(): void {
    const h = this.host;
    h.missing.invalidate();
    h.syncGhosts();
    h.refresh();
    const openId = h.openId();
    const open = openId ? h.domain.books.find((b) => b.id === openId) : undefined;
    const openRig = open && h.bookRigs.get(open.id);
    if (open && openRig) setBookResolution(openRig, open, h.aniso, OPEN_BOOK_SCALE);
  }

  /**
   * Après le premier affichage (léger), passe au complet par petits lots pour ne pas figer l'écran :
   * dos des livres, puis caisses, mésange et ombres. Sans effet si la personne a choisi le mode léger.
   */
  upgrade(): void {
    if (this.choice) return;
    const h = this.host;
    const run = ++this.upgradeRun;
    setLiteBooks(false); // les livres créés d'ici là sont déjà complets
    const queue = [...h.bookRigs.keys()];
    const total = queue.length;
    const step = (): void => {
      if (h.isDisposed() || this.upgradeRun !== run) return;
      for (const id of queue.splice(0, 12)) {
        const rig = h.bookRigs.get(id);
        const b = h.domain.books.find((x) => x.id === id);
        if (rig && b) applyLiteMode(rig, b, h.aniso);
      }
      h.touch();
      if (queue.length) {
        this.progress = {
          label: `Textures des livres : ${total - queue.length} / ${total}`,
          value: (total - queue.length) / total,
        };
        h.emit();
        window.setTimeout(step, 16);
        return;
      }
      this.upgradeRun = 0;
      this.progress = null;
      this.lite = false;
      h.sun.castShadow = !h.transparent;
      for (const rig of h.crateRigs.values()) rig.group.visible = true;
      this.finish();
    };
    window.setTimeout(step, 150);
  }
}
