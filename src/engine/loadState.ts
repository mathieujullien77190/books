/**
 * État du chargement initial : l'indicateur de l'interface reste affiché (`pending`) jusqu'à ce que
 * la base soit lue et que la scène ait été rendue une première fois à l'abri de cet indicateur.
 */
import type { LoadProgress } from '@/types';

import type { Stage } from './stage';

export type LoadStateHost = {
  stage: Stage;
  isDisposed: () => boolean;
  emit: () => void;
  /** Première image montrée : le moteur passe du mode léger au mode complet. */
  shown: () => void;
};

export class LoadState {
  /** Vrai jusqu'à la fin du premier chargement : l'interface affiche un indicateur. */
  pending = true;
  /** La base n'a pas pu être lue. */
  failed = false;
  /** Étape en cours, affichée sous la barre de chargement (null une fois fini). */
  progress: LoadProgress | null = { label: 'Lecture de la base de données…', value: 0.1 };
  /** Premier rendu déjà fait derrière l'indicateur de chargement. */
  private warmed = false;

  constructor(private readonly host: LoadStateHost) {}

  /** Nouvelle étape du chargement initial (sans effet ensuite, par exemple pour un rechargement). */
  step(label: string, value: number): void {
    if (!this.pending) return;
    this.progress = { label, value };
    this.host.emit();
  }

  /** Chargement terminé (ou impossible) : l'interface retire l'indicateur. */
  end(): void {
    const h = this.host;
    if (this.warmed) {
      this.pending = false;
      h.emit();
      return;
    }
    // premier chargement : compilation des shaders et envoi des textures au GPU pendant que
    // l'indicateur est encore affiché, sinon la scène reste vide plusieurs secondes une fois retiré
    this.warmed = true;
    this.step("Préparation de l'affichage 3D (shaders, textures)…", 0.85);
    h.stage.warmUp(h.isDisposed, () => {
      this.pending = false;
      this.progress = null;
      h.emit();
      h.shown();
    });
  }
}
