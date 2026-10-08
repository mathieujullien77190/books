/**
 * État du chargement initial : l'indicateur de l'interface reste affiché (`pending`) jusqu'à ce que
 * la base soit lue et que la scène ait été rendue une première fois à l'abri de cet indicateur.
 */
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
  /** Premier rendu déjà fait derrière l'indicateur de chargement. */
  private warmed = false;

  constructor(private readonly host: LoadStateHost) {}

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
    h.stage.warmUp(h.isDisposed, () => {
      this.pending = false;
      h.emit();
      h.shown();
    });
  }
}
