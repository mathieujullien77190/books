/**
 * Persistance MongoDB : lecture de l'état au démarrage (`GET /api/state`), envoi débattu de l'état
 * complet (`POST /api/sync`), révision `rev` contre les écritures concurrentes, jeton d'Édition et
 * migration unique de l'ancienne sauvegarde localStorage. Ne connaît ni three.js ni l'état du
 * moteur : celui-ci lui parle par `PersistenceHost`.
 *
 * Invariant : tant que l'état Mongo n'est pas lu (`hydrated` faux), rien n'est envoyé, sinon une
 * page fraîche écraserait la base.
 */
import { EDIT_TOKEN_KEY } from '@/constants';
import { clearLegacyState, loadLegacyState } from '@/helpers';
import type { Book, Crate, DecorState, SavedState } from '@/types';

import { SYNC_DELAY } from './constants';
import { defaultCrates } from './cratePlacement';

/** Ce qui est écrit en base. */
export type PersistedState = { crates: Crate[]; books: Book[]; decor: DecorState };

/** Ce que la persistance demande au moteur. */
export type PersistenceHost = {
  isDisposed: () => boolean;
  /** État courant à envoyer. */
  getState: () => PersistedState;
  /** Remplace l'état local par celui de la base (ou la migration), sans l'envoyer en retour. */
  load: (state: SavedState, decor: DecorState) => void;
  /** Étape du chargement initial, pour la barre d'avancement (ignorée une fois le chargement fini). */
  progress: (label: string, value: number) => void;
  /** La base n'a pas pu être lue (réponse en erreur ou injoignable). */
  failed: () => void;
  /** Chargement réussi : le moteur recadre la vue (premier chargement) et refait le tas des manquants. */
  loaded: (first: boolean) => void;
  /** Chargement terminé (ou impossible) : l'interface retire l'indicateur. */
  endLoading: () => void;
};

/** Jeton d'Édition gardé par le navigateur : le serveur refuse l'écriture sans lui. */
export const readEditToken = (): string | null => {
  try {
    return localStorage.getItem(EDIT_TOKEN_KEY);
  } catch {
    return null;
  }
};

export class Persistence {
  /** État MongoDB lu : avant ça, envoyer l'état local écraserait la base (sync = remplacement total). */
  hydrated = false;
  /** Révision de la base sur laquelle repose l'état affiché (voir /api/sync). */
  private rev = 0;
  /** Dernier état envoyé : ouvrir un livre ou sélectionner une caisse ne réécrit pas la base. */
  private lastSent = '';
  private syncTimer = 0;

  constructor(private readonly host: PersistenceHost) {}

  private payload(): string {
    return JSON.stringify(this.host.getState());
  }

  /**
   * Charge l'état depuis MongoDB, seule sauvegarde. Base vide : on y migre une fois l'ancienne
   * sauvegarde localStorage (ou les caisses par défaut), puis on efface cette copie locale.
   */
  async hydrate(first = true): Promise<void> {
    const host = this.host;
    try {
      host.progress('Lecture de la base de données…', 0.1);
      const res = await fetch('/api/state', { cache: 'no-store' });
      const data = (await res.json()) as {
        ok: boolean;
        rev?: number;
        crates?: Crate[];
        books?: Book[];
        decor?: Partial<DecorState>;
      };
      if (host.isDisposed()) return;
      if (!data.ok) {
        host.failed();
        return host.endLoading();
      }
      host.progress('Construction des caisses et des livres…', 0.45);
      // l'indicateur de chargement doit être peint avant le gros travail (dessin de toutes les tranches)
      if (first)
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
      if (host.isDisposed()) return;
      this.hydrated = false; // pas de renvoi de l'état qu'on est en train de charger
      const legacy = data.crates?.length ? null : loadLegacyState();
      const dm = data.decor?.mesange;
      // tout d’un bloc : caisses et livres apparaissent d'un coup, à leur place, sans animation de rangement
      host.load(
        data.crates?.length
          ? { crates: data.crates, books: data.books ?? [], messy: false }
          : (legacy ?? { crates: defaultCrates(), books: [], messy: false }),
        { mesange: { dx: dm?.dx ?? 0, dy: dm?.dy ?? 0, dz: dm?.dz ?? 0 } },
      );
      this.rev = data.rev ?? 0;
      this.lastSent = data.crates?.length ? this.payload() : '';
      this.hydrated = true;
      if (data.crates?.length || (await this.push())) clearLegacyState();
      host.loaded(first);
      host.endLoading();
    } catch {
      // base injoignable : rien n'est envoyé, pour ne jamais écraser la base avec un état vide
      host.failed();
      host.endLoading();
    }
  }

  /** Envoie l'état complet à MongoDB ; refusé si la base a changé ailleurs → on la recharge. */
  async push(): Promise<boolean> {
    const state = this.host.getState();
    const body = JSON.stringify(state);
    if (body === this.lastSent) return true;
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rev: this.rev, token: readEditToken(), ...state }),
      });
      const data = (await res.json()) as { ok: boolean; rev?: number; reason?: string };
      if (data.ok) {
        this.rev = data.rev ?? this.rev + 1;
        this.lastSent = body;
      } else if (data.reason === 'conflict') void this.hydrate(false);
      return data.ok;
    } catch {
      return false;
    }
  }

  /** Planifie l'envoi (débattu) ; sans effet tant que la base n'est pas lue. */
  save(): void {
    if (!this.hydrated) return;
    window.clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => void this.push(), SYNC_DELAY);
  }
}
