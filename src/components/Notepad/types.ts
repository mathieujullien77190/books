/** Un message de la conversation avec Claude. */
export type AiTurn = {
  role: 'user' | 'assistant';
  content: string;
  /** Heure d'envoi (ms), affichée sous la bulle. */
  at?: number;
  /** Modifications faites par Claude pendant cette réponse (affichage seulement). */
  actions?: string[];
};

export type NotepadProps = {
  /** Claude a modifié la bibliothèque : la scène doit se recharger depuis la base. */
  onChanged?: () => void;
  /** Clic sur le lien d'un livre dans une réponse de Claude : l'afficher en 3D. */
  onOpenBook?: (id: string) => void;
  /** Ouvert dès l'affichage (feuille du téléphone) ; replié par défaut. */
  defaultOpen?: boolean;
  className?: string;
};
