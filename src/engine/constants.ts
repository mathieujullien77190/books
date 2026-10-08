/**
 * Constantes du moteur : mésange, tas des livres manquants, vue de face et échelles du livre sorti.
 */
import * as THREE from 'three';

/** Caisse sur laquelle se perche la mésange, et retrait de son centre par rapport aux bords du dessus. */
/** Clé localStorage du mode léger (livres en pavés de couleur). */
export const LITE_KEY = 'lite-mode';

export const MESANGE_PERCH = 'P5';
export const MESANGE_MARGIN = 0.2;
/** Elle s'enfonce un peu dans le dessus de la caisse pour que ses pattes touchent le bois. */
export const MESANGE_SINK = 0.24;
/** Taille du volume autour duquel s'affichent les flèches, et pas d'un clic de flèche. */
export const MESANGE_REACH = { x: 0.8, y: 1.2, z: 0.8 };
export const MESANGE_STEP = 0.01;

/** Nombre de livres manquants par tas : une seule colonne (mettre un nombre pour la couper en plusieurs). */
export const GHOST_PILE = Infinity;

export const HOME_DIR = new THREE.Vector3(0, 0.12, 1).normalize(); // vue de face, à peine surélevée
/** Résolution des textures du livre sorti (1 = celle des livres rangés). */
export const OPEN_BOOK_SCALE = 2;
/** Taille des livres précédent / suivant présentés à côté du livre sorti. */
export const NEIGHBOR_SCALE = 0.6;

/** Délai avant l'envoi de l'état à la base après une modification (ms). */
export const SYNC_DELAY = 800;
/** Nombre maximal d'états gardés pour « Annuler ». */
export const HISTORY_MAX = 60;
