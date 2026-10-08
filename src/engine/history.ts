/**
 * Historique d'annulation : pile d'états du domaine (caisses, livres), copiés en profondeur,
 * le plus récent en dernier. Le moteur applique lui-même l'état rendu par `pop()`.
 */
import type { SavedState } from '@/types';

import { HISTORY_MAX } from './constants';

export class History {
  private readonly stack: SavedState[] = [];

  /** Mémorise une copie de l'état courant (les plus anciens sont oubliés au-delà de la limite). */
  push(state: SavedState): void {
    this.stack.push(structuredClone(state));
    if (this.stack.length > HISTORY_MAX) this.stack.shift();
  }

  /** Dernier état mémorisé (le retire), ou undefined s'il n'y en a pas. */
  pop(): SavedState | undefined {
    return this.stack.pop();
  }

  clear(): void {
    this.stack.length = 0;
  }

  get canUndo(): boolean {
    return this.stack.length > 0;
  }
}
