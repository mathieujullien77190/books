export type PanPadProps = {
  /** dx / dy valent -1, 0 ou 1 : droite et haut sont positifs. */
  onPan: (dx: number, dy: number) => void;
  /** Bouton central : recadre sur toutes les caisses. */
  onRecenter: () => void;
  className?: string;
};
