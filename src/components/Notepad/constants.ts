import type { NotepadStatus, NotepadTab } from './types';

/** Délai d'inactivité avant l'enregistrement des notes. */
export const SAVE_DELAY_MS = 800;

export const STATUS_TEXT: Record<NotepadStatus, string> = {
  loading: 'chargement…',
  saving: 'enregistrement…',
  saved: 'enregistré',
  offline: 'base injoignable',
};

export const TABS: { id: NotepadTab; label: string }[] = [
  { id: 'notes', label: 'Notes' },
  { id: 'ai', label: 'IA' },
];

/** Clé localStorage de la clé API de la personne (propre à chaque navigateur). */
export const KEY_STORAGE = 'anthropic-api-key';

/** Clé localStorage du jeton d'Édition (voir CratesApp/helpers.ts). */
export const EDIT_TOKEN_KEY = 'edit-token';

export const AI_ERRORS: Record<string, string> = {
  'no-db': 'La base n’est pas configurée : Claude ne peut pas consulter la bibliothèque.',
  'no-key': 'Colle ta clé API Anthropic pour interroger Claude.',
  'bad-key': 'Clé refusée par Anthropic : vérifie-la.',
  'rate-limit': 'Trop de demandes : réessaie dans un instant.',
  refusal: 'Claude a refusé de répondre à cette demande.',
  invalid: 'Demande invalide (trop longue ?).',
  api: 'Anthropic est indisponible pour le moment.',
  error: 'Erreur : la demande n’a pas abouti.',
};
