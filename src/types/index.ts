export type Id = string;

/** S, M, L : caisses en bois aux cotes fixes ; X : caisse transparente aux cotes libres. */
export type CrateSize = 'S' | 'M' | 'L' | 'X';

/** Cotes en unités scène (1 = 10 cm). */
export type Dims = { w: number; h: number; d: number };

/** Quaternion sérialisé [x, y, z, w] — orientation d'une caisse (pas de 90°). */
export type Quat = [number, number, number, number];

export type Crate = {
  id: Id;
  size: CrateSize;
  q: Quat;
  x: number;
  z: number;
  /** Base de la caisse (calculée par la gravité : sol ou caisse en dessous). */
  y: number;
  /** Cotes propres, seulement pour une caisse transparente (size 'X'). */
  dims?: Dims;
  /** Livres rangés à plat (en piles) plutôt que debout, quand l'ouverture est devant. */
  flat?: boolean;
  /** Les livres plus profonds que la caisse y sont admis : calés au fond, ils dépassent devant. */
  overhang?: boolean;
  /** Livres à plat tournés de 90° vers la droite (la tranche ne regarde plus l'observateur). */
  flatTurn?: boolean;
};

export type IsbnConfidence = 'verifie' | 'bonne' | 'moyenne';

export type BookKind = 'roman' | 'bd' | 'documentaire' | 'guide' | 'dictionnaire' | 'autre';

export type Book = {
  id: Id;
  title: string;
  color: string;
  summary: string;
  /** Hauteur, épaisseur, profondeur (1 unité = 10 cm). */
  h: number;
  t: number;
  d: number;
  /** Caisse qui contient le livre, ou null pour la pile « à côté ». */
  crate: Id | null;
  /** Image de couverture : URL (ex. /covers/x.jpg) ou data URL d'une photo chargée. */
  cover?: string;
  author?: string;
  publisher?: string;
  year?: number;
  kind?: BookKind;
  /** ISBN tel qu'imprimé au dos (avec ou sans tirets). */
  isbn?: string;
  /** Nombre total de tomes de la série du livre (permet d'afficher les tomes manquants). */
  seriesTotal?: number;
  /** Nom de la série et numéro du tome, quand le titre ne les donne pas clairement (prioritaires sur le titre). */
  series?: string;
  /** Ne pas lister les tomes manquants de cette série (séries que l'on ne veut pas compléter). */
  skipMissing?: boolean;
  volume?: number;
  /** Fiabilité de l'ISBN : lu sur le livre (verifie), édition très probable (bonne) ou incertaine (moyenne). */
  isbnConfidence?: IsbnConfidence;
  /** Couleur du titre sur la tranche (sinon noir ou blanc selon le fond). */
  spineColor?: string;
};

/** Édition : on déplace et règle les caisses, on range les livres. Lecture : on ouvre et on lit,
 * rien ne bouge. */
export type Mode = 'edit' | 'view';

export type RotAxis = 'x' | 'y' | 'z';

export type CratePreset = 'tranche' | 'debout';

/** Décalage de la mésange par rapport à son perchoir (unités scène), réglé avec les flèches en Édition. */
export type DecorState = { mesange: { dx: number; dy: number; dz: number } };

export type SavedState = {
  crates: Crate[];
  books: Book[];
  messy: boolean;
};

/** Instantané de l'état du moteur, consommé par l'interface React. */
export type Snapshot = {
  crates: Crate[];
  books: Book[];
  messy: boolean;
  /** Premier chargement en cours : indicateur affiché, scène pas encore montrée. */
  loading: boolean;
  /** La base n'a pas pu être lue : l'interface propose de réessayer (rien n'est envoyé en attendant). */
  loadError: boolean;
  selectedId: Id | null;
  openId: Id | null;
  /** Face visible du livre sorti : couverture ou dos (résumé). */
  openSide: 'front' | 'back';
  /** Nombre de livres rangés par caisse. */
  counts: Record<Id, number>;
  stored: number;
  loose: number;
  full: number;
  /** Une action peut être annulée. */
  canUndo: boolean;
  /** Un livre est présenté depuis une recherche (parcours des résultats). */
  browsing: boolean;
  /** Il y a un livre précédent / suivant à ouvrir (voisins ou résultats de recherche). */
  hasPrev: boolean;
  hasNext: boolean;
  /** Défilé des tomes manquants en 3D : tome affiché (rang depuis le haut du tas) et nombre total. */
  missingBrowse: { label: string; index: number; total: number } | null;
  mode: Mode;
};
