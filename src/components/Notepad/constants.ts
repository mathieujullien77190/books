/** Clé localStorage de la clé API de la personne (propre à chaque navigateur). */
export const KEY_STORAGE = 'anthropic-api-key';

/** Modèles proposés (du moins cher au plus puissant) ; la clé est envoyée au serveur. */
export const MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'haiku', label: 'Haiku · économique' },
  { id: 'sonnet', label: 'Sonnet · équilibré' },
  { id: 'opus', label: 'Opus · le plus puissant' },
];

export const MODEL_STORAGE = 'ai-model';

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
